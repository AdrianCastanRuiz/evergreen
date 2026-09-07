import * as React from "react";
import { Animated } from "react-native";

import { cn } from "@/lib/utils";

// Story 2.4 (Task 2, AC #2, UX-DR30): the first skeleton primitive in
// apps/mobile (none existed at implementation time — the ui folder only had
// button/text/input/password-input/card/empty-state). DESIGN.md defines no
// explicit skeleton token, so this matches the RN Reusables / shadcn skeleton
// primitive: a `bg-muted` block. A gentle opacity pulse signals "loading"
// without the distraction of a spinner or blank space. Consumers pass the
// dimensions/layout of whatever they're scaffolding via className.
//
// The pulse runs on a stable Animated.Value held in a ref, never accessed
// during render (the render style uses the same stable instance), so there's
// no layout thrash and no ref-access-during-render lint violation.
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  // A stable Animated.Value for the component's lifetime. useState's lazy
  // initializer runs once — the value is never recreated on re-render and no
  // ref `.current` is touched during render (avoids react-hooks/refs).
  const [opacity] = React.useState(() => new Animated.Value(0.5));

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // `opacity` is a stable instance; re-running on referential identity
    // change would restart the pulse pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Animated.View style={{ opacity }} className={cn("bg-muted", className)} />;
}