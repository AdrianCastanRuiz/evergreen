import { IsUUID } from 'class-validator';

// Story 2.2 (AC #2): admin picks an existing, already-active family member
// of their home (via GET /users, filtered client-side to role === 'family')
// to link to an additional resident.
export class LinkFamilyMemberDto {
  @IsUUID()
  userId!: string;
}
