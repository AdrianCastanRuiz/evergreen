import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as React from "react";
import { View } from "react-native";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  React.ComponentRef<typeof View>,
  ComponentPropsWithoutRef<typeof View> & {
    header?: ReactNode;
    footer?: ReactNode;
  }
>(({ className, header, footer, children, ...props }, ref) => {
  return (
    <View
      ref={ref}
      className={cn(
        "rounded-md border border-border bg-card p-4",
        className,
      )}
      {...props}
    >
      {header ? <View className="mb-3">{header}</View> : null}
      {children}
      {footer ? <View className="mt-3">{footer}</View> : null}
    </View>
  );
});
Card.displayName = "Card";

export { Card };
