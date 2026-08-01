// Config used by the Prisma CLI (migrate, studio, db pull/push) — NOT by the
// running app. The app's own PrismaService constructs its client with the
// PrismaPg adapter against DATABASE_URL (Neon's pooled connection, AD-17).
// This config's datasource.url is DIRECT_URL — migrations run against the
// unpooled connection, which is what Neon recommends for DDL (AD-6).
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
