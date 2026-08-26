# Code Review — Blind Hunter — Story 1.10 (issue #25)

**Instrucciones:** Revisa SOLO el diff de abajo. No tienes acceso al proyecto ni al spec. Busca bugs, errores lógicos, regresiones, problemas de seguridad, usos incorrectos de APIs o bibliotecas. Reporta hallazgos como lista Markdown: título de una línea, archivo:línea, y evidencia del diff. Sé adversarial: asume que hay bugs. No inventes problemas que no estén respaldados por el diff.

## Diff (baseline c3c8e28 → HEAD, rama feature/1.10-role-based-navigation)

```diff
diff --git a/apps/admin/src/components/layout/sidebar-nav.tsx b/apps/admin/src/components/layout/sidebar-nav.tsx
index aada364..59548c9 100644
--- a/apps/admin/src/components/layout/sidebar-nav.tsx
+++ b/apps/admin/src/components/layout/sidebar-nav.tsx
@@ -1,4 +1,5 @@
 import {
+  BarChart3,
   Building2,
   CalendarDays,
   Image,
@@ -6,20 +7,38 @@ import {
   Newspaper,
   UtensilsCrossed,
   Users,
+  type LucideIcon,
 } from "lucide-react";
 
 import { cn } from "@/lib/utils";
+import { useAuth } from "@/lib/auth";
+import type { Role } from "@evergreen/shared-types";
 
-// Placeholder nav — items point at future portal sections (Epics 1-8).
-// None are routed yet; the scaffold only ships the shell (issue #27).
-const navItems = [
-  { label: "Dashboard", icon: LayoutDashboard },
-  { label: "Care homes", icon: Building2 },
-  { label: "Users", icon: Users },
-  { label: "Residents", icon: Image },
-  { label: "Content", icon: Newspaper },
-  { label: "Events", icon: CalendarDays },
-  { label: "Menu", icon: UtensilsCrossed },
+interface NavItem {
+  label: string;
+  icon: LucideIcon;
+  roles: Role[];
+  disabled?: boolean;
+}
+
+const NAV_SECTIONS: NavItem[] = [
+  { label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "super_admin", "staff"] },
+  { label: "Care homes", icon: Building2, roles: ["super_admin"] },
+  { label: "Users", icon: Users, roles: ["super_admin", "admin"] },
+  { label: "Residents", icon: Image, roles: ["admin", "staff"] },
+  { label: "Content", icon: Newspaper, roles: ["admin", "staff"] },
+  { label: "Events", icon: CalendarDays, roles: ["admin", "staff"] },
+  { label: "Menu", icon: UtensilsCrossed, roles: ["admin", "staff"] },
+  { label: "Metrics", icon: BarChart3, roles: ["super_admin", "admin"] },
 ];
@@ -35,21 +60,25 @@ export function SidebarNav({ collapsed = false, className }: SidebarNavProps) {
     >
-      {navItems.map(({ label, icon: Icon }) => (
+      {items.length === 0 ? (
+        <p className="px-4 text-sm text-muted-foreground">No sections available</p>
+      ) : (
+        items.map(({ label, icon: Icon, disabled }) => (
         <button
           key={label}
           type="button"
-          disabled
-          title={label}
+          disabled={disabled}
+          title={label}
           className={cn(...)}
         >
           <Icon className="h-5 w-5 shrink-0" aria-hidden />
           {!collapsed && <span className="text-[15px]">{label}</span>}
         </button>
-      ))}
+        ))
+      )}
     </nav>
   );
 }
\ No newline at end of file
```

```diff
diff --git a/apps/admin/src/components/permission-denied.tsx b/apps/admin/src/components/permission-denied.tsx
--- /dev/null
+++ b/apps/admin/src/components/permission-denied.tsx
@@ -0,0 +1,24 @@
+import { Link } from "@tanstack/react-router";
+import { Button } from "@/components/ui/button";
+
+export function PermissionDenied() {
+  return (
+    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
+      <h1 className="font-heading text-2xl font-bold text-foreground">
+        You don't have access to this
+      </h1>
+      <p className="mt-2 max-w-sm text-muted-foreground">
+        This area is limited to users with the right permission. Contact a
+        home admin or super admin if you believe this is a mistake.
+      </p>
+      <Button variant="outline" className="mt-6" asChild>
+        <Link to="/">Back to dashboard</Link>
+      </Button>
+    </div>
+  );
+}
\ No newline at end of file
```

