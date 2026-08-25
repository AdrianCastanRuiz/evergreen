import type { MeResponse, UpdateMeRequest } from "@evergreen/shared-types";
import * as React from "react";
import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { ApiError, authedRequest, NetworkError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Story 1.9 (FR4): any logged-in user views/edits their own name/email.
// On-blur touched-state validation (UX-DR16) ported from
// apps/admin/src/routes/login.tsx (Story 1.14) — the first time this
// pattern is needed on the mobile side.
export default function ProfileScreen() {
  const { user, updateUser } = useAuth();
  const [name, setName] = React.useState(user?.name ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const nameError =
    nameTouched && name.trim().length === 0 ? "Name is required" : null;
  const emailError =
    emailTouched && !EMAIL_RE.test(email) ? "Enter a valid email address" : null;

  const handleSave = async () => {
    setNameTouched(true);
    setEmailTouched(true);
    if (name.trim().length === 0 || !EMAIL_RE.test(email)) return;

    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const body: UpdateMeRequest = { name: name.trim(), email: email.trim() };
      const updated = await authedRequest<MeResponse>("/auth/me", {
        method: "PATCH",
        body,
      });
      updateUser(updated);
      setName(updated.name ?? "");
      setEmail(updated.email);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError("This email is already in use by another account.");
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
    <View className="flex-1 bg-background px-gutter pt-16">
      {/* No native header anywhere in this app (_layout.tsx sets
          headerShown: false globally) — an explicit back control is
          required, not optional. */}
      <Button
        variant="outline"
        className="self-start"
        onPress={() => router.back()}
      >
        <Text>Back</Text>
      </Button>

      <Text className="mt-6 font-heading text-2xl text-foreground">
        My Profile
      </Text>

      <Text className="mt-6 text-sm font-medium text-foreground">Name</Text>
      <Input
        className="mt-1"
        value={name}
        onChangeText={setName}
        onBlur={() => setNameTouched(true)}
        editable={!submitting}
        accessibilityLabel="Name"
      />
      {nameError ? (
        <Text className="mt-1 text-destructive">{nameError}</Text>
      ) : null}

      <Text className="mt-4 text-sm font-medium text-foreground">Email</Text>
      <Input
        className="mt-1"
        value={email}
        onChangeText={setEmail}
        onBlur={() => setEmailTouched(true)}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!submitting}
        accessibilityLabel="Email"
      />
      {emailError ? (
        <Text className="mt-1 text-destructive">{emailError}</Text>
      ) : null}

      {saved && !error ? (
        <Text className="mt-4 text-foreground">Profile updated.</Text>
      ) : null}
      {error ? <Text className="mt-4 text-destructive">{error}</Text> : null}

      <Button className="mt-6" disabled={submitting} onPress={handleSave}>
        {submitting ? (
          <ActivityIndicator className="text-primary-foreground" />
        ) : (
          <Text>Save</Text>
        )}
      </Button>
    </View>
  );
}
