import * as React from "react";
import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSuperAdminRequest,
  HomeUserSummary,
  InviteHomeAdminRequest,
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
import { PermissionDenied } from "@/components/permission-denied";
import { authedRequest, ApiError, NetworkError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CARE_HOMES_QUERY_KEY, listHomes } from "@/routes/care-homes";
import { protectedLayoutRoute } from "@/routes/protected-layout";

// Story 1.15: consolidates the never-built apps/admin frontend for Stories
// 1.3 (super_admin invites a home admin), 1.4 (super_admin creates another
// super_admin), 1.5 (admin/staff invites staff/family into their home), and
// 1.12 (admin lists/re-roles/revokes their home's staff/family users). All
// four backends are done and untouched by this story — see
// apps/api/src/users/{users.controller,users.service}.ts and
// apps/api/src/homes/homes.controller.ts's POST /:id/admins.
export const usersRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/users",
  component: UsersPage,
});

const SELECT_CLASSNAME =
  "flex h-11 w-full rounded-sm border border-input bg-background px-3 py-2 text-[15px] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message || "Something went wrong. Please try again.";
  }
  if (err instanceof NetworkError) {
    return "No network connection. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

function UsersPage() {
  const { user } = useAuth();

  // Same distinction care-homes.tsx makes (Review Finding on that story): a
  // null user here means the post-login /auth/me fetch hasn't resolved yet,
  // not a permission denial.
  if (!user) {
    return <p className="p-6 text-muted-foreground">Loading your account…</p>;
  }

  if (user.role === "super_admin") return <SuperAdminUsersPanel />;
  if (user.role === "admin") return <HomeAdminUsersPanel />;
  // Client-side UX only — sidebar-nav.tsx already hides this route from
  // staff/family, but a stale link should still land on a real message, not
  // a blank/broken screen (UX-DR25). The API's own @Roles guards are what
  // actually enforce this either way.
  return <PermissionDenied />;
}

// ---------------------------------------------------------------------------
// Super admin panel — two independent create actions, not a list. There is
// no "list all platform users" endpoint (FR48/FR49 are create-only) — don't
// invent one.
// ---------------------------------------------------------------------------

function inviteHomeAdmin(
  homeId: string,
  body: InviteHomeAdminRequest,
): Promise<PendingUserResponse> {
  return authedRequest<PendingUserResponse>(`/homes/${homeId}/admins`, {
    method: "POST",
    body,
  });
}

function createSuperAdmin(
  body: CreateSuperAdminRequest,
): Promise<PendingUserResponse> {
  return authedRequest<PendingUserResponse>("/users/super-admins", {
    method: "POST",
    body,
  });
}

function SuperAdminUsersPanel() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">Users</h1>
      <InviteHomeAdminCard />
      <CreateSuperAdminCard />
    </div>
  );
}

