import * as React from "react";
import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ContentItem,
  ContentType,
  CreateContentItemRequest,
  PaginatedResponse,
  UpdateContentItemRequest,
} from "@evergreen/shared-types";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authedRequest, ApiError, NetworkError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { protectedLayoutRoute } from "@/routes/protected-layout";

// Story 3.1: home admin/staff creates/edits/publishes/deletes content items
// (news/document/schedule/notice/static_page/announcement) for their own
// home. The API auto-scopes every /content call to the caller's home_id
// (ContentService, tenant-scoping extension) — no home id is ever sent from
// this client, same pattern as residents.tsx.
export const contentRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: "/content",
  component: ContentPage,
});

// One tab per ContentType (Task 3) — order matches the Dev Notes' listed
// order. Also doubles as the per-tab empty-state "Create the first [x]" copy
// source.
const CONTENT_TYPES: ContentType[] = [
  "news",
  "document",
  "schedule",
  "notice",
  "static_page",
  "announcement",
];

const TYPE_LABELS: Record<ContentType, string> = {
  news: "News",
  document: "Documents",
  schedule: "Schedules",
  notice: "Notices",
  static_page: "Static Pages",
  announcement: "Announcements",
};

// Singular noun for the empty-state "Create the first [x]" copy — plural tab
// labels above don't read naturally there (e.g. "Create the first News").
const TYPE_SINGULAR: Record<ContentType, string> = {
  news: "news post",
  document: "document",
  schedule: "schedule",
  notice: "notice",
  static_page: "static page",
  announcement: "announcement",
};

function listContent(
  type: ContentType,
): Promise<PaginatedResponse<ContentItem>> {
  return authedRequest<PaginatedResponse<ContentItem>>(
    `/content?type=${type}`,
  );
}

function createContent(body: CreateContentItemRequest): Promise<ContentItem> {
  return authedRequest<ContentItem>("/content", { method: "POST", body });
}

function updateContent(
  id: string,
  body: UpdateContentItemRequest,
): Promise<ContentItem> {
  return authedRequest<ContentItem>(`/content/${id}`, {
    method: "PATCH",
    body,
  });
}

function publishContent(id: string): Promise<ContentItem> {
  return authedRequest<ContentItem>(`/content/${id}/publish`, {
    method: "POST",
  });
}

function deleteContent(id: string): Promise<void> {
  return authedRequest<void>(`/content/${id}`, { method: "DELETE" });
}

