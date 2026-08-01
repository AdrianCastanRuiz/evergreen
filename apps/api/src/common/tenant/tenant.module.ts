import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BypassTenantScopeInterceptor } from './bypass-tenant-scope.interceptor';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';

// JwtModule is registered here (not in a future auth module) so the same
// signing config backs both this middleware's verification and the auth
// module's issuance — one source of truth for JWT_SECRET (AD-8).
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    TenantContextService,
    TenantContextMiddleware,
    BypassTenantScopeInterceptor,
  ],
  exports: [TenantContextService, TenantContextMiddleware, JwtModule],
})
export class TenantModule {}
