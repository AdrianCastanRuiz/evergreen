import {
  Building2,
  CalendarDays,
  Image,
  LayoutDashboard,
  Newspaper,
  UtensilsCrossed,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

// Placeholder nav — items point at future portal sections (Epics 1-8).
// None are routed yet; the scaffold only ships the shell (issue #27).
const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Care homes", icon: Building2 },
  { label: "Users", icon: Users },
  { label: "Residents", icon: Image },
  { label: "Content", icon: Newspaper },
  { label: "Events", icon: CalendarDays },
  { label: "Menu", icon: UtensilsCrossed },
];

interface SidebarNavProps {
  collapsed?: boolean;
  className?: string;
}

export function SidebarNav({ collapsed = false, className }: SidebarNavProps) {
  return (
    <nav
      className={cn(
        "flex h-full flex-col gap-1 border-border bg-card py-4",
        className,
      )}
    >
      {navItems.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          disabled
          title={label}
          className={cn(
            "flex items-center gap-3 rounded-DEFAULT px-4 py-2 text-left text-foreground/80 transition-colors hover:bg-muted disabled:cursor-default",
            collapsed && "justify-center px-0",
          )}
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden />
          {!collapsed && <span className="text-[15px]">{label}</span>}
        </button>
      ))}
    </nav>
  );
}
