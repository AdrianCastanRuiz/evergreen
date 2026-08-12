import "../global.css";

import { Roboto_600SemiBold } from "@expo-google-fonts/roboto";
import { Oswald_600SemiBold } from "@expo-google-fonts/oswald";
import {
  OpenSans_400Regular,
  OpenSans_500Medium,
  OpenSans_600SemiBold,
} from "@expo-google-fonts/open-sans";
import { Raleway_600SemiBold } from "@expo-google-fonts/raleway";
import * as Sentry from "@sentry/react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";

import { useAuth, AuthProvider } from "@/lib/auth";
import { queryClient, queryPersister } from "@/lib/query-client";

// Expo only inlines process.env.EXPO_PUBLIC_* into the client bundle —
// SENTRY_DSN without the prefix would be undefined at runtime (AD-15).
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, enabled: true });
}

// DESIGN.md fonts (Roboto/Oswald/Open Sans/Raleway) as @expo-google-fonts
// variants. Each tailwind font token (hero/heading/body/...) maps to a
// concrete weight-embedded variant, so no separate fontWeight is used with
// custom fonts (Android renders empty otherwise).
const FONTS = {
  Roboto_600SemiBold,
  Oswald_600SemiBold,
  OpenSans_400Regular,
  OpenSans_500Medium,
  OpenSans_600SemiBold,
  Raleway_600SemiBold,
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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === "resolving"}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={status === "authenticated" && user?.role !== "family"}>
        <Stack.Screen name="home" />
      </Stack.Protected>
      <Stack.Protected guard={status === "authenticated" && user?.role === "family"}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={status === "unauthenticated"}>
        <Stack.Screen name="login" />
        <Stack.Screen name="request-password-reset" />
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
            {renderApp ? (
              <>
                <RootNavigator />
                <StatusBar style="auto" />
              </>
            ) : (
              <StatusBar style="auto" />
            )}
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
