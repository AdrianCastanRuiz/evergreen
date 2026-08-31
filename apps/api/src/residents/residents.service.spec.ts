import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
    };
  };

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
});
