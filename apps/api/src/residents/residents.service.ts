import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Resident } from '../../generated/prisma';
import { Prisma } from '../../generated/prisma';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResidentDto } from './dto/create-resident.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';

// Story 2.2 (Task 4): shape returned by GET /residents/:residentId/family-links
// — just enough for the admin UI to show who's linked and offer to remove
// them. Never the raw FamilyLink row (which carries ids the UI has no use
// for) or the User row (passwordHash must never leak, same rule as
// PendingUserResponse elsewhere).
export interface LinkedFamilyMember {
  id: string;
  email: string;
  name: string | null;
}

// Story 2.1: `Resident` is already in TENANT_SCOPED_MODELS
// (apps/api/src/prisma/tenant-scoped-models.ts), so every call below is
// auto-scoped to the caller's home_id by the tenant-scoping Prisma
// extension — no manual home_id filtering here, same shape as
// UsersController's home-admin routes.
@Injectable()
export class ResidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  create(dto: CreateResidentDto): Promise<Resident> {
    return this.prisma.client.resident.create({
      data: {
        // Required by Prisma's generated (Unchecked)CreateInput type for a
        // relation scalar; the tenant-scoping extension overwrites this with
        // the same value at runtime regardless (injectHomeId always wins —
        // see tenant-scoping.extension.ts), same explicit-but-redundant
        // convention as UsersService.createPendingHomeAdmin's
        // homeMembership.create call. Safe non-null read: ResidentsController
        // calls assertHomeContext() before every service method.
        homeId: this.tenantContext.getHomeId()!,
        name: dto.name,
        room: dto.room,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        profilePhotoPublicId: dto.profilePhotoPublicId,
      },
    });
  }

  findAll(): Promise<Resident[]> {
    return this.prisma.client.resident.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Resident> {
    const resident = await this.prisma.client.resident.findUnique({
      where: { id },
    });
    // Auto-scoped by the tenant extension — a resident id from another home
    // resolves to null here, never another home's row (AC #4).
    if (!resident) throw new NotFoundException('Resident not found');
    return resident;
  }

  async update(id: string, dto: UpdateResidentDto): Promise<Resident> {
    await this.findOne(id);
    return this.prisma.client.resident.update({
      where: { id },
      data: {
        name: dto.name,
        room: dto.room,
        // Distinguishes "field not sent" (undefined — leave alone) from
        // "clear this field" (null — explicit) (Review Finding, patch): the
        // create() line below stays `dto.dob ? ... : undefined` on purpose —
        // there's no previous value to clear on create.
        dob:
          dto.dob === undefined
            ? undefined
            : dto.dob === null
              ? null
              : new Date(dto.dob),
        profilePhotoPublicId: dto.profilePhotoPublicId,
      },
    });
  }

  // Story 2.2 (AC #2, #4): links an already-active family member of the
  // caller's own home to an additional resident, without disturbing any
  // FamilyLink they already hold elsewhere. findOne() 404s a cross-home
  // residentId before either write below runs.
  async linkFamilyMember(residentId: string, userId: string): Promise<void> {
    await this.findOne(residentId);

    // Auto-scoped by the tenant-scoping extension to the caller's home — a
    // family user of a different home never matches, same non-revealing
    // 404 UsersService.resolveManageableMembership uses for the analogous
    // "staff picks a user from GET /users" case. Review finding: HomeMembership
    // has no active/pending status of its own (that lives on User.isActive) —
    // a still-pending invite already has a membership row, so without this
    // include+check, "link an already-active family member" (AC #2) would
    // silently also accept a not-yet-activated invitee.
    const membership = await this.prisma.client.homeMembership.findFirst({
      where: { userId, role: 'family' },
      include: { user: { select: { isActive: true } } },
    });
    if (!membership || !membership.user.isActive) {
      throw new NotFoundException('User not found in your home');
    }

    try {
      await this.prisma.client.familyLink.create({
        data: {
          userId,
          residentId,
          homeId: this.tenantContext.getHomeId()!,
        },
      });
    } catch (error) {
      throw this.mapUniqueFamilyLinkViolation(error);
    }
  }

  // Story 2.2 (Task 4): family members currently linked to this resident,
  // for the admin UI's "remove a link" surface.
  async listFamilyLinks(residentId: string): Promise<LinkedFamilyMember[]> {
    await this.findOne(residentId);

    const links = await this.prisma.client.familyLink.findMany({
      where: { residentId },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return links.map((link) => ({
      id: link.user.id,
      email: link.user.email,
      name: link.user.name,
    }));
  }

  // Story 2.2 (AC #5): removes a FamilyLink — enforced immediately by
  // FamilyResidentGuard on the family member's next request, not just
  // hidden in the admin UI (AD-11).
  async unlinkFamilyMember(residentId: string, userId: string): Promise<void> {
    await this.findOne(residentId);

    try {
      await this.prisma.client.familyLink.delete({
        where: { userId_residentId: { userId, residentId } },
      });
    } catch (error) {
      throw this.mapRecordNotFoundViolation(error);
    }
  }

  private mapUniqueFamilyLinkViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'This family member is already linked to this resident',
      );
    }
    return error;
  }

  private mapRecordNotFoundViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return new NotFoundException('Family link not found');
    }
    return error;
  }
}
