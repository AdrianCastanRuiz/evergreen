import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";

import { HomeHeader } from "@/components/home-header";

// Family bottom-tab-bar (FR10, UX-DR13). Persistent bottom navigation with
// no badge counts: active tab in primary, inactive in muted-foreground, on
// a white bar. Home/Photos/Events/Menu/News are placeholder screens whose
// real content lands in Epics 2/3/5/6 — this route group only establishes
// the role-scoped navigation shell (Story 1.10 AC #1).
//
// HomeHeader sits above the Tabs navigator (not per-screen headers) so the
// active care home's name stays visible across every tab, not just Home.
// The inner `flex-1` wrapper is required: as a sibling of HomeHeader's
// fixed-height bar, the Tabs navigator needs its own explicit flex to fill
// the remaining space (it no longer gets that for free as the sole child).
export default function FamilyTabsLayout() {
  return (
    <View className="flex-1 bg-background">
      <HomeHeader />
      <View className="flex-1">
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: "#FFFFFF",
              borderTopWidth: 1,
              borderTopColor: "#8C8C8C", // {colors.border}
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 4,
            },
            tabBarActiveTintColor: "#1B853F", // {colors.primary}
            tabBarInactiveTintColor: "#5C5C5C", // {colors.muted-foreground}
            tabBarLabelStyle: { fontSize: 11 },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="home-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="photos"
            options={{
              title: "Photos",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="images-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="events"
            options={{
              title: "Events",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="calendar-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="menu"
            options={{
              title: "Menu",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="restaurant-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="news"
            options={{
              title: "News",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="newspaper-outline" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}
