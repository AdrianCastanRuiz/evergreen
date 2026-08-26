# Code Review — Edge Case Hunter — Story 1.10 (issue #25)

**Instrucciones:** Recibes el diff de Story 1.10 (abajo) y acceso de lectura al proyecto. Recorre cada rama de decisión y condición límite del código, y reporta UNICAMENTE edge cases NO MANEJADOS. Método, no actitud. Para cada hallazgo: título de una línea, archivo:línea, el escenario exacto no cubierto, y por qué importa. Lee los archivos del proyecto para darle contexto (por ejemplo: cómo se usa `Stack.Protected`, `useAuth`, el `Role` enum, la estructura del `Tabs`, `MeResponse`).

**Contexto del proyecto:**
- `apps/mobile/src/app/_layout.tsx` — árbol de navegación expo-router estable con `Stack.Protected`.
- `apps/mobile/src/lib/auth.tsx` — `useAuth()` expone `status`, `user` (MeResponse), `signIn`, `signOut`. `AuthStatus = "resolving" | "authenticated" | "unauthenticated"`.
- `packages/shared-types/src/common.ts:23` — `Role = "family" | "staff" | "admin" | "super_admin"`.
- `packages/shared-types/src/auth.ts:21-28` — `MeResponse { id, email, name, role, isActive, homeId }` (no trae residentes vinculados).
- `apps/admin/src/components/layout/shell.tsx` — Shell responsive (lg sidebar, md rail, <md Sheet).
- APP: esta story crea el nav role-scoped. Mobile tiene un `(tabs)` group para family (Solo EXPO ROUTER file-based). El `_layout.tsx` usa guards por rol.

## Diff (Story 1.10)

```diff
# apps/mobile/src/app/_layout.tsx
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
# apps/mobile/src/app/(tabs)/_layout.tsx (nuevo)
export default function FamilyTabsLayout() {
  return (
    <Tabs screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#8C8C8C", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4 },
        tabBarActiveTintColor: "#1B853F",
        tabBarInactiveTintColor: "#5C5C5C",
        tabBarLabelStyle: { fontSize: 11 },
      }}>
      <Tabs.Screen name="index" options={{ title: "Home", ... }} />
      <Tabs.Screen name="photos" options={{ title: "Photos", ... }} />
      <Tabs.Screen name="events" options={{ title: "Events", ... }} />
      <Tabs.Screen name="menu" options={{ title: "Menu", ... }} />
      <Tabs.Screen name="news" options={{ title: "News", ... }} />
    </Tabs>
  );
}
```

```diff
# apps/mobile/src/app/home.tsx (reescrito como StaffScreen)
export default function StaffScreen() {
  const { user, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const handleLogOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await signOut(); } finally { setLoggingOut(false); }
  };
  return (
    <EmptyState title={user?.name ?? "Welcome"} body="Photo upload is coming soon.">
      <Button variant="outline" disabled={loggingOut} onPress={handleLogOut}><Text>Log out</Text></Button>
    </EmptyState>
  );
}
```

```diff
# apps/admin/src/components/layout/sidebar-nav.tsx
const NAV_SECTIONS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "super_admin", "staff"] },
  { label: "Care homes", icon: Building2, roles: ["super_admin"] },
  { label: "Users", icon: Users, roles: ["super_admin", "admin"] },
  { label: "Residents", icon: Image, roles: ["admin", "staff"] },
  { label: "Content", icon: Newspaper, roles: ["admin", "staff"] },
  { label: "Events", icon: CalendarDays, roles: ["admin", "staff"] },
  { label: "Menu", icon: UtensilsCrossed, roles: ["admin", "staff"] },
  { label: "Metrics", icon: BarChart3, roles: ["super_admin", "admin"] },
];
export function SidebarNav({ collapsed = false, className }: SidebarNavProps) {
  const { user } = useAuth();
  const items = user ? NAV_SECTIONS.filter((item) => item.roles.includes(user.role)) : [];
  return (
    <nav className={cn("flex h-full flex-col gap-1 border-border bg-card py-4", className)}>
      {items.length === 0 ? (
        <p className="px-4 text-sm text-muted-foreground">No sections available</p>
      ) : (
        items.map(({ label, icon: Icon, disabled }) => (
          <button key={label} type="button" disabled={disabled} title={label} className={cn("...", collapsed && "justify-center px-0")}>
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed && <span className="text-[15px]">{label}</span>}
          </button>
        ))
      )}
    </nav>
  );
}
```

```diff
# apps/admin/src/components/permission-denied.tsx (nuevo)
export function PermissionDenied() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-heading text-2xl font-bold text-foreground">You don't have access to this</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">This area is limited to users with the right permission. Contact a home admin or super admin if you believe this is a mistake.</p>
      <Button variant="outline" className="mt-6" asChild><Link to="/">Back to dashboard</Link></Button>
    </div>
  );
}
```

```diff
# apps/mobile/src/components/ui/empty-state.tsx (nuevo)
interface EmptyStateProps { title: string; body?: string; children?: React.ReactNode; }
export function EmptyState({ title, body, children }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-gutter">
      <Text className="text-center font-section-title text-xl text-foreground">{title}</Text>
      {body ? <Text className="mt-2 text-center text-muted-foreground">{body}</Text> : null}
      {children ? <View className="mt-6">{children}</View> : null}
    </View>
  );
}
```