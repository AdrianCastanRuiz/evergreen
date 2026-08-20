import * as React from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Text } from "@/components/ui/text";
import { ApiError, NetworkError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Login screen (FR2). Visual treatment deliberately matches the
// evergreendemo.netlify.app reference 1:1 (logo, copy, coral accent
// #CD6B5D) per explicit request — this is a one-off departure from
// DESIGN.md's green primary/destructive-red split, scoped to this screen
// only via arbitrary-value classNames (no shared token/component change).
// Errors are inline and scoped: invalid credentials (401), rate limit
// (429 — human message, never auto-retry), and network loss (inputs
// preserved for a retry without re-typing). No token is issued on any
// failure.
export default function LoginScreen() {
  const { signIn } = useAuth();
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError(
            "Too many attempts. Please wait a minute and try again.",
          );
        } else if (err.status === 401) {
          setError("Invalid email or password");
        } else {
          setError("Something went wrong. Please try again.");
        }
      } else if (err instanceof NetworkError) {
        setError("No network connection. Check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-1 justify-center items-center px-gutter py-8"
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("@/assets/images/evergreen-logo.jpg")}
          className="h-24 w-24 rounded-full"
          accessibilityRole="image"
          accessibilityLabel="Evergreen Care logo"
        />

        <Text className="mt-4 text-[24px] font-bold leading-[29px] text-[#3a3d30]">
          Evergreen Care
        </Text>
        <Text className="mt-1 text-[13px] text-[#7a7f6a]">
          Connecting families with their loved ones
        </Text>

        <Input
          className="mt-9 w-full rounded-xl border-[1.5px] border-[#e8e8e4] bg-[#f5f5f3] text-foreground"
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          accessibilityLabel="Email address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          editable={!submitting}
        />

        <PasswordInput
          className="mt-3 w-full"
          inputClassName="rounded-xl border-[1.5px] border-[#e8e8e4] bg-[#f5f5f3]"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          accessibilityLabel="Password"
          autoComplete="password"
          editable={!submitting}
        />

        {reset === "success" ? (
          <Text className="mt-4 self-start text-foreground">
            Your password has been updated. Sign in with your new password.
          </Text>
        ) : null}

        {error ? (
          <Text className="mt-4 self-start text-destructive">{error}</Text>
        ) : null}

        <Button
          className="mt-2 w-full rounded-xl bg-[#CD6B5D] active:bg-[#b85a4d]"
          size="lg"
          disabled={submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white">Sign In</Text>
          )}
        </Button>

        <Button
          className="mt-4 w-full rounded-xl border-[#CD6B5D]"
          variant="outline"
          disabled={submitting}
          onPress={() => router.push("/request-password-reset")}
        >
          <Text className="text-[#CD6B5D]">Forgot your password?</Text>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
