// Local-dev-only seed: creates (or resets the password of) a super_admin so
// there's a way to log in at all — there's no self-registration by design
// (FR1) and no bootstrap endpoint, so the very first account has to be
// created out-of-band. Talks to the DB directly with a plain PrismaClient,
// no NestJS app needed (User isn't tenant-scoped, so no RLS/session-variable
// setup applies here — see tenant-scoped-models.ts).
//
// Usage (from apps/api):
//   npx ts-node -r tsconfig-paths/register prisma/seed.ts
//   npx ts-node -r tsconfig-paths/register prisma/seed.ts admin@evergreen.test MyPassword123
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma';

const SALT_ROUNDS = 12;
const DEFAULT_EMAIL = 'super-admin@evergreen.test';
const DEFAULT_PASSWORD = 'Evergreen123!';

async function main() {
  const email = (process.argv[2] ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.argv[3] ?? DEFAULT_PASSWORD;

  // Same driver adapter PrismaService uses (Prisma 7 requires one — no
  // implicit URL connection). Local dev only, so plain DATABASE_URL is fine.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name: 'Seed Super Admin',
        role: 'super_admin',
        isActive: true,
      },
      update: {
        passwordHash,
        role: 'super_admin',
        isActive: true,
      },
    });

    console.log('Seeded super_admin:');
    console.log(`  email:    ${user.email}`);
    console.log(`  password: ${password}`);
    console.log(`  id:       ${user.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
