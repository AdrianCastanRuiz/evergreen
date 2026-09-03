import * as React from "react";
import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateResidentRequest,
  FamilyLinkedMember,
  HomeUserSummary,
  LinkFamilyMemberRequest,
  Resident,
  UpdateResidentRequest,
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
import { authedRequest, ApiError, NetworkError } from "@/lib/api";
import { formatError } from "@/lib/format-error";
import { protectedLayoutRoute } from "@/routes/protected-layout";

// Story 2.1: home admin creates/lists/edits resident profiles for their own
// home. The API auto-scopes every /residents call to the caller's home_id
// (ResidentsService, tenant-scoping extension) — no home id is ever sent
// from this client.
export const residentsRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/residents",
  component: ResidentsPage,
});

const RESIDENTS_QUERY_KEY = ["residents"] as const;

function listResidents(): Promise<Resident[]> {
  return authedRequest<Resident[]>("/residents");
}

function createResident(body: CreateResidentRequest): Promise<Resident> {
  return authedRequest<Resident>("/residents", { method: "POST", body });
}

function updateResident(
  id: string,
  body: UpdateResidentRequest,
): Promise<Resident> {
  return authedRequest<Resident>(`/residents/${id}`, {
    method: "PATCH",
    body,
  });
}

// Story 2.2 (Task 5): link-management surface only — the invite-a-family
// screen (with its own resident picker) is tracked separately, per the
// Epic 1 retro decision that this story's frontend scope stays narrowed to
// managing links for already-active family members.
function listFamilyLinks(residentId: string): Promise<FamilyLinkedMember[]> {
  return authedRequest<FamilyLinkedMember[]>(
    `/residents/${residentId}/family-links`,
  );
}

function linkFamilyMember(residentId: string, userId: string): Promise<void> {
  const body: LinkFamilyMemberRequest = { userId };
  return authedRequest<void>(`/residents/${residentId}/family-links`, {
    method: "POST",
    body,
  });
}

function unlinkFamilyMember(residentId: string, userId: string): Promise<void> {
  return authedRequest<void>(`/residents/${residentId}/family-links/${userId}`, {
    method: "DELETE",
  });
}

// Reused as-is from role-users-panel.tsx's pattern: GET /users already
// returns every staff+family user in the caller's home in one call, so this
// filters client-side rather than adding a second, parallel endpoint.
function listHomeUsers(): Promise<HomeUserSummary[]> {
  return authedRequest<HomeUserSummary[]>("/users");
}

function formatDob(dob: string | null): string | null {
  if (!dob) return null;
  // dob travels as an ISO-8601 date string (YYYY-MM-DD) — display only the
  // date part regardless of any time component the API might return.
  return dob.slice(0, 10);
}

