import { Text, View } from "react-native";

// Splash screen (FR8): shown while AuthProvider resolves the keychain session.
// Once resolution completes, RootLayout's Stack.Protected guards auto-redirect
// to the available screen (login / onboarding / home) — the redirect must not
// live here because this screen unmounts as soon as navigation leaves it.
export default function SplashScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="font-hero text-[34px] leading-[39px] tracking-[-0.01em] text-foreground">
        Evergreen
      </Text>
    </View>
  );
}
