import * as React from "react";
import { Pressable, type View } from "react-native";

import { cn } from "@/lib/utils";

// A compact, icon-only pressable. The touch target stays at the 44pt/48dp
// accessibility floor (EXPERIENCE.md — this app's family audience skews
// older/less tech-fluent) even though the icon glyph itself is small;
// shrink the icon size, never this box.
type IconButtonProps = React.ComponentPropsWithoutRef<typeof Pressable>;

const IconButton = React.forwardRef<View, IconButtonProps>(
  ({ className, disabled, ...props }, ref) => {
    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        className={cn(
          "h-11 w-11 items-center justify-center rounded-full active:bg-muted",
          disabled && "opacity-50",
          className,
        )}
        disabled={disabled}
        {...props}
      />
    );
  },
);
IconButton.displayName = "IconButton";

export { IconButton };
