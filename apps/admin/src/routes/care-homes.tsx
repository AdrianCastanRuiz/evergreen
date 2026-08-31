import * as React from "react";
import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateHomeRequest,
  Home,
  UpdateHomeRequest,
} from "@evergreen/shared-types";

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
import { protectedLayoutRoute } from "@/routes/protected-layout";

// Story 1.2: a super admin creates and manages care homes on the platform.
// Backend shipped early in Epic 1 (apps/api/src/homes) — this route is the
// first frontend for it. Follows the same shape as Story 2.1's
// residents.tsx (the only other real screen in this app).
export const careHomesRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/care-homes",
  component: CareHomesPage,
});

const CARE_HOMES_QUERY_KEY = ["care-homes"] as const;

function listHomes(): Promise<Home[]> {
  return authedRequest<Home[]>("/homes");
}

function createHome(body: CreateHomeRequest): Promise<Home> {
  return authedRequest<Home>("/homes", { method: "POST", body });
}

function updateHome(id: string, body: UpdateHomeRequest): Promise<Home> {
  return authedRequest<Home>(`/homes/${id}`, { method: "PATCH", body });
}

function CareHomesPage() {
  const { user } = useAuth();

  // protected-layout.tsx already guarantees status === "authenticated" by
  // the time this renders — a null user here means the post-login /auth/me
  // fetch hasn't resolved yet or glitched (auth.tsx's signIn catch sets
  // user: null without reverting status), NOT a permission denial. Don't
  // show "you don't have access" for a state that isn't actually that
  // (Review Finding, patch).
  if (!user) {
    return <p className="p-6 text-muted-foreground">Loading your account…</p>;
  }

  // Client-side UX only (AC #4, UX-DR25) — the backend's @Roles('super_admin')
  // on HomesController is what actually enforces this (AD-12/NFR7). No
  // gating added to protected-layout.tsx or any other route; this screen
  // guards only itself, same scope discipline Story 2.1 used for the
  // sidebar's role list.
  if (user.role !== "super_admin") {
    return <PermissionDenied />;
  }

  return <CareHomesList />;
}

