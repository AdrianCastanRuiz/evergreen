import { Injectable, NotFoundException } from '@nestjs/common';
import type { Resident } from '../../generated/prisma';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResidentDto } from './dto/create-resident.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';

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
}
