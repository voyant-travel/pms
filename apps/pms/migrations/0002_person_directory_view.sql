-- Create the `person_directory` view (cross-module: relationships.people +
-- identity.identity_contact_points).
--
-- `personDirectoryView` (packages/relationships/src/schema-accounts.ts) is a
-- drizzle `pgView(...).existing()`, so drizzle-kit never emits its DDL — neither
-- the per-package relationships source nor `drizzle-kit push` materialises it.
-- The view spans two modules (people / identity_contact_points), so like the
-- cross-module link tables it lives in the DEPLOYMENT source, which the collector
-- applies LAST — after both owning packages' tables exist. Without it a
-- schema-derived operator DB lacks the view and every relationships read that
-- hydrates contact points fails with Postgres 42P01. See issue #1971.
--
-- CREATE OR REPLACE keeps it idempotent: the column list matches the original
-- starter baseline view, so a DB that already has it is a no-op.
CREATE OR REPLACE VIEW "person_directory" AS
SELECT
  p."id" AS "person_id",
  email_cp."value" AS "email",
  phone_cp."value" AS "phone",
  website_cp."value" AS "website"
FROM "people" p
LEFT JOIN LATERAL (
  SELECT "value"
  FROM "identity_contact_points"
  WHERE "entity_type" = 'person'
    AND "entity_id" = p."id"
    AND "kind" = 'email'
  ORDER BY "is_primary" DESC, "created_at"
  LIMIT 1
) email_cp ON TRUE
LEFT JOIN LATERAL (
  SELECT "value"
  FROM "identity_contact_points"
  WHERE "entity_type" = 'person'
    AND "entity_id" = p."id"
    AND "kind" = 'phone'
  ORDER BY "is_primary" DESC, "created_at"
  LIMIT 1
) phone_cp ON TRUE
LEFT JOIN LATERAL (
  SELECT "value"
  FROM "identity_contact_points"
  WHERE "entity_type" = 'person'
    AND "entity_id" = p."id"
    AND "kind" = 'website'
  ORDER BY "is_primary" DESC, "created_at"
  LIMIT 1
) website_cp ON TRUE;
