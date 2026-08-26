import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InviteCodeService } from './invite-code.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    PasswordResetService,
    InviteCodeService,
  ],
  exports: [PasswordService, PasswordResetService, InviteCodeService],
})
export class AuthModule {}
