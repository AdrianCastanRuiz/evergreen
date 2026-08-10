import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Pressable, type View } from "react-native";
import { TextClassContext } from "@/components/ui/text";

const buttonVariants = cva(
  "group flex items-center justify-center rounded-sm border-2 border-transparent px-4 py-2 web:focus-visible:outline-none",
  {
    variants: {
      variant: {
        default: "bg-primary active:bg-primary-hover",
        secondary: "bg-secondary active:bg-secondary",
        outline: "border-primary bg-transparent active:bg-muted",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-12 px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonTextVariants = cva(
  "web:whitespace-nowrap text-sm font-body font-medium text-primary-foreground",
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        secondary: "text-secondary-foreground",
        outline: "text-primary",
      },
      size: {
        default: "",
        sm: "text-sm",
        lg: "text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    children: React.ReactNode;
  };

const Button = React.forwardRef<View, ButtonProps>(
  ({ className, variant, size, children, disabled, ...props }, ref) => {
    return (
      <TextClassContext.Provider
        value={buttonTextVariants({ variant, size, className })}
      >
        <Pressable
          ref={ref}
          className={cn(
            buttonVariants({ variant, size, className }),
            disabled && "opacity-50",
          )}
          disabled={disabled}
          {...props}
        >
          {children}
        </Pressable>
      </TextClassContext.Provider>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonTextVariants, buttonVariants };
