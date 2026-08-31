import * as React from "react";
import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateResidentRequest,
  Resident,
  UpdateResidentRequest,
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
import { authedRequest, ApiError, NetworkError } from "@/lib/api";
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogResident(resident)}
                >
                  Edit
                </Button>
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
    </div>
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
