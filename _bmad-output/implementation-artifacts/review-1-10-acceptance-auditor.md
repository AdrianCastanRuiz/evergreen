# Code Review — Acceptance Auditor — Story 1.10 (issue #25)

**Instrucciones:** Revisa este diff contra el spec (story file) y los docs de contexto. Verifica: violaciones de criterios de aceptación, desviaciones de la intención del spec, implementación faltante de comportamiento especificado, contradicciones entre restricciones del spec y el código real. Reporta hallazgos como lista Markdown. Cada hallazgo: título de una línea, qué AC/restricción viola, y evidencia del diff.

## Spec — Story 1.10 (baseline_commit c3c8e28)

**Acceptance Criteria (del story file):**
1. Given log in as `family` on mobile → mobile `bottom-tab-bar` con Home, Photos, Events, Menu, News en ese orden (FR10, UX-DR13).
2. Given log in as `staff` on mobile → solo single-screen photo-upload flow, NO tab bar (FR10).
3. Given log in as `staff`/`admin`/`super_admin` on web portal → `sidebar-nav` scoped a las secciones permitidas por su rol (UX-DR14).
4. Given authenticated pero intenta ruta que su rol no permite → permission-denied treatment (UX-DR25) — nunca fallo silencioso ni pantalla en blanco (AD-12).
5. Given web portal <md width, staff desde navegador móvil → sidebar se vuelve sheet desde top bar, toda superficie accesible sigue usable (UX-DR39).
6. (Scope) Portal screens son scaffolding de navegación; los screens de negocio llegan en sus propios epics. Donde un rol no tiene screen real, placeholder/empty-state, no pantalla en blanco.

**Decisiones documentadas (dev notes / completion notes):**
- Family "has residents?" gate sin dato (Epic 2 backlog) → decisión ask-first: family → `(tabs)` directo (AC literal). No fabricar data, no renderizar resident-switcher (UX-DR9).
- Bottom-tab-bar implementado con `Tabs` nativo de expo-router en `(tabs)/_layout.tsx` (DESVIACIÓN intencional del plan que pedía `tab-bar.tsx` custom).
- Staff single-screen reutiliza `home.tsx` (desviación del plan que pedía `upload.tsx`).
- Todas las secciones del sidebar quedan `disabled` (placeholder) — screens reales llegan en sus epics.
- `PermissionDenied` como componente reutilizable; no hay todavía rutas internas role-gateadas.

**Restricciones relevantes:**
- A11y floor (UX-DR36/37/38): no locked text sizes/truncated controls; portal keyboard nav/focus; color siempre pareado con texto.
- UX-DR30 cold-load skeleton states.
- `Role = "family" | "staff" | "admin" | "super_admin"`.
- Portal: staff/admin/super_admin → sidebar role-scoped; family NO tiene superficie portal.
- Mobile: family → tab bar; staff → single-screen sin tab bar; admin/super_admin no tienen superficie mobile dedicada (home los mantiene seguros).

## Diff (Story 1.10, baseline c3c8e28 → HEAD)

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
    <Tabs screenOptions={{ headerShown: false,
        tabBarStyle: { backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#8C8C8C", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4 },
        tabBarActiveTintColor: "#1B853F", tabBarInactiveTintColor: "#5C5C5C", tabBarLabelStyle: { fontSize: 11 } }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ...Ionicons home-outline }} />
      <Tabs.Screen name="photos" options={{ title: "Photos", tabBarIcon: ...images-outline }} />
      <Tabs.Screen name="events" options={{ title: "Events", tabBarIcon: ...calendar-outline }} />
      <Tabs.Screen name="menu" options={{ title: "Menu", tabBarIcon: ...restaurant-outline }} />
      <Tabs.Screen name="news" options={{ title: "News", tabBarIcon: ...newspaper-outline }} />
    </Tabs>
  );
}
# (tabs)/index.tsx → HomeTabScreen → <EmptyState title="Home" body="Your home content will appear here soon." />
# (tabs)/photos.tsx → <EmptyState title="Photos" body="No photos yet — check back soon." />
# (tabs)/events.tsx → <EmptyState title="Events" body="No events scheduled right now." />
# (tabs)/menu.tsx → <EmptyState title="Menu" body="This week's menu will appear here soon." />
# (tabs)/news.tsx → <EmptyState title="News" body="Nothing posted yet." />
```

```diff
# apps/mobile/src/app/home.tsx (reescrito como StaffScreen)
export default function StaffScreen() {
  const { user, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const handleLogOut = async () => { if (loggingOut) return; setLoggingOut(true); try { await signOut(); } finally { setLoggingOut(false); } };
  return (
    <EmptyState title={user?.name ?? "Welcome"} body="Photo upload is coming soon.">
      <Button variant="outline" disabled={loggingOut} onPress={handleLogOut}><Text>Log out</Text></Button>
    </EmptyState>
  );
}
```

```diff
# apps/mobile/src/components/ui/empty-state.tsx (nuevo)
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
      {items.length === 0 ? <p className="px-4 text-sm text-muted-foreground">No sections available</p> : (
        items.map(({ label, icon: Icon, disabled }) => (
          <button key={label} type="button" disabled={disabled} title={label} className={cn("flex items-center gap-3 rounded-DEFAULT px-4 py-2 text-left text-foreground/80 transition-colors hover:bg-muted disabled:cursor-default", collapsed && "justify-center px-0")}>
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