function InviteHomeAdminCard() {
  const homesQuery = useQuery({ queryKey: CARE_HOMES_QUERY_KEY, queryFn: listHomes });
  const [homeId, setHomeId] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      inviteHomeAdmin(homeId, {
        email: email.trim(),
        name: name.trim() || undefined,
      }),
    onSuccess: (result) => {
      setSuccess(`Invite sent to ${result.email}.`);
      setName("");
      setEmail("");
    },
    onError: (err: unknown) => setError(formatError(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Same synchronous re-entrancy guard as residents.tsx/care-homes.tsx —
    // a fast double-click can fire a second submit before `disabled` re-renders.
    if (mutation.isPending) return;
    setError(null);
    setSuccess(null);
    if (!homeId || email.trim().length === 0) return;
    mutation.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-md border border-border bg-card p-6"
    >
      <h2 className="font-heading text-lg font-semibold text-foreground">
        Invite a home admin
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sends a one-time activation link to manage the selected care home.
      </p>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="home-admin-home">Care home</Label>
          <select
            id="home-admin-home"
            className={`mt-1 ${SELECT_CLASSNAME}`}
            value={homeId}
            onChange={(e) => setHomeId(e.target.value)}
            disabled={mutation.isPending || homesQuery.isLoading || homesQuery.isError}
          >
            <option value="" disabled>
              {homesQuery.isLoading
                ? "Loading homes…"
                : homesQuery.isError
                  ? "Couldn't load homes"
                  : "Select a home"}
            </option>
            {homesQuery.data?.map((home) => (
              <option key={home.id} value={home.id}>
                {home.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <Label htmlFor="home-admin-name">Name</Label>
          <Input
            id="home-admin-name"
            className="mt-1"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSuccess(null);
            }}
            disabled={mutation.isPending}
            maxLength={255}
          />
        </div>

        <div className="flex-1">
          <Label htmlFor="home-admin-email">Email</Label>
          <Input
            id="home-admin-email"
            className="mt-1"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSuccess(null);
            }}
            disabled={mutation.isPending}
          />
        </div>

        <Button type="submit" disabled={mutation.isPending || !homeId}>
          {mutation.isPending ? "Sending…" : "Send invite"}
        </Button>
      </div>

      {homesQuery.isError ? (
        <p className="mt-3 text-sm text-destructive">
          Couldn't load care homes. Please try again.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-foreground">{success}</p> : null}
    </form>
  );
}

function CreateSuperAdminCard() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createSuperAdmin({ email: email.trim(), name: name.trim() || undefined }),
    onSuccess: (result) => {
      setSuccess(`Invite sent to ${result.email}.`);
      setName("");
      setEmail("");
    },
    onError: (err: unknown) => setError(formatError(err)),
  });

  // Highest-privilege action on this screen (platform-wide access, no home
  // scope) — gets the same confirm-before-acting step "Revoke access"
  // already requires, instead of firing on a single click (Review Finding).
  const openConfirm = () => {
    if (mutation.isPending) return;
    setError(null);
    setSuccess(null);
    if (email.trim().length === 0) return;
    setConfirmOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    openConfirm();
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-md border border-border bg-card p-6"
    >
      <h2 className="font-heading text-lg font-semibold text-foreground">
        Create a super admin
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Platform-level access, not scoped to any single care home.
      </p>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="super-admin-name">Name</Label>
          <Input
            id="super-admin-name"
            className="mt-1"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSuccess(null);
            }}
            disabled={mutation.isPending}
            maxLength={255}
          />
        </div>
        <div className="flex-1">
          <Label htmlFor="super-admin-email">Email</Label>
          <Input
            id="super-admin-email"
            className="mt-1"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSuccess(null);
            }}
            disabled={mutation.isPending}
          />
        </div>
        <Button type="button" onClick={openConfirm} disabled={mutation.isPending}>
          {mutation.isPending ? "Sending…" : "Send invite"}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-foreground">{success}</p> : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a super admin?</AlertDialogTitle>
            <AlertDialogDescription>
              {email.trim()} will get full platform-wide access, not scoped to
              any single care home.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()}>
              Create super admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Home admin panel — list + invite + role change + revoke, all scoped
// server-side to the caller's own home (Story 1.12). No home selector
// anywhere here: there is nothing for this client to scope, the API
// resolves it from the caller's own JWT regardless of what's sent.
// ---------------------------------------------------------------------------

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

function HomeAdminUsersPanel() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const usersQuery = useQuery({
    queryKey: HOME_USERS_QUERY_KEY,
    queryFn: listHomeUsers,
  });

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: HOME_USERS_QUERY_KEY });

  return (
    <div className="rounded-md border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Users</h1>
        {/* Stays visible on a transient list error too, same reasoning as
            residents.tsx's "Add a resident" button. */}
        {!usersQuery.isLoading &&
        (usersQuery.isError ||
          (usersQuery.data && usersQuery.data.length > 0)) ? (
          <Button onClick={() => setInviteOpen(true)}>Invite a user</Button>
        ) : null}
      </div>

      <div className="mt-6">
        {usersQuery.isLoading ? (
          <p className="text-muted-foreground">Loading users…</p>
        ) : usersQuery.isError ? (
          <p className="text-destructive">Couldn't load users. Please try again.</p>
        ) : usersQuery.data && usersQuery.data.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border py-16 text-center">
            <p className="text-muted-foreground">No users yet</p>
            <Button onClick={() => setInviteOpen(true)}>Invite a user</Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {usersQuery.data?.map((homeUser) => (
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
  // every server-confirmed change, reverted on error.
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
  onInvited: () => void;
  onCancel: () => void;
}

function InviteUserForm({ onInvited, onCancel }: InviteUserFormProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"staff" | "family">("staff");
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
        <DialogTitle>Invite a user</DialogTitle>
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

        <div>
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            className={`mt-1 ${SELECT_CLASSNAME}`}
            value={role}
            onChange={(e) => setRole(e.target.value as "staff" | "family")}
            disabled={mutation.isPending}
          >
            <option value="staff">Staff</option>
            <option value="family">Family</option>
          </select>
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