```diff
diff --git a/apps/mobile/src/app/(tabs)/_layout.tsx b/apps/mobile/src/app/(tabs)/_layout.tsx
--- /dev/null
+++ b/apps/mobile/src/app/(tabs)/_layout.tsx
@@ -0,0 +1,74 @@
+import { Ionicons } from "@expo/vector-icons";
+import { Tabs } from "expo-router";
+
+export default function FamilyTabsLayout() {
+  return (
+    <Tabs
+      screenOptions={{
+        headerShown: false,
+        tabBarStyle: {
+          backgroundColor: "#FFFFFF",
+          borderTopWidth: 1,
+          borderTopColor: "#8C8C8C",
+          shadowColor: "#000",
+          shadowOpacity: 0.05,
+          shadowRadius: 4,
+        },
+        tabBarActiveTintColor: "#1B853F",
+        tabBarInactiveTintColor: "#5C5C5C",
+        tabBarLabelStyle: { fontSize: 11 },
+      }}
+    >
+      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({color,size}) => <Ionicons name="home-outline" size={size} color={color}/> }} />
+      <Tabs.Screen name="photos" options={{ title: "Photos", tabBarIcon: ({color,size}) => <Ionicons name="images-outline" size={size} color={color}/> }} />
+      <Tabs.Screen name="events" options={{ title: "Events", tabBarIcon: ({color,size}) => <Ionicons name="calendar-outline" size={size} color={color}/> }} />
+      <Tabs.Screen name="menu" options={{ title: "Menu", tabBarIcon: ({color,size}) => <Ionicons name="restaurant-outline" size={size} color={color}/> }} />
+      <Tabs.Screen name="news" options={{ title: "News", tabBarIcon: ({color,size}) => <Ionicons name="newspaper-outline" size={size} color={color}/> }} />
+    </Tabs>
+  );
+}
\ No newline at end of file
```

```diff
diff --git a/apps/mobile/src/app/(tabs)/events.tsx b/apps/mobile/src/app/(tabs)/events.tsx
--- /dev/null
+++ b/apps/mobile/src/app/(tabs)/events.tsx
@@ -0,0 +1,7 @@
+import { EmptyState } from "@/components/ui/empty-state";
+export default function EventsTabScreen() {
+  return <EmptyState title="Events" body="No events scheduled right now." />;
+}
```

```diff
diff --git a/apps/mobile/src/app/(tabs)/index.tsx b/apps/mobile/src/app/(tabs)/index.tsx
--- /dev/null
+++ b/apps/mobile/src/app/(tabs)/index.tsx
@@ -0,0 +1,8 @@
+import { EmptyState } from "@/components/ui/empty-state";
+export default function HomeTabScreen() {
+  return <EmptyState title="Home" body="Your home content will appear here soon." />;
+}
```

```diff
diff --git a/apps/mobile/src/app/(tabs)/menu.tsx b/apps/mobile/src/app/(tabs)/menu.tsx
--- /dev/null
+++ b/apps/mobile/src/app/(tabs)/menu.tsx
@@ -0,0 +1,7 @@
+import { EmptyState } from "@/components/ui/empty-state";
+export default function MenuTabScreen() {
+  return <EmptyState title="Menu" body="This week's menu will appear here soon." />;
+}
```

```diff
diff --git a/apps/mobile/src/app/(tabs)/news.tsx b/apps/mobile/src/app/(tabs)/news.tsx
--- /dev/null
+++ b/apps/mobile/src/app/(tabs)/news.tsx
@@ -0,0 +1,7 @@
+import { EmptyState } from "@/components/ui/empty-state";
+export default function NewsTabScreen() {
+  return <EmptyState title="News" body="Nothing posted yet." />;
+}
```

