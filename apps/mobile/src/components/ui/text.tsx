import * as React from "react";
import { Text as RNText } from "react-native";

import { cn } from "@/lib/utils";

export const TextClassContext = React.createContext<string | undefined>(undefined);

const Text = React.forwardRef<
  React.ComponentRef<typeof RNText>,
  React.ComponentPropsWithoutRef<typeof RNText>
>(({ className, ...props }, ref) => {
  const textClass = React.useContext(TextClassContext);
  return (
    <RNText
      ref={ref}
      className={cn("font-body text-base text-foreground", textClass, className)}
      {...props}
    />
  );
});
Text.displayName = "Text";

export { Text };
