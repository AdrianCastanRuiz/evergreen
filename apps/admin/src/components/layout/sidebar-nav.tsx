import {
  BarChart3,
  Building2,
  CalendarDays,
  Heart,
  Image,
  LayoutDashboard,
  Newspaper,
  UserCog,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Role } from "@evergreen/shared-types";

interface NavItem {
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Portal section isn't routed yet (its epic isn't built) — the entry is
   * visible but disabled until the real screen ships. Once a section gets a
   * real route, set `to` instead and drop `disabled` (Story 2.1 is the
   * first to do this, for "Residents"). */
  disabled?: boolean;
  to?: string;
}

// Role → sections (Story 1.10 AC #3, UX-DR14). Grounded in the epic coverage:
// super_admin manages homes + platform users + metrics (FR47/48/49/54); home
// admin manages their own home's users/residents/content/events/menu + home
// metrics (FR12/50/51/22/34/53/55); staff uploads/manages content for their
// home but never user/role management (AD-12). Sections without a real
// screen yet stay disabled (no `to`) until their epic ships one — "Care
// homes"/"Residents"/"Users" are wired (Stories 1.2, 2.1, 1.15).
const NAV_SECTIONS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "super_admin", "staff"] },
  { label: "Care homes", icon: Building2, roles: ["super_admin"], to: "/care-homes" },
  // super_admin-only now — invite-home-admin/create-super-admin (Stories
  // 1.3/1.4). A home admin's own staff/family management moved to the
  // dedicated Staff/Family tabs below (both still GET /users under the
  // hood, filtered client-side per role).
  { label: "Users", icon: Users, roles: ["super_admin"], to: "/users" },
  { label: "Staff", icon: UserCog, roles: ["admin"], to: "/staff" },
  { label: "Family", icon: Heart, roles: ["admin"], to: "/family" },
  // admin-only (AC #5) — the backend's ResidentsController is @Roles('admin')
  // only; showing this to staff (Story 1.10's original list) sent them to a
  // screen that only ever 403s (Review Finding, patch).
  { label: "Residents", icon: Image, roles: ["admin"], to: "/residents" },
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
        items.map(({ label, icon: Icon, disabled, to }) => {
          const itemClassName = cn(
            "flex items-center gap-3 rounded-DEFAULT px-4 py-2 text-left text-foreground/80 transition-colors hover:bg-muted disabled:cursor-default",
            collapsed && "justify-center px-0",
          );

          if (to) {
            return (
              <Link
                key={label}
                to={to}
                title={label}
                className={itemClassName}
                // `!` forces this over the base className's hover:bg-muted —
                // without it, hovering the already-active tab would flip it
                // back to the lighter hover shade instead of staying on the
                // darker active one (both are plain background-color
                // utilities at the same CSS specificity, so source order
                // alone doesn't reliably decide the winner).
                activeProps={{ className: "!bg-foreground/10 !text-foreground" }}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {!collapsed && <span className="text-[15px]">{label}</span>}
              </Link>
            );
          }

          return (
            <button
              key={label}
              type="button"
              disabled={disabled}
              title={label}
              className={itemClassName}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {!collapsed && <span className="text-[15px]">{label}</span>}
            </button>
          );
        })
      )}
    </nav>
  );
}