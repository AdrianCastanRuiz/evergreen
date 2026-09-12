import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import type {
  ContentItem,
  ContentType,
  PaginatedResponse,
} from "@evergreen/shared-types";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { authedRequest } from "@/lib/api";
import { useResidents } from "@/lib/resident-context";

// Story 3.2 (Dev Notes: "Where do the other 4 content types render?"):
// EXPERIENCE.md/DESIGN.md only ever design ONE combined "News & Documents"
// destination for all six ContentType values — no per-type screen exists or
// is planned. Confirmed with Adrian (2026-09-10). Do not split this into
// per-type tabs/screens.
const TYPE_LABELS: Record<ContentType, string> = {
  news: "News",
  document: "Document",
  schedule: "Schedule",
  notice: "Notice",
  static_page: "Static Page",
  announcement: "Announcement",
};

function formatPublishedDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function itemMeta(item: ContentItem): string {
  return [formatPublishedDate(item.publishedAt), TYPE_LABELS[item.type]]
    .filter(Boolean)
    .join(" · ");
}

// pageSize=50, no second-page fetch: no AC calls for a "load more"/
// infinite-scroll interaction here — a future story's problem if a home's
// content ever exceeds this (see Completion Notes).
function fetchContent(
  homeId: string,
): Promise<PaginatedResponse<ContentItem>> {
  return authedRequest<PaginatedResponse<ContentItem>>(
    "/content?pageSize=50",
    { headers: { "X-Active-Home-Id": homeId } },
  );
}

function NewsRowSkeleton() {
  return (
    <Card>
      <Skeleton className="h-5 w-3/4 rounded-sm" />
      <Skeleton className="mt-2 h-4 w-1/3 rounded-sm" />
    </Card>
  );
}

// Review finding: the empty/error states need their own pull-to-refresh —
// without it, a family member looking at "Nothing posted yet" (or a load
// error) has no way to check for new content short of navigating away and
// back. `flexGrow` on the content container lets EmptyState's own
// `flex-1 items-center justify-center` still center within the scrollable
// area instead of collapsing to content height.
interface RefreshableStateProps {
  onRefresh: () => void;
  refreshing: boolean;
  children: React.ReactNode;
}

function RefreshableState({
  onRefresh,
  refreshing,
  children,
}: RefreshableStateProps) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {children}
    </ScrollView>
  );
}