function ContentPage() {
  const queryClient = useQueryClient();
  const [activeType, setActiveType] = React.useState<ContentType>("news");
  const [dialogItem, setDialogItem] = React.useState<
    ContentItem | "new" | null
  >(null);

  const queryKey = ["content", activeType] as const;
  const contentQuery = useQuery({
    queryKey,
    queryFn: () => listContent(activeType),
  });

  const invalidateContent = () =>
    queryClient.invalidateQueries({ queryKey });

  const closeDialog = () => setDialogItem(null);

  const items = contentQuery.data?.data ?? [];
  const typeLabel = TYPE_LABELS[activeType];

  return (
    <div className="rounded-md border border-border bg-card p-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        Content
      </h1>

      {/* Tab row — one per ContentType. A plain button row, not a new
          shadcn primitive: no Tabs component is installed in this app and
          none of the ACs need more than an active/inactive visual state.
          Review finding: deliberately NOT `role="tablist"`/`role="tab"` —
          real ARIA tab semantics promise arrow-key navigation and
          `aria-controls` linkage this row doesn't implement, which is worse
          for assistive tech than plain buttons with no tab role at all. */}
      <div
        aria-label="Content type"
        className="mt-4 flex flex-wrap gap-1 border-b border-border"
      >
        {CONTENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-current={activeType === type ? "true" : undefined}
            onClick={() => setActiveType(type)}
            className={cn(
              "-mb-px rounded-t-DEFAULT border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeType === type
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {typeLabel}
        </h2>
        {/* Same visibility rule Story 2.1 landed on: stays visible on a
            transient list-load error too, not just on a non-empty success
            result. */}
        {!contentQuery.isLoading &&
        (contentQuery.isError || items.length > 0) ? (
          <Button onClick={() => setDialogItem("new")}>
            Create a {TYPE_SINGULAR[activeType]}
          </Button>
        ) : null}
      </div>

      <div className="mt-4">
        {contentQuery.isLoading ? (
          <p className="text-muted-foreground">Loading {typeLabel.toLowerCase()}…</p>
        ) : contentQuery.isError ? (
          <p className="text-destructive">
            Couldn't load {typeLabel.toLowerCase()}. Please try again.
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border py-16 text-center">
            <p className="text-muted-foreground">No content yet</p>
            <Button onClick={() => setDialogItem("new")}>
              Create the first {TYPE_SINGULAR[activeType]}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-[15px] font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {item.publishedAt ? "Published" : "Draft"}
                    {item.attachmentUrl ? (
                      <>
                        {" · "}
                        <a
                          href={item.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Attachment
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.publishedAt ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      Published
                    </span>
                  ) : (
                    <PublishButton itemId={item.id} onDone={invalidateContent} />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialogItem(item)}
                  >
                    Edit
                  </Button>
                  <DeleteItemButton
                    item={item}
                    onDeleted={invalidateContent}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={dialogItem !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          {dialogItem ? (
            <ContentForm
              item={dialogItem === "new" ? null : dialogItem}
              type={activeType}
              onSaved={() => {
                invalidateContent();
                closeDialog();
              }}
              onCancel={closeDialog}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PublishButtonProps {
  itemId: string;
  onDone: () => void;
}

function PublishButton({ itemId, onDone }: PublishButtonProps) {
  const mutation = useMutation({
    mutationFn: () => publishContent(itemId),
    onSuccess: onDone,
  });

  const handlePublish = () => {
    // Same synchronous re-entrancy guard as ContentForm's handleSubmit — a
    // fast double-click can fire a second request before `disabled`'s
    // re-render lands (review finding).
    if (mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={mutation.isPending}
        onClick={handlePublish}
      >
        {mutation.isPending ? "Publishing…" : "Publish"}
      </Button>
      {/* Review finding: a failed publish previously failed silently. */}
      {mutation.isError ? (
        <p className="text-xs text-destructive">Couldn't publish. Try again.</p>
      ) : null}
    </div>
  );
}

interface DeleteItemButtonProps {
  item: ContentItem;
  onDeleted: () => void;
}

// Same AlertDialog confirm pattern as residents.tsx's "Remove" family-link
// button — the established convention for this class of destructive action.
function DeleteItemButton({ item, onDeleted }: DeleteItemButtonProps) {
  const mutation = useMutation({
    mutationFn: () => deleteContent(item.id),
    onSuccess: onDeleted,
  });

  const handleDelete = () => {
    // Same synchronous re-entrancy guard as ContentForm's handleSubmit
    // (review finding) — AlertDialogAction closes the confirm dialog on
    // click regardless of outcome, so this only guards against a fast
    // double-click on the action itself before it closes.
    if (mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive text-destructive hover:bg-destructive/10"
            disabled={mutation.isPending}
          >
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this content item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{item.title}" will be removed and immediately disappear from
              the family view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Review finding: a failed delete previously failed silently — the
          confirm dialog already closed by the time this renders, so this is
          the only place left to show it. */}
      {mutation.isError ? (
        <p className="text-xs text-destructive">Couldn't delete. Try again.</p>
      ) : null}
    </div>
  );
}

interface ContentFormProps {
  item: ContentItem | null;
  type: ContentType;
  onSaved: () => void;
  onCancel: () => void;
}

function ContentForm({ item, type, onSaved, onCancel }: ContentFormProps) {
  const isEditing = item !== null;
  // `type` is implicit from which tab's "Create the first…"/"Create a…"
  // button was clicked — not a form field (Dev Notes: no AC needs re-typing
  // an existing item, and there's no tab-move affordance).
  const effectiveType = item?.type ?? type;
  const [title, setTitle] = React.useState(item?.title ?? "");
  const [body, setBody] = React.useState(item?.body ?? "");
  const [attachmentUrl, setAttachmentUrl] = React.useState(
    item?.attachmentUrl ?? "",
  );
  const [titleTouched, setTitleTouched] = React.useState(false);
  const [bodyTouched, setBodyTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (isEditing) {
        const body_: UpdateContentItemRequest = {
          title: title.trim(),
          body: body.trim(),
          attachmentUrl:
            effectiveType === "document"
              ? attachmentUrl.trim() || null
              : undefined,
        };
        return updateContent(item.id, body_);
      }
      const body_: CreateContentItemRequest = {
        type: effectiveType,
        title: title.trim(),
        body: body.trim(),
        attachmentUrl:
          effectiveType === "document"
            ? attachmentUrl.trim() || undefined
            : undefined,
      };
      return createContent(body_);
    },
    onSuccess: onSaved,
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError(err.message || "Something went wrong. Please try again.");
      } else if (err instanceof NetworkError) {
        setError("No network connection. Check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
  });

  const titleError =
    titleTouched && title.trim().length === 0 ? "Title is required" : null;
  // Review finding: body is equally required by the API (@IsString
  // @MinLength(1)) but only title had a client-side check.
  const bodyError =
    bodyTouched && body.trim().length === 0 ? "Body is required" : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Same synchronous re-entrancy guard as residents.tsx's ResidentForm — a
    // fast double-click can fire a second submit before the `disabled`
    // prop's re-render lands.
    if (mutation.isPending) return;
    setTitleTouched(true);
    setBodyTouched(true);
    if (title.trim().length === 0 || body.trim().length === 0) return;
    setError(null);
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>
          {isEditing
            ? `Edit ${TYPE_SINGULAR[effectiveType]}`
            : `Create a ${TYPE_SINGULAR[effectiveType]}`}
        </DialogTitle>
      </DialogHeader>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="content-title">Title</Label>
          <Input
            id="content-title"
            className="mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            disabled={mutation.isPending}
          />
          {titleError ? (
            <p className="mt-1 text-sm text-destructive">{titleError}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="content-body">Body</Label>
          <textarea
            id="content-body"
            className="mt-1 flex min-h-32 w-full rounded-sm border border-input bg-background px-3 py-2 text-[15px] text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={mutation.isPending}
          />
          {bodyError ? (
            <p className="mt-1 text-sm text-destructive">{bodyError}</p>
          ) : null}
        </div>

        {/* Optional on every type at the API level, but only surfaced where
            an AC calls for it (AC #2 — document). */}
        {effectiveType === "document" ? (
          <div>
            <Label htmlFor="content-attachment">Attachment URL</Label>
            <Input
              id="content-attachment"
              className="mt-1"
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              disabled={mutation.isPending}
              placeholder="https://…"
            />
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <DialogFooter className="mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
