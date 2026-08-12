import "../global.css";

import * as Sentry from "@sentry/react-native";
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

// DESIGN.md fonts (Roboto/Oswald/Open Sans/Raleway) are declared as NativeWind
// tokens but not bundled as assets. Loading them requires a font source
// decision (@expo-google-fonts vs local .ttf) that is Ask-First per the frozen
// spec-17 — pending human approval, so nothing is loaded here and the hero
// classes fall back to the system sans font.

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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister }}
        >
          <AuthProvider>
            <RootNavigator />
            <StatusBar style="auto" />
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
