import * as React from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text as RNText,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Text } from "@/components/ui/text";
import { ApiError, NetworkError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Login screen (FR2). The greeting uses the hero typography token per
// DESIGN.md ({typography.hero} — Roboto 600/34px). Errors are inline and
// scoped: invalid credentials (401), rate limit (429 — human message, never
// auto-retry), and network loss (inputs preserved for a retry without
// re-typing). No token is issued on any failure.
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
        contentContainerClassName="flex-1 justify-center px-gutter py-8"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-hero text-[34px] leading-[39px] tracking-[-0.01em] text-foreground">
          Welcome to Evergreen
        </Text>
        <Text className="mt-2 text-muted-foreground">
          Sign in to see your care home updates.
        </Text>

        <RNText className="mt-8 text-sm font-body-medium text-foreground">
          Email
        </RNText>
        <Input
          className="mt-2"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          editable={!submitting}
        />

        <RNText className="mt-4 text-sm font-body-medium text-foreground">
          Password
        </RNText>
        <PasswordInput
          className="mt-2"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          autoComplete="password"
          editable={!submitting}
        />

        {reset === "success" ? (
          <Text className="mt-4 text-foreground">
            Your password has been updated. Sign in with your new password.
          </Text>
        ) : null}

        {error ? (
          <Text className="mt-4 text-destructive">{error}</Text>
        ) : null}

        <Button
          className="mt-8"
          size="lg"
          disabled={submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator className="text-primary-foreground" />
          ) : (
            <Text>Sign in</Text>
          )}
        </Button>

        <Button
          className="mt-4"
          variant="outline"
          disabled={submitting}
          onPress={() => router.push("/request-password-reset")}
        >
          <Text>Forgot your password?</Text>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
