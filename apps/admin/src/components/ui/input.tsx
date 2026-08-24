import * as React from "react";

import { cn } from "@/lib/utils";

// form-input (DESIGN.md): colors.background fill, colors.input border,
// rounded.DEFAULT corner, colors.ring focus ring. h-11/text-[15px] match
// Button's sizing (44pt/48dp minimum touch target, per DESIGN.md).
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-sm border border-input bg-background px-3 py-2 text-[15px] text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
