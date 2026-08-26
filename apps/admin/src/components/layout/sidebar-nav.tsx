import {
  BarChart3,
  Building2,
  CalendarDays,
  Image,
  LayoutDashboard,
  Newspaper,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Role } from "@evergreen/shared-types";

interface NavItem {
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Portal section isn't routed yet (its epic isn't built) — the entry is
   * visible but disabled until the real screen ships. */
  disabled?: boolean;
}

// Role → sections (Story 1.10 AC #3, UX-DR14). Grounded in the epic coverage:
// super_admin manages homes + platform users + metrics (FR47/48/49/54); home
// admin manages their own home's users/residents/content/events/menu + home
// metrics (FR12/50/51/22/34/53/55); staff uploads/manages content for their
// home but never user/role management (AD-12). None of the target sections
// have real screens yet — the epics ship them — so every entry is currently
// disabled; this story only scopes the nav by role.
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

interface SidebarNavProps {
  collapsed?: boolean;
  className?: string;
}

export function SidebarNav({ collapsed = false, className }: SidebarNavProps) {
  const { user } = useAuth();

  const items = user
    ? NAV_SECTIONS.filter((item) => item.roles.includes(user.role))
    : [];

  return (
    <nav
      className={cn(
        "flex h-full flex-col gap-1 border-border bg-card py-4",
        className,
      )}
    >
      {items.length === 0 ? (
        <p className="px-4 text-sm text-muted-foreground">No sections available</p>
      ) : (
        items.map(({ label, icon: Icon, disabled }) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            title={label}
            className={cn(
              "flex items-center gap-3 rounded-DEFAULT px-4 py-2 text-left text-foreground/80 transition-colors hover:bg-muted disabled:cursor-default",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed && <span className="text-[15px]">{label}</span>}
          </button>
        ))
      )}
    </nav>
  );
}