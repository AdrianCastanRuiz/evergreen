import * as React from "react";
import { Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  HomeUserSummary,
  InviteUserRequest,
  PendingUserResponse,
  UpdateUserRoleRequest,
} from "@evergreen/shared-types";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authedRequest } from "@/lib/api";
import { formatError } from "@/lib/format-error";

// Home admin's staff/family management (Story 1.12), split per-role into
// separate sidebar tabs — each of /staff and /family renders this same
// component with a fixed `role`, filtering the one shared GET /users
// response instead of issuing two separate list requests (the backend
// already returns both roles together — no API change needed).
const HOME_USERS_QUERY_KEY = ["users"] as const;

function listHomeUsers(): Promise<HomeUserSummary[]> {
  return authedRequest<HomeUserSummary[]>("/users");
}

function inviteUser(body: InviteUserRequest): Promise<PendingUserResponse> {
  return authedRequest<PendingUserResponse>("/users/invites", {
    method: "POST",
    body,
  });
}

function updateUserRole(
  id: string,
  body: UpdateUserRoleRequest,
): Promise<HomeUserSummary> {
  return authedRequest<HomeUserSummary>(`/users/${id}/role`, {
    method: "PATCH",
    body,
  });
}

function revokeUserAccess(id: string): Promise<void> {
  return authedRequest<void>(`/users/${id}`, { method: "DELETE" });
}

interface RoleUsersPanelProps {
  role: "staff" | "family";
  title: string;
}