```diff
diff --git a/apps/mobile/src/app/(tabs)/photos.tsx b/apps/mobile/src/app/(tabs)/photos.tsx
--- /dev/null
+++ b/apps/mobile/src/app/(tabs)/photos.tsx
@@ -0,0 +1,7 @@
+import { EmptyState } from "@/components/ui/empty-state";
+export default function PhotosTabScreen() {
+  return <EmptyState title="Photos" body="No photos yet — check back soon." />;
+}
```

```diff
diff --git a/apps/mobile/src/app/_layout.tsx b/apps/mobile/src/app/_layout.tsx
index 3a53804..9dddc47 100644
--- a/apps/mobile/src/app/_layout.tsx
+++ b/apps/mobile/src/app/_layout.tsx
@@ -54,15 +54,25 @@ function RootNavigator() {
       <Stack.Protected guard={status === "resolving"}>
         <Stack.Screen name="index" />
       </Stack.Protected>
+      <Stack.Protected guard={status === "authenticated" && user?.role === "family"}>
+        <Stack.Screen name="(tabs)" />
+      </Stack.Protected>
+      <Stack.Protected guard={status === "authenticated" && user?.role !== "family"}>
+        <Stack.Screen name="home" />
+      </Stack.Protected>
+      <Stack.Protected guard={status === "authenticated" && user?.role === "family"}>
+        <Stack.Screen name="onboarding" />
+      </Stack.Protected>
       <Stack.Protected guard={status === "authenticated"}>
         <Stack.Screen name="profile" />
       </Stack.Protected>
```

```diff
diff --git a/apps/mobile/src/app/home.tsx b/apps/mobile/src/app/home.tsx
index 4075fdc..b65d114 100644
--- a/apps/mobile/src/app/home.tsx
+++ b/apps/mobile/src/app/home.tsx
@@ -1,13 +1,16 @@
 import * as React from "react";
-import { router } from "expo-router";
-import { Text, View } from "react-native";
 
+import { EmptyState } from "@/components/ui/empty-state";
 import { Button } from "@/components/ui/button";
+import { Text } from "@/components/ui/text";
 import { useAuth } from "@/lib/auth";
 
-export default function HomeScreen() {
+export default function StaffScreen() {
   const { user, signOut } = useAuth();
   const [loggingOut, setLoggingOut] = React.useState(false);
 
@@ -22,31 +25,13 @@ export default function HomeScreen() {
   };
 
   return (
-    <View className="flex-1 items-center justify-center bg-background px-gutter">
-      <Text className="font-heading text-2xl text-foreground">
-        {user?.name ?? "Welcome"}
-      </Text>
-      <Text className="mt-2 text-center text-muted-foreground">
-        Role-based navigation is coming soon.
-      </Text>
-      <Button className="mt-4" variant="outline" onPress={() => router.push("/profile")}>
-        <Text>My Profile</Text>
-      </Button>
-      <Button className="mt-4" variant="outline" disabled={loggingOut} onPress={handleLogOut}>
+    <EmptyState
+      title={user?.name ?? "Welcome"}
+      body="Photo upload is coming soon."
+    >
+      <Button variant="outline" disabled={loggingOut} onPress={handleLogOut}>
         <Text>Log out</Text>
       </Button>
-    </View>
+    </EmptyState>
   );
-}
+}
\ No newline at end of file
```

```diff
diff --git a/apps/mobile/src/components/ui/empty-state.tsx b/apps/mobile/src/components/ui/empty-state.tsx
--- /dev/null
+++ b/apps/mobile/src/components/ui/empty-state.tsx
@@ -0,0 +1,28 @@
+import * as React from "react";
+import { View } from "react-native";
+import { Text } from "@/components/ui/text";
+
+interface EmptyStateProps {
+  title: string;
+  body?: string;
+  children?: React.ReactNode;
+}
+
+export function EmptyState({ title, body, children }: EmptyStateProps) {
+  return (
+    <View className="flex-1 items-center justify-center bg-background px-gutter">
+      <Text className="text-center font-section-title text-xl text-foreground">
+        {title}
+      </Text>
+      {body ? (
+        <Text className="mt-2 text-center text-muted-foreground">{body}</Text>
+      ) : null}
+      {children ? <View className="mt-6">{children}</View> : null}
+    </View>
+  );
+}
\ No newline at end of file
```