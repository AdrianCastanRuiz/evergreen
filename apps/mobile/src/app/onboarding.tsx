import { router, useLocalSearchParams } from "expo-router";
import type { OnboardingConfirmRequest } from "@evergreen/shared-types";
import * as React from "react";
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
import { ApiError, NetworkError, request } from "@/lib/api";

// Story 1.8 (FR5): a pending family member invited by a care home (Story 1.5)
// resolves their account here — enter the invite code + set a password, which
// POSTs to /auth/onboarding/confirm. The code can be prefilled from the
// emailed deep link (?code=...). The backend answers with one generic "That
// invite code isn't valid — check with the home for a new one" for invalid /
// expired / already-used codes (no oracle, UX-DR24), shown inline at field
// level with no redirect or crash. The endpoint never returns a token pair, so
// a successful confirm replaces to login; the family then signs in with the
// new password and lands on the (tabs) home (Story 1.10).
export default function OnboardingScreen() {
  const { code: deepLinkCode } = useLocalSearchParams<{ code?: string }>();

  const [inviteCode, setInviteCode] = React.useState(
    typeof deepLinkCode === "string" ? deepLinkCode : "",
  );
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    if (submitting) return;
    // Field-level validation (UX-DR16): only check after the user tries to
    // submit, and keep them on the same screen to fix the field.
    const trimmedCode = inviteCode.trim();
    if (trimmedCode.length < 4) {
      setError("Enter your invite code.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await request<{ success: true }>("/auth/onboarding/confirm", {
        method: "POST",
        body: { inviteCode: trimmedCode, newPassword: password } satisfies OnboardingConfirmRequest,
      });
      router.replace({ pathname: "/login", params: { reset: "success" } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else if (err.status === 400) {
          // UX-DR24: inline, field-level error; stay on the same screen.
          setError(err.message);
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
        <Text className="font-hero text-[28px] leading-[34px] tracking-[-0.01em] text-foreground">
          Join your family&apos;s care home
        </Text>
        <Text className="mt-2 text-muted-foreground">
          Enter the invite code from your email and set a password to get
          started.
        </Text>

        <RNText className="mt-8 text-sm font-body-medium text-foreground">
          Invite code
        </RNText>
        <Input
          className="mt-2"
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="e.g. ABCDEFGHJK"
          accessibilityLabel="Invite code"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!submitting}
        />

        <RNText className="mt-4 text-sm font-body-medium text-foreground">
          Password
        </RNText>
        <PasswordInput
          className="mt-2"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          editable={!submitting}
        />

        <RNText className="mt-4 text-sm font-body-medium text-foreground">
          Confirm password
        </RNText>
        <PasswordInput
          className="mt-2"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Repeat your password"
          autoComplete="new-password"
          editable={!submitting}
        />

        {error ? <Text className="mt-4 text-destructive">{error}</Text> : null}

        <Button
          className="mt-8"
          size="lg"
          disabled={submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator className="text-primary-foreground" />
          ) : (
            <Text>Set password & join</Text>
          )}
        </Button>

        <Button
          className="mt-4 w-full rounded-[12px]"
          variant="outline"
          disabled={submitting}
          onPress={() => router.replace("/login")}
        >
          <Text>Already have an account? Sign in</Text>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}