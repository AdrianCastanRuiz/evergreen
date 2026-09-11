import "../global.css";

import { Roboto_600SemiBold } from "@expo-google-fonts/roboto";
import { Oswald_600SemiBold } from "@expo-google-fonts/oswald";
import {
  OpenSans_400Regular,
  OpenSans_500Medium,
  OpenSans_600SemiBold,
} from "@expo-google-fonts/open-sans";
import { Raleway_600SemiBold } from "@expo-google-fonts/raleway";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";

import { useAuth, AuthProvider } from "@/lib/auth";
import { queryClient, queryPersister } from "@/lib/query-client";
import { ResidentProvider, useResidents } from "@/lib/resident-context";

// Expo only inlines process.env.EXPO_PUBLIC_* into the client bundle —
// SENTRY_DSN without the prefix would be undefined at runtime (AD-15).
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, enabled: true });
}

// DESIGN.md fonts (Roboto/Oswald/Open Sans/Raleway) as @expo-google-fonts
// variants. Each tailwind font token (hero/heading/body/...) maps to a
// concrete weight-embedded variant, so no separate fontWeight is used with
// custom fonts (Android renders empty otherwise).
// ...Ionicons.font is included here too: the tab bar (and PasswordInput's
// eye toggle) render Ionicons glyphs, and without gating on the icon font
// the same way as the DESIGN.md fonts below, the tab bar can mount before
// the font is ready — rendering tofu glyphs that never recover once it
// loads, since nothing here would trigger a re-render after the fact.
const FONTS = {
  Roboto_600SemiBold,
  Oswald_600SemiBold,
  OpenSans_400Regular,
  OpenSans_500Medium,
  OpenSans_600SemiBold,
  Raleway_600SemiBold,
  ...Ionicons.font,
};

// Auth-gated navigation (FR8). The Stack tree is STABLE — same screens in the
// same order on every render — and only the Stack.Protected guards change with
// auth state. expo-router redirects to the first available screen (the anchor)
// whenever the current screen's guard turns false. Do NOT conditionally render
// different Stack trees: swapping the tree's identity between renders leaves
// the navigator stuck on the last rendered screen (the original splash-freeze
// bug after a successful resolve).
function RootNavigator() {
  const { status, user } = useAuth();
  // Story 2.3 (Task 6): the family "has a linked resident?" gate. The
  // linked-residents list is fetched here (via ResidentProvider, enabled only
  // for authenticated family) so it is known BEFORE the Stack.Protected
  // guards below evaluate — closing the gap the old comment left open ("the
  // gate has no data source yet"). A family member with zero links is routed
  // to onboarding instead of (tabs), per EXPERIENCE.md's State Patterns.
  const { residents, isLoading, error } = useResidents();

  const isFamily = status === "authenticated" && user?.role === "family";
  // `isLoading` is true only while the first fetch is in flight (no cached
  // data yet) and goes false once it settles — whether with data, an empty
  // array, or an error. So "known" = resolved, never shares the "resolving"
  // branch (which previously held the splash forever when the fetch failed).
  const residentsKnown = isFamily ? !isLoading : true;
  const hasResidents = isFamily ? (residents?.length ?? 0) > 0 : true;
  // A FAILED fetch (offline, 5xx) is NOT "zero residents": routing an errored
  // family to onboarding would be wrong. Send them to (tabs), whose Home
  // screen surfaces the inline error + Retry instead.
  const residentsErrored = isFamily ? error != null : false;

  // While the family resident list is still RESOLVING (not resolved-with-an-
  // error), hold the splash (index) rather than flash the wrong route — the
  // same "extend the existing resolving pattern" approach as the auth splash
  // (Story 1.6), not a second, parallel loading state.
  const showSplash = status === "resolving" || (isFamily && !residentsKnown);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={showSplash}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      {/* Family → the (tabs) group with Home/Photos/Events/Menu/News (FR10,
          Story 1.10 AC #1). Story 2.3 closes the "has a linked resident?"
          gate: a family member lands here once we know they have at least one
          linked resident — OR when the fetch errored (the Home screen shows
          the inline error + Retry, so they don't fall to onboarding on a
          transient failure). */}
      <Stack.Protected guard={isFamily && residentsKnown && (hasResidents || residentsErrored)}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      {/* Unauthenticated anchor is login (declared first among this block and
          before home/profile so it wins for anonymous users). request-password-
          reset is also public. These two stay gated on `unauthenticated` ONLY:
          an already-authenticated family member must NOT be able to land back
          on login (they'd be stuck — see the onboarding block below). */}
      <Stack.Protected guard={status === "unauthenticated"}>
        <Stack.Screen name="login" />
        <Stack.Screen name="request-password-reset" />
      </Stack.Protected>
      {/* onboarding is a public invite-code flow (Story 1.8, FR5): reachable
          logged out (login screen's "Have an invite code?" link / emailed deep
          link). Story 2.3 ALSO routs an authenticated family member with ZERO
          linked residents here (EXPERIENCE.md State Patterns). It is gated
          separately from login so that a logged-in zero-link family is not left
          on the login form: expo-router redirects to the FIRST available
          screen, and onboarding is the only one open for them. Must stay after
          (tabs) — an authenticated family WITH residents keeps landing on tabs —
          and before home/profile. */}
      <Stack.Protected guard={status === "unauthenticated" || (isFamily && residentsKnown && !hasResidents && !residentsErrored)}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      {/* Staff (and non-family) → single-screen, no tab bar (Story 1.10 AC #2).
          Admin/super_admin keep this screen on mobile (portal is their home). */}
      <Stack.Protected guard={status === "authenticated" && user?.role !== "family"}>
        <Stack.Screen name="home" />
      </Stack.Protected>
      {/* Profile (Story 1.9, FR4) is reachable by any authenticated user,
          regardless of role. */}
      <Stack.Protected guard={status === "authenticated"}>
        <Stack.Screen name="profile" />
      </Stack.Protected>
      {/* reset-password must stay reachable while "resolving" so a cold-start
          deep link from the emailed reset URL lands here before /auth/me
          settles — but never while a session is active. Declared after login
          so the unauthenticated anchor stays login. */}
      <Stack.Protected guard={status !== "authenticated"}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Hold the splash native screen while the bundled fonts load — rendering
  // the UI with a half-loaded font set would flash the system sans font and
  //, on Android, can render empty glyphs for families that aren't ready.
  const [fontsLoaded, fontsError] = useFonts(FONTS);
  const renderApp = fontsLoaded || fontsError != null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister }}
        >
          <AuthProvider>
            <ResidentProvider>
              {renderApp ? (
                <>
                  <RootNavigator />
                  <StatusBar style="auto" />
                </>
              ) : (
                <StatusBar style="auto" />
              )}
            </ResidentProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
