import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { HomesService } from './homes.service';

describe('HomesService', () => {
  let homesService: HomesService;
  let prisma: {
    client: {
      home: {
        create: jest.Mock;
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
    };
  };

  const home = {
    id: 'home-1',
    name: 'Evergreen Oaks',
    address: '1 Main St',
    timezone: 'Europe/Madrid',
  };

  const uniqueViolation = new Prisma.PrismaClientKnownRequestError('conflict', {
    code: 'P2002',
    clientVersion: 'test',
  });

  beforeEach(async () => {
    prisma = {
      client: {
        home: {
          create: jest.fn(),
          findMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [HomesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    homesService = module.get(HomesService);
  });

  describe('create', () => {
    it('creates a home', async () => {
      prisma.client.home.create.mockResolvedValue(home);

      const dto = {
        name: home.name,
        address: home.address,
        timezone: home.timezone,
      };
      await expect(homesService.create(dto)).resolves.toEqual(home);
      expect(prisma.client.home.create).toHaveBeenCalledWith({ data: dto });
    });

    it('rejects a duplicate name with a ConflictException instead of a raw 500', async () => {
      prisma.client.home.create.mockRejectedValue(uniqueViolation);

      await expect(
        homesService.create({ name: home.name, timezone: home.timezone }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('lists homes ordered by name', async () => {
      prisma.client.home.findMany.mockResolvedValue([home]);

      await expect(homesService.findAll()).resolves.toEqual([home]);
      expect(prisma.client.home.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the home when found', async () => {
      prisma.client.home.findUnique.mockResolvedValue(home);

      await expect(homesService.findOne(home.id)).resolves.toEqual(home);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.client.home.findUnique.mockResolvedValue(null);

      await expect(homesService.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates an existing home', async () => {
      prisma.client.home.findUnique.mockResolvedValue(home);
      const updated = { ...home, name: 'New Name' };
      prisma.client.home.update.mockResolvedValue(updated);

      await expect(
        homesService.update(home.id, { name: 'New Name' }),
      ).resolves.toEqual(updated);
    });

    it('throws NotFoundException when the home does not exist', async () => {
      prisma.client.home.findUnique.mockResolvedValue(null);

      await expect(
        homesService.update('missing', { name: 'New Name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.home.update).not.toHaveBeenCalled();
    });

    it('rejects renaming to a name already taken by another home', async () => {
      prisma.client.home.findUnique.mockResolvedValue(home);
      prisma.client.home.update.mockRejectedValue(uniqueViolation);

      await expect(
        homesService.update(home.id, { name: 'Taken Name' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('clears the address when explicitly set to null (Review Finding, patch)', async () => {
      prisma.client.home.findUnique.mockResolvedValue(home);
      prisma.client.home.update.mockResolvedValue({ ...home, address: null });

      await homesService.update(home.id, { address: null });

      expect(prisma.client.home.update).toHaveBeenCalledWith({
        where: { id: home.id },
        data: { address: null },
      });
    });
  });
});
