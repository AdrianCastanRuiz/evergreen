-- The image's bootstrap POSTGRES_USER is always a Postgres superuser, and
-- superusers bypass row-level security regardless of FORCE ROW LEVEL
-- SECURITY (see prisma/migrations/20260801125500_row_level_security). To
-- catch RLS regressions locally, the app must connect as an ordinary,
-- non-superuser role that only owns its own tables (via migrations) —
-- mirroring the privileges an app connection has against Neon in
-- staging/production.
CREATE ROLE evergreen WITH LOGIN PASSWORD 'evergreen' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT ALL PRIVILEGES ON DATABASE evergreen TO evergreen;
GRANT ALL ON SCHEMA public TO evergreen;
