import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import {
  createTenantScopedPrismaClient,
  type TenantScopedPrismaClient,
} from './tenant-scoping.extension';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: TenantScopedPrismaClient;

  constructor(config: ConfigService, tenantContext: TenantContextService) {
    // Pooled (PgBouncer-compatible) connection — the app never connects
    // directly to Neon (AD-17). Migrations use DIRECT_URL via
    // prisma.config.ts instead, never this client.
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    });
    this.client = createTenantScopedPrismaClient(adapter, tenantContext);
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
