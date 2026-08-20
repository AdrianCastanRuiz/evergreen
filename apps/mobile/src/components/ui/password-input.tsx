import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { Pressable, TextInput as RNTextInput, View } from "react-native";

import { cn } from "@/lib/utils";

interface PasswordInputProps
  extends React.ComponentPropsWithoutRef<typeof RNTextInput> {
  className?: string;
  // Overrides the inner TextInput's visual style (border/bg/radius/etc.)
  // independently of `className`, which only affects the wrapper View's
  // layout (margin/position). Defaults preserve every existing caller's
  // look untouched.
  inputClassName?: string;
}

// Password field with a show/hide toggle (eye / eye-off). Replaces the bare
// Input for password fields so the user can verify what they typed — a UX
// baseline for any password form (login, set-password). The toggle is a
// sibling Pressable, never a TextInput child, so focus/keyboard stay intact.
const PasswordInput = React.forwardRef<RNTextInput, PasswordInputProps>(
  ({ className, inputClassName, editable, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <View className={cn("relative", className)}>
        <RNTextInput
          ref={ref}
          secureTextEntry={!visible}
          className={cn(
            "h-11 rounded-lg border-2 border-input bg-card pr-11 pl-3 text-base text-foreground placeholder:text-muted-foreground web:focus-visible:outline-none",
            editable === false && "opacity-50",
            inputClassName,
          )}
          editable={editable}
          {...props}
        />
        <Pressable
          className="absolute right-0 top-0 h-11 w-11 items-center justify-center"
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
        >
          <Ionicons
            name={visible ? "eye-off" : "eye"}
            size={22}
            color="#5C5C5C"
          />
        </Pressable>
      </View>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
