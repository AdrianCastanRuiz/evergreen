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
// by GET /residents/linked. Deliberately a subset of `Resident` — no homeId
// echoed back to a caller who may belong to several homes (AD-18). What the
// family Home screen card needs and nothing more.
export interface LinkedResident {
  id: string;
  name: string;
  room: string | null;
  dob: string | null;
  profilePhotoPublicId: string | null;
}