function CareHomesList() {
  const queryClient = useQueryClient();
  const [dialogHome, setDialogHome] = React.useState<Home | "new" | null>(
    null,
  );

  const homesQuery = useQuery({
    queryKey: CARE_HOMES_QUERY_KEY,
    queryFn: listHomes,
  });

  const invalidateHomes = () =>
    queryClient.invalidateQueries({ queryKey: CARE_HOMES_QUERY_KEY });

  const closeDialog = () => setDialogHome(null);

  return (
    <div className="rounded-md border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Care homes
        </h1>
        {!homesQuery.isLoading &&
        (homesQuery.isError ||
          (homesQuery.data && homesQuery.data.length > 0)) ? (
          <Button onClick={() => setDialogHome("new")}>Add a care home</Button>
        ) : null}
      </div>

      <div className="mt-6">
        {homesQuery.isLoading ? (
          <p className="text-muted-foreground">Loading care homes…</p>
        ) : homesQuery.isError ? (
          <p className="text-destructive">
            Couldn't load care homes. Please try again.
          </p>
        ) : homesQuery.data && homesQuery.data.length === 0 ? (
          // Generic UX-DR22 pattern ("No [x] yet" + one primary action) — not
          // one of the named copy variants (Residents, Photos, Events, News).
          <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border py-16 text-center">
            <p className="text-muted-foreground">No care homes yet</p>
            <Button onClick={() => setDialogHome("new")}>Add a care home</Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {homesQuery.data?.map((home) => (
              <li
                key={home.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-[15px] font-medium text-foreground">
                    {home.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[home.address, home.timezone].filter(Boolean).join(" · ") ||
                      "No details yet"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogHome(home)}
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={dialogHome !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          {dialogHome ? (
            <CareHomeForm
              home={dialogHome === "new" ? null : dialogHome}
              onSaved={() => {
                invalidateHomes();
                closeDialog();
              }}
              onCancel={closeDialog}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CareHomeFormProps {
  home: Home | null;
  onSaved: () => void;
  onCancel: () => void;
}

function CareHomeForm({ home, onSaved, onCancel }: CareHomeFormProps) {
  const isEditing = home !== null;
  const [name, setName] = React.useState(home?.name ?? "");
  const [address, setAddress] = React.useState(home?.address ?? "");
  // Default to Ireland's zone on create — most homes onboarded so far are
  // Irish; editing an existing home always keeps its own stored value.
  const [timezone, setTimezone] = React.useState(
    home?.timezone ?? "Europe/Dublin",
  );
  const [nameTouched, setNameTouched] = React.useState(false);
  const [timezoneTouched, setTimezoneTouched] = React.useState(false);
  // AC #2/UX-DR28: field-level errors, kept separate from the generic
  // `error` banner so a 409 (duplicate name) or a 400 (invalid timezone)
  // renders inline on the offending field instead of a top-of-form message.
  const [nameServerError, setNameServerError] = React.useState<string | null>(
    null,
  );
  const [timezoneServerError, setTimezoneServerError] = React.useState<
    string | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const trimmedAddress = address.trim();
      if (isEditing) {
        // null explicitly clears a previously-set address; undefined would
        // omit the field and leave it untouched server-side — not what a
        // blanked-out field means here (Review Finding, decision: fixed
        // properly, mirrors Story 2.1's dob: null fix).
        const body: UpdateHomeRequest = {
          name: name.trim(),
          address: trimmedAddress === "" ? null : trimmedAddress,
          timezone: timezone.trim(),
        };
        return updateHome(home.id, body);
      }
      const body: CreateHomeRequest = {
        name: name.trim(),
        address: trimmedAddress || undefined,
        timezone: timezone.trim(),
      };
      return createHome(body);
    },
    onSuccess: onSaved,
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Home.name is the only unique constraint on this model — a 409
          // here always means the name conflict (AC #2).
          setNameServerError(err.message || "A home with this name already exists");
          return;
        }
        if (err.status === 400) {
          // CreateHomeDto/UpdateHomeDto validate name/address length and
          // timezone (must be a real IANA zone). The name/address inputs
          // below carry maxLength={255}/{500} matching the backend's own
          // @MaxLength decorators (Review Finding, patch), so in practice a
          // 400 that still reaches here can only be the timezone value —
          // the length caps are enforced before the request is ever sent.
          // NestJS's default ValidationPipe returns `message` as a
          // string[], which api.ts's ApiError currently only surfaces as
          // the request's statusText fallback ("Bad Request"), not the
          // actual validation detail — a shared gap in api.ts's error
          // parsing, not specific to this screen (deferred-work.md).
          setTimezoneServerError(
            "Please enter a valid IANA timezone, e.g. Europe/Madrid.",
          );
          return;
        }
        setError(err.message || "Something went wrong. Please try again.");
      } else if (err instanceof NetworkError) {
        setError("No network connection. Check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
  });

  const nameError =
    nameServerError ??
    (nameTouched && name.trim().length === 0 ? "Name is required" : null);
  const timezoneError =
    timezoneServerError ??
    (timezoneTouched && timezone.trim().length === 0
      ? "Timezone is required"
      : null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Synchronous re-entrancy guard (same as ResidentForm) — a fast
    // double-click can fire a second submit before the `disabled` prop's
    // re-render lands.
    if (mutation.isPending) return;
    setNameTouched(true);
    setTimezoneTouched(true);
    if (name.trim().length === 0 || timezone.trim().length === 0) return;
    setError(null);
    setNameServerError(null);
    setTimezoneServerError(null);
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit care home" : "Add a care home"}</DialogTitle>
      </DialogHeader>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="home-name">Name</Label>
          <Input
            id="home-name"
            className="mt-1"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameServerError(null);
            }}
            onBlur={() => setNameTouched(true)}
            autoFocus
            disabled={mutation.isPending}
            maxLength={255}
          />
          {nameError ? <p className="mt-1 text-sm text-destructive">{nameError}</p> : null}
        </div>

        <div>
          <Label htmlFor="home-address">Address</Label>
          <Input
            id="home-address"
            className="mt-1"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={mutation.isPending}
            placeholder="Optional"
            maxLength={500}
          />
        </div>

        <div>
          <Label htmlFor="home-timezone">Timezone</Label>
          <Input
            id="home-timezone"
            className="mt-1"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setTimezoneServerError(null);
            }}
            onBlur={() => setTimezoneTouched(true)}
            disabled={mutation.isPending}
            placeholder="e.g. Europe/Madrid"
          />
          {timezoneError ? (
            <p className="mt-1 text-sm text-destructive">{timezoneError}</p>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <DialogFooter className="mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