function ResidentsPage() {
  const queryClient = useQueryClient();
  const [dialogResident, setDialogResident] = React.useState<
    Resident | "new" | null
  >(null);
  const [familyLinksResident, setFamilyLinksResident] =
    React.useState<Resident | null>(null);

  const residentsQuery = useQuery({
    queryKey: RESIDENTS_QUERY_KEY,
    queryFn: listResidents,
  });

  const invalidateResidents = () =>
    queryClient.invalidateQueries({ queryKey: RESIDENTS_QUERY_KEY });

  const closeDialog = () => setDialogResident(null);

  return (
    <div className="rounded-md border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Residents
        </h1>
        {/* Review Finding (patch): must stay visible on a transient list
            error too — losing the ability to add a resident just because
            the list failed to load once is a needless dead end. */}
        {!residentsQuery.isLoading &&
        (residentsQuery.isError ||
          (residentsQuery.data && residentsQuery.data.length > 0)) ? (
          <Button onClick={() => setDialogResident("new")}>Add a resident</Button>
        ) : null}
      </div>

      <div className="mt-6">
        {residentsQuery.isLoading ? (
          <p className="text-muted-foreground">Loading residents…</p>
        ) : residentsQuery.isError ? (
          <p className="text-destructive">
            Couldn't load residents. Please try again.
          </p>
        ) : residentsQuery.data && residentsQuery.data.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border py-16 text-center">
            <p className="text-muted-foreground">No residents yet</p>
            <Button onClick={() => setDialogResident("new")}>Add a resident</Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {residentsQuery.data?.map((resident) => (
              <li
                key={resident.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-[15px] font-medium text-foreground">
                    {resident.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[resident.room ? `Room ${resident.room}` : null, formatDob(resident.dob)]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFamilyLinksResident(resident)}
                  >
                    Family links
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialogResident(resident)}
                  >
                    Edit
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={dialogResident !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          {dialogResident ? (
            <ResidentForm
              resident={dialogResident === "new" ? null : dialogResident}
              onSaved={() => {
                invalidateResidents();
                closeDialog();
              }}
              onCancel={closeDialog}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={familyLinksResident !== null}
        onOpenChange={(open) => {
          if (!open) setFamilyLinksResident(null);
        }}
      >
        <DialogContent>
          {familyLinksResident ? (
            <FamilyLinksPanel resident={familyLinksResident} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Story 2.2 (AC #2, #5): link an already-active family member of this home
// to `resident`, or remove one of their existing links — enforced
// server-side by FamilyResidentGuard the moment a link is removed (AD-11).
// Building the invite-a-family-member screen itself (with its own
// resident-picker at invite time, AC #1) is separately tracked scope.
interface FamilyLinksPanelProps {
  resident: Resident;
}

function FamilyLinksPanel({ resident }: FamilyLinksPanelProps) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [removeError, setRemoveError] = React.useState<string | null>(null);

  const linksQueryKey = ["residents", resident.id, "family-links"] as const;
  const linksQuery = useQuery({
    queryKey: linksQueryKey,
    queryFn: () => listFamilyLinks(resident.id),
  });
  // GET /users already returns every staff+family user in this home — the
  // same query key role-users-panel.tsx uses, so switching between the two
  // screens doesn't trigger a redundant refetch.
  const usersQuery = useQuery({
    queryKey: ["users"] as const,
    queryFn: listHomeUsers,
  });

  const invalidateLinks = () =>
    queryClient.invalidateQueries({ queryKey: linksQueryKey });

  const linkMutation = useMutation({
    mutationFn: (userId: string) => linkFamilyMember(resident.id, userId),
    onSuccess: () => {
      setSelectedUserId("");
      setLinkError(null);
      invalidateLinks();
    },
    onError: (err: unknown) => setLinkError(formatError(err)),
  });

  const unlinkMutation = useMutation({
    mutationFn: (userId: string) => unlinkFamilyMember(resident.id, userId),
    onSuccess: () => {
      setRemoveError(null);
      invalidateLinks();
    },
    onError: (err: unknown) => setRemoveError(formatError(err)),
  });

  const linkedIds = new Set((linksQuery.data ?? []).map((l) => l.id));
  const availableFamilyUsers = (usersQuery.data ?? []).filter(
    (u) => u.role === "family" && u.isActive && !linkedIds.has(u.id),
  );

  const handleLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkMutation.isPending || !selectedUserId) return;
    linkMutation.mutate(selectedUserId);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Family links — {resident.name}</DialogTitle>
      </DialogHeader>

      <div className="mt-4">
        {linksQuery.isLoading ? (
          <p className="text-muted-foreground">Loading linked family…</p>
        ) : linksQuery.isError ? (
          <p className="text-destructive">
            Couldn't load family links. Please try again.
          </p>
        ) : linksQuery.data && linksQuery.data.length === 0 ? (
          <p className="text-muted-foreground">No family members linked yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {linksQuery.data?.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {member.name ?? member.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      disabled={unlinkMutation.isPending}
                    >
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this family link?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {member.name ?? member.email} will immediately lose
                        access to {resident.name}&apos;s data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => unlinkMutation.mutate(member.id)}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
        {removeError ? (
          <p className="mt-2 text-sm text-destructive">{removeError}</p>
        ) : null}
      </div>

      <form onSubmit={handleLink} className="mt-6 border-t border-border pt-4">
        <Label htmlFor="family-link-select">Link an existing family member</Label>
        <div className="mt-1 flex items-center gap-2">
          <select
            id="family-link-select"
            className="flex h-11 w-full rounded-sm border border-input bg-background px-3 py-2 text-[15px] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={usersQuery.isLoading || usersQuery.isError || linkMutation.isPending}
          >
            <option value="">
              {availableFamilyUsers.length === 0
                ? "No available family members"
                : "Select a family member…"}
            </option>
            {availableFamilyUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={linkMutation.isPending || !selectedUserId}>
            {linkMutation.isPending ? "Linking…" : "Link"}
          </Button>
        </div>
        {/* Review finding: without this branch, a failed GET /users looked
            identical to "no family members available" — the select just
            silently offered nothing, with no indication anything was wrong. */}
        {usersQuery.isError ? (
          <p className="mt-2 text-sm text-destructive">
            Couldn't load family members. Please try again.
          </p>
        ) : linkError ? (
          <p className="mt-2 text-sm text-destructive">{linkError}</p>
        ) : null}
      </form>
    </>
  );
}

interface ResidentFormProps {
  resident: Resident | null;
  onSaved: () => void;
  onCancel: () => void;
}

function ResidentForm({ resident, onSaved, onCancel }: ResidentFormProps) {
  const isEditing = resident !== null;
  const [name, setName] = React.useState(resident?.name ?? "");
  const [room, setRoom] = React.useState(resident?.room ?? "");
  const [dob, setDob] = React.useState(formatDob(resident?.dob ?? null) ?? "");
  const [profilePhotoPublicId, setProfilePhotoPublicId] = React.useState(
    resident?.profilePhotoPublicId ?? "",
  );
  const [nameTouched, setNameTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body: CreateResidentRequest = {
        name: name.trim(),
        room: room.trim() || undefined,
        dob: dob || undefined,
        profilePhotoPublicId: profilePhotoPublicId.trim() || undefined,
      };
      return isEditing ? updateResident(resident.id, body) : createResident(body);
    },
    onSuccess: onSaved,
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.message || "Something went wrong. Please try again.");
      } else if (err instanceof NetworkError) {
        setError("No network connection. Check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
  });

  const nameError = nameTouched && name.trim().length === 0 ? "Name is required" : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Review Finding (patch): synchronous re-entrancy guard — a fast
    // double-click can fire a second submit before the `disabled` prop's
    // re-render lands, causing a duplicate POST /residents.
    if (mutation.isPending) return;
    setNameTouched(true);
    if (name.trim().length === 0) return;
    setError(null);
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit resident" : "Add a resident"}</DialogTitle>
      </DialogHeader>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="resident-name">Name</Label>
          <Input
            id="resident-name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            autoFocus
            disabled={mutation.isPending}
          />
          {nameError ? <p className="mt-1 text-sm text-destructive">{nameError}</p> : null}
        </div>

        <div>
          <Label htmlFor="resident-room">Room</Label>
          <Input
            id="resident-room"
            className="mt-1"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>

        <div>
          <Label htmlFor="resident-dob">Date of birth</Label>
          <Input
            id="resident-dob"
            className="mt-1"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>

        <div>
          <Label htmlFor="resident-photo">Profile photo ID</Label>
          <Input
            id="resident-photo"
            className="mt-1"
            value={profilePhotoPublicId}
            onChange={(e) => setProfilePhotoPublicId(e.target.value)}
            disabled={mutation.isPending}
            placeholder="Optional — set later from Photos"
          />
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
