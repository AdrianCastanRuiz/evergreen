import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text as RNText,
} from "react-native";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Text } from "@/components/ui/text";
import { ApiError, NetworkError, request } from "@/lib/api";

// Set-password screen (NFR9/AD-8): consumes the single-use token from the
// emailed deep link (?token=...), POSTs it to /auth/password-reset/confirm,
// and on success replaces to login. The backend answers with one generic
// "invalid or expired" message for expired/used/unknown tokens (no oracle),
// which we show verbatim alongside a "request a new link" path. The endpoint
// never returns a token pair, so a successful confirm always lands on login.
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = React.useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!token) {
      setTokenRejected(true);
      setError("This link is invalid or has expired. Please request a new one.");
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
    setTokenRejected(false);
    try {
      await request<{ success: true }>("/auth/password-reset/confirm", {
        method: "POST",
        body: { token, newPassword: password },
      });
      router.replace({ pathname: "/login", params: { reset: "success" } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else if (err.status === 400) {
          setTokenRejected(true);
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

  const requestNewLink = () => {
    router.replace("/request-password-reset");
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
          Set a new password
        </Text>
        <Text className="mt-2 text-muted-foreground">
          Choose a new password for your Evergreen account.
        </Text>

        {!token || tokenRejected ? (
          <>
            <Text className="mt-8 text-destructive">
              {error ??
                "This link is invalid or has expired. Please request a new one."}
            </Text>
            <Button
              className="mt-8"
              size="lg"
              onPress={requestNewLink}
            >
              <Text>Request a new link</Text>
            </Button>
          </>
        ) : (
          <>
            <RNText className="mt-8 text-sm font-body-medium text-foreground">
              New password
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
                <Text>Set password</Text>
              )}
            </Button>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
