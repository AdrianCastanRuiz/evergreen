import * as React from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

// UX-DR17 / UX-DR22: centered icon (optional) + section-title headline + one
// line of body copy + at most one primary action. Used by the placeholder
// tab screens established by Story 1.10 until their real content lands in
// Epics 2/3/5/6.
interface EmptyStateProps {
  title: string;
  body?: string;
  children?: React.ReactNode;
}

export function EmptyState({ title, body, children }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-gutter">
      <Text className="text-center font-section-title text-xl text-foreground">
        {title}
      </Text>
      {body ? (
        <Text className="mt-2 text-center text-muted-foreground">{body}</Text>
      ) : null}
      {children ? <View className="mt-6">{children}</View> : null}
    </View>
  );
}