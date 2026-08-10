import * as React from "react";
import { TextInput as RNTextInput } from "react-native";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  React.ComponentRef<typeof RNTextInput>,
  React.ComponentPropsWithoutRef<typeof RNTextInput>
>(({ className, placeholderClassName, ...props }, ref) => {
  return (
    <RNTextInput
      ref={ref}
      className={cn(
        "h-11 rounded-lg border-2 border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground web:focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
