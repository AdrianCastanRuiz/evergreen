import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