// Family News tab (FR10, UX-DR13, Story 3.2 AC #1-#8). Replaces Story 1.10's
// placeholder. Fetches the active resident's home's published content via
// the X-Active-Home-Id header (Task 4) — the family JWT itself carries no
// fixed home_id (AD-18), so this is the first mobile screen to build that
// header at all.
export default function NewsTabScreen() {
  const {
    residents,
    isLoading: residentsLoading,
    error: residentsError,
    activeResidentId,
  } = useResidents();
  const activeResidentHomeId = residents?.find(
    (r) => r.id === activeResidentId,
  )?.homeId;

  const [detailItem, setDetailItem] = React.useState<ContentItem | null>(
    null,
  );

  // Review finding: without this, switching the active resident to one in a
  // different home could leave a stale, now-inactive-home item visible in an
  // already-open detail modal. Deferred out of the synchronous effect body
  // (same pattern resident-context.tsx's own reconciliation effect uses) —
  // the react-hooks/set-state-in-effect rule can't prove a same-tick setState
  // is safe here.
  React.useEffect(() => {
    const timer = setTimeout(() => setDetailItem(null), 0);
    return () => clearTimeout(timer);
  }, [activeResidentHomeId]);

  const query = useQuery({
    // Re-fetches automatically when the active resident (and therefore
    // their home) changes — same re-scope-on-switch behavior Photos/Events/
    // Menu already have per Story 2.3 AC #3, reusing the resident-switcher's
    // existing side effect rather than a new "home switcher" control.
    queryKey: ["content", activeResidentHomeId],
    queryFn: () => fetchContent(activeResidentHomeId!),
    enabled: !!activeResidentHomeId,
  });

  const items = query.data?.data ?? [];

  const handlePress = (item: ContentItem) => {
    if (item.type === "document" && item.attachmentUrl) {
      // Review finding: falls back to the inline detail view instead of a
      // silent no-op if the device has no handler for the URL (or it's
      // malformed) — still gives the family member the title/body.
      Linking.openURL(item.attachmentUrl).catch(() => setDetailItem(item));
      return;
    }
    setDetailItem(item);
  };

  // Review finding: without checking useResidents()'s own loading/error
  // state first, this fell straight through to the content query's states —
  // a disabled, never-fetched query reports isLoading: false (TanStack Query
  // v5), so a still-loading or errored residents list looked identical to a
  // genuinely empty home ("Nothing posted yet").
  if (residentsLoading && residents === undefined) {
    return (
      <View className="flex-1 bg-background px-gutter pt-16">
        <View className="gap-3">
          <NewsRowSkeleton />
          <NewsRowSkeleton />
          <NewsRowSkeleton />
        </View>
      </View>
    );
  }

  if (residentsError) {
    return (
      <View className="flex-1 bg-background px-gutter pt-16">
        <EmptyState
          title="News"
          body="We couldn't load your residents. Check your connection and try again."
        />
      </View>
    );
  }

  // Defensive, per UX-DR17/EXPERIENCE.md (same posture as (tabs)/index.tsx):
  // Story 2.3's _layout.tsx gate should already route a zero-link family to
  // onboarding before this tab is ever reachable, so this is normally
  // unreachable — without it, a zero-links account would see the loading
  // skeleton forever (activeResidentHomeId never resolves).
  if (!residents || residents.length === 0) {
    return (
      <View className="flex-1 bg-background px-gutter pt-16">
        <EmptyState
          title="News"
          body="No residents are linked to your account yet."
        />
      </View>
    );
  }

  if (query.isLoading && !query.data) {
    return (
      <View className="flex-1 bg-background px-gutter pt-16">
        <View className="gap-3">
          <NewsRowSkeleton />
          <NewsRowSkeleton />
          <NewsRowSkeleton />
        </View>
      </View>
    );
  }

  if (query.isError) {
    return (
      <RefreshableState
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <View className="flex-1 px-gutter pt-16">
          <EmptyState
            title="News"
            body="We couldn't load your home's news. Check your connection and try again."
          >
            <Button variant="outline" onPress={() => void query.refetch()}>
              <Text>Retry</Text>
            </Button>
          </EmptyState>
        </View>
      </RefreshableState>
    );
  }

  if (items.length === 0) {
    return (
      <RefreshableState
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <View className="flex-1 px-gutter pt-16">
          <EmptyState title="News" body="Nothing posted yet." />
        </View>
      </RefreshableState>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 px-gutter pb-6 pt-16"
        // First pull-to-refresh in apps/mobile (confirmed no existing screen
        // uses RefreshControl) — standard native gesture, no custom
        // affordance needed per EXPERIENCE.md's Interaction Primitives.
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handlePress(item)}
            className="active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${itemMeta(item)}`}
          >
            <Card>
              <Text
                numberOfLines={2}
                className="font-heading-sm text-[17px] leading-[21px] text-foreground"
              >
                {item.title}
              </Text>
              <Text className="mt-1 font-caption text-sm text-muted-foreground">
                {itemMeta(item)}
              </Text>
            </Card>
          </Pressable>
        )}
      />

      {/* Minimal inline detail view (Dev Notes: "a modal or a pushed
          screen... no new design system component required") — every type
          except document (which opens its attachmentUrl directly) taps
          through to this. */}
      <Modal
        visible={detailItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailItem(null)}
      >
        <View className="flex-1 bg-background px-gutter pt-6">
          <View className="flex-row justify-end">
            <IconButton
              accessibilityLabel="Close"
              onPress={() => setDetailItem(null)}
            >
              <Ionicons name="close" size={24} color="#5C5C5C" />
            </IconButton>
          </View>
          {detailItem ? (
            <ScrollView className="mt-2">
              <View className="gap-3 pb-6">
                <Text className="font-heading text-2xl text-foreground">
                  {detailItem.title}
                </Text>
                <Text className="font-caption text-sm text-muted-foreground">
                  {itemMeta(detailItem)}
                </Text>
                <Text className="font-body text-base text-foreground">
                  {detailItem.body}
                </Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
