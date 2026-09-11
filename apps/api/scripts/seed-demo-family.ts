// Local-dev-only seed: builds the exact dataset Story 2.3 needs for manual
// testing of the family Home screen. NOT for production.
//
// Creates:
//   - one care home
//   - an active admin (HomeMembership) + 3 residents in that home
//   - familyA -> linked to 2 residents (=pill-row switcher, AC #2)
//   - familyB -> linked to 0 residents (=gate routes to onboarding)
//   - familyC -> linked to 1 resident (=no switcher, AC #1)
//
// Idempotent: re-running never duplicates.
//
// Tenant-scoped tables (Home, HomeMembership, Resident, FamilyLink) sit
// behind Postgres row-level-security policies that read app.current_home_id /
// app.bypass_tenant_scope session vars. A plain PrismaClient starts a
// transaction that sets those vars via set_config() before each write — the
// same transaction-local mechanism the tenant-scoping extension uses.
//
// Usage (from apps/api):
//   npx ts-node -r tsconfig-paths/register scripts/seed-demo-family.ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '../generated/prisma';

const SALT_ROUNDS = 12;
const PASSWORD = 'Demo12345!';
const HOME_NAME = 'Story 2.3 Demo Home';

const RESIDENTS = [
  { name: 'Ada Lovelace', room: '101', dob: '1815-12-10T00:00:00Z' },
  { name: 'Grace Hopper', room: '102', dob: '1906-12-09T00:00:00Z' },
  { name: 'Alan Turing', room: '103', dob: '1912-06-23T00:00:00Z' },
];

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    // User is NOT tenant-scoped (no RLS policy), but Home is; run its upsert
    // inside an RLS-bypassed transaction.
    const home = await inTx(prisma, async (tx) =>
      tx.home.upsert({
        where: { name: HOME_NAME },
        create: { name: HOME_NAME, timezone: 'Europe/Madrid' },
        update: {},
      }),
    );
    console.log(`Home ready: ${home.name} (${home.id})`);

    await seedForHome(prisma, home.id);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedForHome(prisma: PrismaClient, homeId: string) {
  // 2. Admin + membership.
  const admin = await upsertUser(
    prisma,
    'admin',
    'Story2.3 Admin',
    'admin@evergreen.test',
  );
  await inHome(prisma, homeId, (tx) =>
    tx.homeMembership.upsert({
      where: { userId_homeId: { userId: admin.id, homeId } },
      create: { userId: admin.id, homeId, role: 'admin' },
      update: {},
    }),
  );
  console.log(`Admin: ${admin.email} / ${PASSWORD}`);

  // 3. Residents. Plain names — no home-name suffix (it used to read e.g.
  // "Ada Lovelace (Story 2.3 Demo Home)", which is what a real resident
  // profile would never be named, and it overflowed mobile UI elements
  // sized for a real name).
  const residentIds: string[] = [];
  for (const r of RESIDENTS) {
    const name = r.name;
    const resident = await inHome(prisma, homeId, async (tx) => {
      const existing = await tx.resident.findFirst({
        where: { homeId, name },
      });
      if (existing) {
        // Idempotent, but still reconcile dob/room on re-runs so a resident
        // created by an earlier seed (pre-Story 2.4, no dob) picks it up.
        return tx.resident.update({
          where: { id: existing.id },
          data: { room: r.room, dob: r.dob },
        });
      }
      // Story 2.1 sealed `dob` as nullable (Resident.dob: string | null). Set
      // it so the card's DOB line renders during manual testing of 2.4 (AC #1).
      return tx.resident.create({
        data: { homeId, name, room: r.room, dob: r.dob },
      });
    });
    residentIds.push(resident.id);
    console.log(`Resident: ${resident.name} (${resident.id})`);
  }

  // 4. Family members. Short, fixed emails (not derived from `name`) — the
  // descriptive names are long on purpose (they double as on-screen labels
  // during manual testing), but a long name shouldn't also force a long
  // login email.
  const familyA = await upsertUser(
    prisma,
    'family',
    'Story2.3 Family A',
    'family-a@evergreen.test',
  );
  const familyB = await upsertUser(
    prisma,
    'family',
    'Story2.3 Family B no links',
    'family-b@evergreen.test',
  );
  const familyC = await upsertUser(
    prisma,
    'family',
    'Story2.3 Family C one link',
    'family-c@evergreen.test',
  );
  for (const fam of [familyA, familyB, familyC]) {
    await inHome(prisma, homeId, (tx) =>
      tx.homeMembership.upsert({
        where: { userId_homeId: { userId: fam.id, homeId } },
        create: { userId: fam.id, homeId, role: 'family' },
        update: {},
      }),
    );
  }

  // familyA -> 2 residents (switcher pill row); familyB -> none;
  // familyC -> 1 resident (AC #1, no switcher).
  await upsertLink(prisma, familyA.id, residentIds[0], homeId);
  await upsertLink(prisma, familyA.id, residentIds[1], homeId);
  await upsertLink(prisma, familyC.id, residentIds[2], homeId);

  console.log('\nDone. Log in with:');
  console.log(
    `  familyA: ${familyA.email} / ${PASSWORD}  (2 links -> switcher, AC #2)`,
  );
  console.log(
    `  familyB: ${familyB.email} / ${PASSWORD}  (0 links -> onboarding gate)`,
  );
  console.log(
    `  familyC: ${familyC.email} / ${PASSWORD}  (1 link -> no switcher, AC #1)`,
  );
  console.log(`  admin:   ${admin.email} / ${PASSWORD}`);
}

async function upsertUser(
  prisma: PrismaClient,
  role: 'admin' | 'family',
  name: string,
  email: string,
) {
  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
  return prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name, role, isActive: true },
    update: { passwordHash, name, role, isActive: true },
  });
}

// Runs `fn` in a transaction with the current_home_id + bypass session vars
// set, satisfying the RLS policies tenant-scoped tables require.
async function inHome<T>(
  prisma: PrismaClient,
  homeId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return inTx(prisma, async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_home_id', ${homeId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.bypass_tenant_scope', 'true', true)`;
    return fn(tx);
  });
}

// Runs `fn` in a fresh transaction with RLS bypassed (for non-home H RLS
// rows like Home itself).
async function inTx<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_tenant_scope', 'true', true)`;
    return fn(tx);
  });
}

async function upsertLink(
  prisma: PrismaClient,
  userId: string,
  residentId: string,
  homeId: string,
) {
  await inHome(prisma, homeId, (tx) =>
    tx.familyLink.upsert({
      where: { userId_residentId: { userId, residentId } },
      create: { userId, residentId, homeId },
      update: {},
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});