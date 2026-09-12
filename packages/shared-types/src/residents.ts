// Story 2.1: a home admin creates and manages resident profiles scoped to
// their own home. `dob` travels as an ISO-8601 date string over the wire
// (the API accepts/returns it that way — see apps/api's CreateResidentDto).

export interface Resident {
  id: string;
  homeId: string;
  name: string;
  room: string | null;
  dob: string | null;
  profilePhotoPublicId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResidentRequest {
  name: string;
  room?: string;
  dob?: string;
  profilePhotoPublicId?: string;
}

export interface UpdateResidentRequest {
  name?: string;
  room?: string;
  // null clears a previously-set dob; undefined/omitted leaves it untouched.
  dob?: string | null;
  profilePhotoPublicId?: string;
}

// Story 2.2: a family member linked to a resident, as shown on the admin
// portal's link-management surface (GET /residents/:residentId/family-links).
// Never the raw FamilyLink row's ids — just enough to identify who's linked.
export interface FamilyLinkedMember {
  id: string;
  email: string;
  name: string | null;
}

// Story 2.2 (AC #2): POST /residents/:residentId/family-links — admin picks
// an existing, already-active family member of their home to link.
export interface LinkFamilyMemberRequest {
  userId: string;
}

// Story 2.3 (AC #1, #2): a family member's own linked residents as returned
// by GET /residents/linked. A subset of `Resident`. Story 3.2 adds `homeId`
// — the News tab needs it to build the `X-Active-Home-Id` header for
// `/content`, since a family JWT carries no fixed home_id of its own (AD-18
// still holds for the caller's *own* home_id; a linked resident's home is
// not the same thing and is safe to disclose).
export interface LinkedResident {
  id: string;
  name: string;
  room: string | null;
  dob: string | null;
  profilePhotoPublicId: string | null;
  homeId: string;
  // The active-home header at the top of every mobile tab needs the home's
  // display name, not just its id.
  homeName: string;
}
