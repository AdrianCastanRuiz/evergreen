import "../global.css";

import * as Sentry from "@sentry/react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";

import { AuthProvider } from "@/lib/auth";
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister }}
        >
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
            </Stack>
            <StatusBar style="auto" />
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
