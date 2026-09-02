import * as React from "react";
import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CreateSuperAdminRequest,
  InviteHomeAdminRequest,
  PendingUserResponse,
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionDenied } from "@/components/permission-denied";
import { authedRequest } from "@/lib/api";
import { formatError } from "@/lib/format-error";
import { useAuth } from "@/lib/auth";
import { CARE_HOMES_QUERY_KEY, listHomes } from "@/routes/care-homes";
import { protectedLayoutRoute } from "@/routes/protected-layout";

// Super_admin's own account-management screen (Stories 1.3/1.4: invite a
// home admin, create another super admin). A home admin's staff/family
// management lives at the dedicated /staff and /family routes instead
// (components/role-users-panel.tsx) — see sidebar-nav.tsx.
export const usersRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/users",
  component: UsersPage,
});

const SELECT_CLASSNAME =
  "flex h-11 w-full rounded-sm border border-input bg-background px-3 py-2 text-[15px] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function UsersPage() {
  const { user } = useAuth();

  // Same distinction care-homes.tsx makes (Review Finding on that story): a
  // null user here means the post-login /auth/me fetch hasn't resolved yet,
  // not a permission denial.
  if (!user) {
    return <p className="p-6 text-muted-foreground">Loading your account…</p>;
  }

  if (user.role === "super_admin") return <SuperAdminUsersPanel />;
  // Client-side UX only — sidebar-nav.tsx already hides this route from
  // every other role, but a stale link should still land on a real message,
  // not a blank/broken screen (UX-DR25). The API's own @Roles guards are
  // what actually enforce this either way.
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
