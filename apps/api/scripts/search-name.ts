// Local-dev-only lookup helper: fuzzy-searches User and Resident names.
// Usage (from apps/api): npx ts-node -r tsconfig-paths/register scripts/search-name.ts <term> [term2 ...]
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

async function main() {
  const terms = process.argv.slice(2);
  if (terms.length === 0) {
    console.error('Usage: search-name.ts <term> [term2 ...]');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: terms.map((t) => ({
          name: { contains: t, mode: 'insensitive' as const },
        })),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    console.log('Users:', JSON.stringify(users, null, 2));

    const residents = await prisma.resident.findMany({
      where: {
        OR: terms.map((t) => ({
          name: { contains: t, mode: 'insensitive' as const },
        })),
      },
      select: { id: true, name: true, homeId: true },
    });
    console.log('Residents:', JSON.stringify(residents, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
