-- Fixes a latent bug in the tenant_isolation RLS policy introduced by
-- 20260801125500_row_level_security. Discovered by Story 1.5 (mobile
-- invite-users), which is the first code path to ever call
-- `set_config('app.current_home_id', <value>, true)` outside
-- @BypassTenantScope() (every prior story's tenant-scoped write went
-- through the bypass branch only).
--
-- Postgres reverts a `set_config(name, value, true)` (SET LOCAL-equivalent)
-- at the end of its transaction back to the setting's PRE-transaction
-- value. For a custom GUC placeholder that has never been set before on a
-- given connection, that reverted value is an EMPTY STRING (''), not NULL.
-- So on a pooled connection, the very first non-bypass write "poisons" the
-- placeholder: every later query on that same connection that relies on
-- `current_setting('app.current_home_id', true)` being NULL when unset
-- (e.g. every subsequent @BypassTenantScope() read, which never sets
-- app.current_home_id at all) instead sees '', and the policy's
-- `home_id = current_setting(...)::uuid` cast throws
-- "invalid input syntax for type uuid: """ instead of evaluating to NULL
-- (falsy) as intended — even though bypass_tenant_scope='true' is already
-- true and the OR should never need the right-hand side at all.
--
-- Reproduced directly against Postgres (not just via the Prisma extension):
--   BEGIN; SELECT set_config('app.current_home_id', '<uuid>', true); COMMIT;
--   BEGIN; SELECT set_config('app.bypass_tenant_scope', 'true', true);
--   SELECT * FROM home_memberships LIMIT 1;  -- ERROR before this fix
--
-- Fix: NULLIF(..., '') normalizes the poisoned '' back to NULL before the
-- ::uuid cast, so an unset-or-poisoned app.current_home_id is always
-- treated as "no scope", not a cast error — matching the original intent.
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
    EXECUTE format(
      'ALTER POLICY tenant_isolation ON %I USING ('
      || 'current_setting(''app.bypass_tenant_scope'', true) = ''true'' '
      || 'OR home_id = NULLIF(current_setting(''app.current_home_id'', true), '''')::uuid'
      || ')',
      tenant_table
    );
  END LOOP;
END $$;
