import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { Home } from '../../generated/prisma';
import { Roles } from '../common/auth/roles.decorator';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';
import { HomesService } from './homes.service';

// Home is the tenant root, not a tenant-scoped table (AD-1) — every route
// here is gated purely by role, never by home_id (FR47, NFR11, AD-12).
@Controller('homes')
@Roles('super_admin')
export class HomesController {
  constructor(private readonly homesService: HomesService) {}

  @Post()
  create(@Body() dto: CreateHomeDto): Promise<Home> {
    return this.homesService.create(dto);
  }

  @Get()
  findAll(): Promise<Home[]> {
    return this.homesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Home> {
    return this.homesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHomeDto): Promise<Home> {
    return this.homesService.update(id, dto);
  }
}
