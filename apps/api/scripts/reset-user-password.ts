// Local-dev-only utility: resets an existing user's password to a known
// value by name, so you can log in as them. NOT for production.
//
// Usage (from apps/api):
//   npx ts-node -r tsconfig-paths/register scripts/reset-user-password.ts "Cian O'Brien"
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma';

const SALT_ROUNDS = 12;
const NEW_PASSWORD = 'Demo12345!';

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: reset-user-password.ts "<Full Name>"');
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const matches = await prisma.user.findMany({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (matches.length === 0) {
      console.error(`No user found with name "${name}"`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(`Multiple users named "${name}" — be more specific:`);
      matches.forEach((u) => console.error(`  ${u.email} (${u.role})`));
      process.exit(1);
    }

    const user = matches[0];
    const passwordHash = await bcrypt.hash(NEW_PASSWORD, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, isActive: true },
    });

    console.log(
      `Password reset for ${user.name} (${user.email}, role: ${user.role})`,
    );
    console.log(`  email:    ${user.email}`);
    console.log(`  password: ${NEW_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
