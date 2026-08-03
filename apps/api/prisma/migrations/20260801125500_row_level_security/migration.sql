-- Row-Level Security (AD-1 rule 3): the real backstop for tenant isolation.
-- Applies even if the Prisma Client Extension (tenant-scoping.extension.ts)
-- is bypassed, has a bug, or a query goes through raw SQL.
--
-- FORCE ROW LEVEL SECURITY matters because the app's DB user owns these
-- tables (it ran this migration) — without FORCE, ownership bypasses RLS
-- entirely and the policy below would be a no-op for every app query.
--
-- Two session settings, both transaction-local via set_config(..., true),
-- set once per query by the Prisma extension:
--   app.current_home_id     — the active tenant for a normal request
--   app.bypass_tenant_scope — set to 'true' only for the narrow,
--                             audit-logged @BypassTenantScope() path (e.g.
--                             super_admin platform-wide reads)
DO $$
DECLARE
  tenant_table TEXT;
BEGIN
  FOR tenant_table IN
    SELECT unnest(ARRAY[
      'home_memberships',
      'residents',
      'family_links',
      'content_items',
      'photos',
      'events',
      'event_registrations',
      'meal_menu_items',
      'meal_orders',
      'device_tokens'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ('
      || 'current_setting(''app.bypass_tenant_scope'', true) = ''true'' '
      || 'OR home_id = current_setting(''app.current_home_id'', true)::uuid'
      || ')',
      tenant_table
    );
  END LOOP;
END $$;
