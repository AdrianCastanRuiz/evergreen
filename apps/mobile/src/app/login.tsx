import * as React from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Text } from "@/components/ui/text";
import { ApiError, NetworkError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Login screen (FR2). Visual treatment deliberately matches the
// evergreendemo.netlify.app reference (logo, copy, coral accent) per
// explicit request — a one-off departure from DESIGN.md's green
// primary/destructive-red split, scoped to this screen only via
// arbitrary-value classNames (no shared token/component change). The
// demo's raw coral (#CD6B5D) and subtitle gray (#7a7f6a) both fail WCAG
// AA (4.5:1) as text/button-label colors on white — darkened here to the
// nearest AA-passing shade of the same hue rather than reproduced exactly
// (code-review finding). Errors are inline and scoped: invalid
// credentials (401), rate limit (429 — human message, never auto-retry),
// and network loss (inputs preserved for a retry without re-typing). No
// token is issued on any failure.
// #AE5B4F / #9D5247 (resting / pressed button coral) are the same darkened
// shades as below, kept literal in each className — NativeWind can't
// extract an arbitrary-value class from a JS variable, so there's no way
// to back those particular occurrences with a shared constant.
const SUBTITLE_GRAY = "#707562"; // darkened from the demo's #7a7f6a — ~4.76:1 on white (AA)
// border-2 border-input are already Input/PasswordInput's own defaults —
// the flat fill, larger radius, and roomier height are the actual
// overrides here. Horizontal padding is deliberately NOT included: it's
// added separately per field below (`px-4` on Input, `pl-4` on
// PasswordInput) because PasswordInput's own `pr-11` (space for the
// show/hide icon) must survive — a shared `px-4` here would collide with
// it under tailwind-merge's px/pr conflict resolution and eat the icon's
// clearance.
const FIELD_STYLE = "w-full h-12 rounded-[12px] bg-[#f5f5f3] text-foreground";

export default function LoginScreen() {
  const { signIn, sessionEndReason, clearSessionEndReason } = useAuth();
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // A session-expiry landing must be heard once, not on every later visit to
  // login (e.g. returning from the request-reset screen). Clear the reason
  // when this screen unmounts so it never re-shows for an unrelated login.
  React.useEffect(() => {
    return () => clearSessionEndReason();
  }, [clearSessionEndReason]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (email.trim().length === 0 || password.length === 0) {
      setError("Please enter your email and password.");
      return;
    }
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
      {/* Purely decorative — two oversized soft-tone circles bleeding off
          the top-left/bottom-right corners, echoing the logo's sage green
          and the screen's coral accent, so the screen doesn't read as a
          bare white form. pointerEvents="none" so they never intercept
          touches meant for the form above them. */}
      <View className="absolute inset-0" pointerEvents="none">
        <View className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-[#8FA37A] opacity-[0.12]" />
        <View className="absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-[#AE5B4F] opacity-[0.10]" />
      </View>

      <ScrollView
        contentContainerClassName="flex-1 justify-center items-center px-gutter py-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center justify-center">
          <View className="absolute h-32 w-32 rounded-full bg-[#8FA37A] opacity-[0.15]" />
          <Image
            source={require("@/assets/images/evergreen-logo.jpg")}
            className="h-24 w-24 rounded-full"
            accessibilityRole="image"
            accessibilityLabel="Evergreen Care logo"
          />
        </View>

        {/* font-body-emphasis (OpenSans_600SemiBold), not font-bold: a
            fontWeight utility stacked on a custom fontFamily renders empty
            on Android — no 700-weight Open Sans is loaded (see
            tailwind.config.js). Code-review finding. */}
        <Text className="mt-4 font-body-emphasis text-[24px] leading-[29px] text-[#3a3d30]">
          Evergreen Care
        </Text>
        <Text className="mt-1 text-[13px]" style={{ color: SUBTITLE_GRAY }}>
          Connecting families with their loved ones
        </Text>

        <Input
          className={`mt-9 px-4 ${FIELD_STYLE}`}
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
          inputClassName={`pl-4 ${FIELD_STYLE}`}
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

        {sessionEndReason === "expired" ? (
          <Text className="mt-4 text-foreground">
            Your session ended. Please log in again.
          </Text>
        ) : null}

        {error ? (
          <Text className="mt-4 self-start text-destructive">{error}</Text>
        ) : null}

        {/* #AE5B4F / #9D5247: the demo's coral (#CD6B5D) darkened to pass
            WCAG AA (4.5:1) as button/link text and fill on white — see the
            file-header comment. Repeated literally across the three
            occurrences below (button fill, pressed fill, outline
            border/text) because NativeWind requires a static
            arbitrary-value class name — it cannot extract one from a JS
            variable — so there's no way to back these with a single
            shared constant (code-review finding). */}
        {/* Green (bg-primary/active:bg-primary-hover), matching the
            primary action on request-password-reset.tsx — the Sign In
            button uses the app's standard green primary, not the coral
            accent used elsewhere on this screen. */}
        <Button
          className="mt-2 w-full rounded-[12px]"
          size="lg"
          disabled={submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator className="text-primary-foreground" />
          ) : (
            <Text>Sign In</Text>
          )}
        </Button>

        <Button
          className="mt-4 w-full rounded-[12px] border-[#AE5B4F]"
          variant="outline"
          disabled={submitting}
          onPress={() => router.push("/request-password-reset")}
        >
          <Text className="text-[#AE5B4F]">Forgot your password?</Text>
        </Button>

        {/* Story 1.8 (FR5): a pending family member invited by email has no
            session yet, so onboarding (invite code + set password) must be
            reachable from here, logged out. */}
        <Button
          className="mt-3 w-full rounded-[12px]"
          variant="outline"
          disabled={submitting}
          onPress={() => router.push("/onboarding")}
        >
          <Text>Have an invite code?</Text>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
