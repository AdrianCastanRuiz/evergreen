import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { HomesController } from './homes.controller';
import { HomesService } from './homes.service';

@Module({
  imports: [UsersModule],
  controllers: [HomesController],
  providers: [HomesService],
})
export class HomesModule {}
