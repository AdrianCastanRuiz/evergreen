import { Text, View } from "react-native";

// Placeholder root screen. Story 1.6 replaces this with the splash →
// auth-resolution flow; this screen exists so the navigation tree is valid
// before any auth screens land.
export default function IndexScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="font-hero text-[34px] font-semibold leading-[39px] tracking-[-0.01em] text-foreground">
        Evergreen
      </Text>
    </View>
  );
}