export function RoleUsersPanel({ role, title }: RoleUsersPanelProps) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const usersQuery = useQuery({
    queryKey: HOME_USERS_QUERY_KEY,
    queryFn: listHomeUsers,
  });

  const roleUsers = usersQuery.data?.filter((u) => u.role === role);

  // Client-side only — the list is already fully fetched (GET /users has no
  // search param), and per-home staff/family counts are small enough that a
  // server round-trip per keystroke would be overkill.
  const normalizedSearch = search.trim().toLowerCase();
  const visibleUsers = normalizedSearch
    ? roleUsers?.filter(
        (u) =>
          u.email.toLowerCase().includes(normalizedSearch) ||
          (u.name ?? "").toLowerCase().includes(normalizedSearch),
      )
    : roleUsers;

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: HOME_USERS_QUERY_KEY });

  return (
    <div className="rounded-md border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">{title}</h1>
        {/* Stays visible on a transient list error too, same reasoning as
            residents.tsx's "Add a resident" button. */}
        {!usersQuery.isLoading &&
        (usersQuery.isError || (roleUsers && roleUsers.length > 0)) ? (
          <Button onClick={() => setInviteOpen(true)}>Invite {role}</Button>
        ) : null}
      </div>

      {roleUsers && roleUsers.length > 0 ? (
        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9 pr-3"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            aria-label={`Search ${title.toLowerCase()} by name or email`}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {usersQuery.isLoading ? (
          <p className="text-muted-foreground">Loading {title.toLowerCase()}…</p>
        ) : usersQuery.isError ? (
          <p className="text-destructive">Couldn't load {title.toLowerCase()}. Please try again.</p>
        ) : roleUsers && roleUsers.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border py-16 text-center">
            <p className="text-muted-foreground">No {title.toLowerCase()} yet</p>
            <Button onClick={() => setInviteOpen(true)}>Invite {role}</Button>
          </div>
        ) : visibleUsers && visibleUsers.length === 0 ? (
          <p className="text-muted-foreground">No matches for &quot;{search.trim()}&quot;.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visibleUsers?.map((homeUser) => (
              <HomeUserRow key={homeUser.id} homeUser={homeUser} onChanged={invalidateUsers} />
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!open) setInviteOpen(false);
        }}
      >
        <DialogContent>
          <InviteUserForm
            role={role}
            onInvited={() => {
              invalidateUsers();
              setInviteOpen(false);
            }}
            onCancel={() => setInviteOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface HomeUserRowProps {
  homeUser: HomeUserSummary;
  onChanged: () => void;
}

function HomeUserRow({ homeUser, onChanged }: HomeUserRowProps) {
  // Local, optimistic copy of the select's value — a plain
  // value={homeUser.role} controlled select would snap back to the old role
  // the instant onChange fires (the prop hasn't changed yet, only local
  // state would have), making every selection look like it silently
  // reverted until the invalidated query refetches. Synced from the prop on
  // every server-confirmed change, reverted on error. Switching this
  // dropdown moves the row to the other role's tab once the invalidated
  // query refetches — that's expected, not a bug.
  const [prevServerRole, setPrevServerRole] = React.useState(homeUser.role);
  const [role, setRole] = React.useState(homeUser.role);
  const [roleError, setRoleError] = React.useState<string | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);

  // Adjust state during render when the confirmed prop changes, rather than
  // in an effect (react-hooks/set-state-in-effect) — React's documented
  // pattern for this ("Adjusting state when a prop changes"). Calling
  // setState here is safe: it only fires when prevServerRole is stale, so it
  // settles within the same render pass instead of cascading.
  if (homeUser.role !== prevServerRole) {
    setPrevServerRole(homeUser.role);
    setRole(homeUser.role);
  }

  const roleMutation = useMutation({
    mutationFn: (nextRole: "staff" | "family") =>
      updateUserRole(homeUser.id, { role: nextRole }),
    onSuccess: onChanged,
    onError: (err: unknown) => {
      setRole(homeUser.role);
      setRoleError(formatError(err));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeUserAccess(homeUser.id),
    onSuccess: onChanged,
    onError: (err: unknown) => setRevokeError(formatError(err)),
  });

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[15px] font-medium text-foreground">
          {homeUser.name ?? homeUser.email}
        </p>
        <p className="text-sm text-muted-foreground">
          {homeUser.email} · {homeUser.isActive ? "Active" : "Pending"}
        </p>
        {roleError ? <p className="mt-1 text-sm text-destructive">{roleError}</p> : null}
        {revokeError ? <p className="mt-1 text-sm text-destructive">{revokeError}</p> : null}
      </div>

      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-sm border border-input bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          value={role}
          disabled={roleMutation.isPending || revokeMutation.isPending}
          onChange={(e) => {
            const nextRole = e.target.value as "staff" | "family";
            setRoleError(null);
            setRole(nextRole);
            roleMutation.mutate(nextRole);
          }}
          aria-label={`Role for ${homeUser.email}`}
        >
          <option value="staff">Staff</option>
          <option value="family">Family</option>
        </select>

        {/* Immediate, session-invalidating action — confirm first, same
            AlertDialog pattern top-nav.tsx uses for "Log out?". */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive text-destructive hover:bg-destructive/10"
              disabled={roleMutation.isPending || revokeMutation.isPending}
            >
              Revoke access
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke access?</AlertDialogTitle>
              <AlertDialogDescription>
                {homeUser.email} will lose access to this home immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => revokeMutation.mutate()}>
                Revoke access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

interface InviteUserFormProps {
  role: "staff" | "family";
  onInvited: () => void;
  onCancel: () => void;
}

function InviteUserForm({ role, onInvited, onCancel }: InviteUserFormProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      inviteUser({ email: email.trim(), role, name: name.trim() || undefined }),
    onSuccess: onInvited,
    onError: (err: unknown) => setError(formatError(err)),
  });

  const emailError =
    emailTouched && email.trim().length === 0 ? "Email is required" : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mutation.isPending) return;
    setEmailTouched(true);
    if (email.trim().length === 0) return;
    setError(null);
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>Invite {role}</DialogTitle>
      </DialogHeader>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="invite-name">Name</Label>
          <Input
            id="invite-name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            disabled={mutation.isPending}
            maxLength={255}
          />
        </div>

        <div>
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            className="mt-1"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            disabled={mutation.isPending}
          />
          {emailError ? <p className="mt-1 text-sm text-destructive">{emailError}</p> : null}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Sending…" : "Send invite"}
        </Button>
      </DialogFooter>
    </form>
  );
}
