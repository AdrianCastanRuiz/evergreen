// Every Prisma model that carries a home_id column (AD-1 rule 4). A model
// left off this list is NOT auto-scoped by the extension in
// tenant-scoping.extension.ts (RLS still applies as the backstop) — add any
// new tenant-scoped table here as soon as it's added to schema.prisma.
export const TENANT_SCOPED_MODELS = new Set([
  'HomeMembership',
  'Resident',
  'FamilyLink',
  'ContentItem',
  'Photo',
  'Event',
  'EventRegistration',
  'MealMenuItem',
  'MealOrder',
  'DeviceToken',
]);
