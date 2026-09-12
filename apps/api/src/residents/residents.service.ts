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

// Story 2.3 (AC #1, #2): a family member's own linked residents, as returned
// by GET /residents/linked and GET /residents/:residentId for a family
// caller. A subset of `Resident`. Story 3.2 adds `homeId` (below) — the
// mobile client needs it per resident to build the X-Active-Home-Id header
// for /content, since a family JWT carries no fixed home_id of its own
// (AD-18 still holds: the caller's *own* home_id is never in their JWT/tenant
// context, but a resident they're already linked to freely discloses which
// home it belongs to). Mirrored in data shape by @evergreen/shared-types'
// LinkedResident for the mobile client (the API stays on nodenext and
// defines local types here, the same split as LinkedFamilyMember).
export interface LinkedResident {
  id: string;
  name: string;
  room: string | null;
  dob: string | null;
  profilePhotoPublicId: string | null;
  // Story 3.2 (Task 2): the mobile client needs this to build the
  // X-Active-Home-Id header for /content — the family JWT itself carries no
  // fixed home_id (AD-18).
  homeId: string;
  // Mobile's persistent header (active-home name at the top of every tab)
  // needs the home's display name, not just its id.
  homeName: string;
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

  // Story 2.3 (AC #1, #2): a family member's own linked residents. Family
  // callers have no homeId in the tenant store (AD-18 — a family user can
  // belong to several homes), so FamilyLink/Resident cannot be read through
  // the tenant-scoping extension's normal auto-injected-homeId path. The
  // WHERE userId = caller filter IS the scoping here — FamilyLink rows are
  // keyed by the caller's own id, so this is self-scoped by construction and
  // can never leak another family's links (AC #1). runBypassed is safe for
  // the same reason the guard relies on it: the explicit filter replaces the
  // injected home_id.
  async findLinkedForUser(userId: string): Promise<LinkedResident[]> {
    const links = await this.tenantContext.runBypassed(() =>
      this.prisma.client.familyLink.findMany({
        where: { userId },
        include: {
          resident: {
            select: {
              id: true,
              name: true,
              room: true,
              dob: true,
              profilePhotoPublicId: true,
              homeId: true,
              home: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );

    return links.map((link) => ({
      id: link.resident.id,
      name: link.resident.name,
      room: link.resident.room,
      dob: link.resident.dob ? link.resident.dob.toISOString() : null,
      profilePhotoPublicId: link.resident.profilePhotoPublicId,
      homeId: link.resident.homeId,
      homeName: link.resident.home.name,
    }));
  }

  // Story 2.3 (AC #4): the family-facing single-resident read. The route is
  // guarded by FamilyResidentGuard (AD-11), which fails CLOSED unless the
  // family caller holds a live FamilyLink to this resident in a home they
  // still belong to — so this lookup is safe to runBypass with the explicit
  // id; the guard has already authorized it. Never returns a resident the
  // guard did not already vet.
  async findOneForFamily(id: string): Promise<LinkedResident> {
    const resident = await this.tenantContext.runBypassed(() =>
      this.prisma.client.resident.findUnique({
        where: { id },
        include: { home: { select: { name: true } } },
      }),
    );
    if (!resident) throw new NotFoundException('Resident not found');
    return {
      id: resident.id,
      name: resident.name,
      room: resident.room,
      dob: resident.dob ? resident.dob.toISOString() : null,
      profilePhotoPublicId: resident.profilePhotoPublicId,
      // Story 3.2: LinkedResident now carries homeId (see interface comment)
      // — not a new disclosure here, the caller already gets this same
      // resident's homeId via findLinkedForUser's linked-residents list.
      homeId: resident.homeId,
      homeName: resident.home.name,
    };
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
