import * as React from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text as RNText,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { ApiError, NetworkError, request } from "@/lib/api";

// Request-reset screen (FR3/NFR9): email → POST /auth/password-reset. The
// endpoint is fire-and-forget and answers 204 whether or not the email is
// registered, so the success copy stays generic and never reveals account
// existence (no enumeration oracle). On success we show a confirmation and
// point back to login.
export default function RequestPasswordResetScreen() {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!email.trim()) {
      setError("Enter your email to receive a reset link.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await request<undefined>("/auth/password-reset", {
        method: "POST",
        body: { email: email.trim() },
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
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

  if (submitted) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-1 justify-center px-gutter py-8"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="font-hero text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-foreground">
            Check your email
          </Text>
          <Text className="mt-2 text-muted-foreground">
            If an account is registered for that email, {"you'll"} receive a link
            to set a new password. It expires in 1 hour and can only be used
            once.
          </Text>
          <Button
            className="mt-8"
            size="lg"
            onPress={() => router.replace("/login")}
          >
            <Text>Back to sign in</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-1 justify-center px-gutter py-8"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-hero text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-foreground">
          Reset your password
        </Text>
        <Text className="mt-2 text-muted-foreground">
          Enter the email you signed up with and {"we'll"} send you a link to set a
          new password.
        </Text>

        <RNText className="mt-8 text-sm font-body font-medium text-foreground">
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
            <Text>Send reset link</Text>
          )}
        </Button>

        <Button
          className="mt-4"
          variant="outline"
          onPress={() => router.replace("/login")}
        >
          <Text>Back to sign in</Text>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
