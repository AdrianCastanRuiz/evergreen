import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResidentsService } from './residents.service';

describe('ResidentsService', () => {
  let residentsService: ResidentsService;
  let prisma: {
    client: {
      resident: {
        create: jest.Mock;
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      homeMembership: {
        findFirst: jest.Mock;
      };
      familyLink: {
        create: jest.Mock;
        findMany: jest.Mock;
        delete: jest.Mock;
      };
    };
  };

  const uniqueViolation = new Prisma.PrismaClientKnownRequestError('conflict', {
    code: 'P2002',
    clientVersion: 'test',
  });
  const recordNotFoundViolation = new Prisma.PrismaClientKnownRequestError(
    'not found',
    { code: 'P2025', clientVersion: 'test' },
  );

  const resident = {
    id: 'resident-1',
    homeId: 'home-1',
    name: 'Jane Doe',
    room: '101',
    dob: new Date('1940-01-01'),
    profilePhotoPublicId: null,
  };

  beforeEach(async () => {
    prisma = {
      client: {
        resident: {
          create: jest.fn(),
          findMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        homeMembership: {
          findFirst: jest.fn(),
        },
        familyLink: {
          create: jest.fn(),
          findMany: jest.fn(),
          delete: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResidentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TenantContextService,
          useValue: { getHomeId: jest.fn().mockReturnValue(resident.homeId) },
        },
      ],
    }).compile();

    residentsService = module.get(ResidentsService);
  });

  describe('create', () => {
    it('creates a resident, leaving the tenant-scoping extension to reinforce homeId', async () => {
      prisma.client.resident.create.mockResolvedValue(resident);

      const dto = { name: resident.name, room: resident.room };
      await expect(residentsService.create(dto)).resolves.toEqual(resident);
      expect(prisma.client.resident.create).toHaveBeenCalledWith({
        data: {
          homeId: resident.homeId,
          name: resident.name,
          room: resident.room,
          dob: undefined,
          profilePhotoPublicId: undefined,
        },
      });
    });

    it('converts an ISO dob string to a Date before writing', async () => {
      prisma.client.resident.create.mockResolvedValue(resident);

      await residentsService.create({
        name: resident.name,
        dob: '1940-01-01',
      });

      expect(prisma.client.resident.create).toHaveBeenCalledWith({
        data: {
          homeId: resident.homeId,
          name: resident.name,
          room: undefined,
          dob: new Date('1940-01-01'),
          profilePhotoPublicId: undefined,
        },
      });
    });
  });

  describe('findAll', () => {
    it('lists residents ordered by name', async () => {
      prisma.client.resident.findMany.mockResolvedValue([resident]);

      await expect(residentsService.findAll()).resolves.toEqual([resident]);
      expect(prisma.client.resident.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('returns an empty list when the home has no residents yet (AC #3)', async () => {
      prisma.client.resident.findMany.mockResolvedValue([]);

      await expect(residentsService.findAll()).resolves.toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the resident when found', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);

      await expect(residentsService.findOne(resident.id)).resolves.toEqual(
        resident,
      );
    });

    it('throws NotFoundException when missing or scoped to another home (AC #4)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(null);

      await expect(
        residentsService.findOne('other-home-resident'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates an existing resident', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      const updated = { ...resident, name: 'New Name' };
      prisma.client.resident.update.mockResolvedValue(updated);

      await expect(
        residentsService.update(resident.id, { name: 'New Name' }),
      ).resolves.toEqual(updated);
    });

    it('clears dob when explicitly set to null, distinct from leaving it untouched', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.resident.update.mockResolvedValue({
        ...resident,
        dob: null,
      });

      await residentsService.update(resident.id, { dob: null });

      expect(prisma.client.resident.update).toHaveBeenCalledWith({
        where: { id: resident.id },
        data: {
          name: undefined,
          room: undefined,
          dob: null,
          profilePhotoPublicId: undefined,
        },
      });
    });

    it('leaves dob untouched when the field is not sent at all', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.resident.update.mockResolvedValue(resident);

      await residentsService.update(resident.id, { name: 'New Name' });

      expect(prisma.client.resident.update).toHaveBeenCalledWith({
        where: { id: resident.id },
        data: {
          name: 'New Name',
          room: undefined,
          dob: undefined,
          profilePhotoPublicId: undefined,
        },
      });
    });

    it('throws NotFoundException when the resident does not exist', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(null);

      await expect(
        residentsService.update('missing', { name: 'New Name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.resident.update).not.toHaveBeenCalled();
    });
  });

  describe('linkFamilyMember', () => {
    it('creates a FamilyLink for an active family member of this home (AC #2)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.homeMembership.findFirst.mockResolvedValue({
        userId: 'family-1',
        role: 'family',
        user: { isActive: true },
      });
      prisma.client.familyLink.create.mockResolvedValue({});

      await residentsService.linkFamilyMember(resident.id, 'family-1');

      expect(prisma.client.homeMembership.findFirst).toHaveBeenCalledWith({
        where: { userId: 'family-1', role: 'family' },
        include: { user: { select: { isActive: true } } },
      });
      expect(prisma.client.familyLink.create).toHaveBeenCalledWith({
        data: {
          userId: 'family-1',
          residentId: resident.id,
          homeId: resident.homeId,
        },
      });
    });

    it('throws NotFoundException for a resident outside the caller home (AC #4)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(null);

      await expect(
        residentsService.linkFamilyMember('other-home-resident', 'family-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.homeMembership.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target user is not a family member of this home at all', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.homeMembership.findFirst.mockResolvedValue(null);

      await expect(
        residentsService.linkFamilyMember(resident.id, 'not-a-member'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.familyLink.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a pending (not-yet-activated) family invitee (review finding)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.homeMembership.findFirst.mockResolvedValue({
        userId: 'pending-family',
        role: 'family',
        user: { isActive: false },
      });

      await expect(
        residentsService.linkFamilyMember(resident.id, 'pending-family'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.familyLink.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate link to ConflictException instead of a raw 500', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.homeMembership.findFirst.mockResolvedValue({
        userId: 'family-1',
        role: 'family',
        user: { isActive: true },
      });
      prisma.client.familyLink.create.mockRejectedValue(uniqueViolation);

      await expect(
        residentsService.linkFamilyMember(resident.id, 'family-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listFamilyLinks', () => {
    it('lists linked family members, name/email only (no FamilyLink internals)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.familyLink.findMany.mockResolvedValue([
        {
          user: {
            id: 'family-1',
            email: 'family@evergreen.test',
            name: 'Jo Doe',
          },
        },
      ]);

      await expect(
        residentsService.listFamilyLinks(resident.id),
      ).resolves.toEqual([
        { id: 'family-1', email: 'family@evergreen.test', name: 'Jo Doe' },
      ]);
      expect(prisma.client.familyLink.findMany).toHaveBeenCalledWith({
        where: { residentId: resident.id },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('throws NotFoundException for a resident outside the caller home (AC #4)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(null);

      await expect(
        residentsService.listFamilyLinks('other-home-resident'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('unlinkFamilyMember', () => {
    it('deletes the FamilyLink (AC #5)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.familyLink.delete.mockResolvedValue({});

      await residentsService.unlinkFamilyMember(resident.id, 'family-1');

      expect(prisma.client.familyLink.delete).toHaveBeenCalledWith({
        where: {
          userId_residentId: { userId: 'family-1', residentId: resident.id },
        },
      });
    });

    it('throws NotFoundException for a resident outside the caller home (AC #4)', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(null);

      await expect(
        residentsService.unlinkFamilyMember('other-home-resident', 'family-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.familyLink.delete).not.toHaveBeenCalled();
    });

    it('maps a missing/already-removed link to NotFoundException instead of a raw 500', async () => {
      prisma.client.resident.findUnique.mockResolvedValue(resident);
      prisma.client.familyLink.delete.mockRejectedValue(
        recordNotFoundViolation,
      );

      await expect(
        residentsService.unlinkFamilyMember(resident.id, 'family-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
