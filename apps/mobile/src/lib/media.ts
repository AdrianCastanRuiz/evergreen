// Story 2.4: the FIRST place in the codebase that turns a Cloudinary
// `public_id` into a display URL. AD-4 stores only the public id in Postgres —
// every consumer builds its own transformation URL at request time. Kept to a
// single small helper (cloud name from EXPO_PUBLIC_*, one fixed thumbnail
// transform); the full signed-upload flow is Epic 4's (Photos) scope, not this
// story's.
//
// No Cloudinary config existed in the repo at implementation time, so the
// cloud name is sourced from EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME (see
// .env.example). When unset the helper returns null so callers fall back to a
// placeholder rather than rendering a broken image.

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;

const THUMBNAIL_TRANSFORM = "w_200,h_200,c_fill";

/**
 * Builds a display URL from a Cloudinary public id, or null when the id is
 * empty/unset or no cloud name is configured.
 */
export function residentPhotoUrl(publicId: string | null | undefined): string | null {
  if (!publicId || !CLOUDINARY_CLOUD_NAME) return null;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${THUMBNAIL_TRANSFORM}/${publicId}`;
}