import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Home } from '../../generated/prisma';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';

@Injectable()
export class HomesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateHomeDto): Promise<Home> {
    try {
      return await this.prisma.client.home.create({ data: dto });
    } catch (error) {
      throw this.mapUniqueNameViolation(error);
    }
  }

  findAll(): Promise<Home[]> {
    return this.prisma.client.home.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Home> {
    const home = await this.prisma.client.home.findUnique({ where: { id } });
    if (!home) throw new NotFoundException('Home not found');
    return home;
  }

  async update(id: string, dto: UpdateHomeDto): Promise<Home> {
    await this.findOne(id);
    try {
      return await this.prisma.client.home.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapUniqueNameViolation(error);
    }
  }

  private mapUniqueNameViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('A home with this name already exists');
    }
    return error;
  }
}
