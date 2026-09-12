// Story 3.1: a home's content items (news/notice/announcement/static_page/
// document/schedule — AD-5). `ContentType` mirrors the API's Prisma enum as
// a string union, same convention as common.ts's `Role` (the Prisma enum is
// never imported into shared-types).

export type ContentType =
  | "news"
  | "notice"
  | "announcement"
  | "static_page"
  | "document"
  | "schedule";

export interface ContentItem {
  id: string;
  homeId: string;
  type: ContentType;
  title: string;
  body: string;
  attachmentUrl: string | null;
  // null = draft, set = published and visible to family (Story 3.2).
  publishedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContentItemRequest {
  type: ContentType;
  title: string;
  body: string;
  attachmentUrl?: string;
}

export interface UpdateContentItemRequest {
  title?: string;
  body?: string;
  // null clears a previously-set attachmentUrl; undefined/omitted leaves it
  // untouched. `type` is deliberately not editable (see the story's Dev
  // Notes) — no AC requires re-typing an existing item.
  attachmentUrl?: string | null;
}
