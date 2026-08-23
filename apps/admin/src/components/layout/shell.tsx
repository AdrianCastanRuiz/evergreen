import { useEffect, useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { TopNav } from "@/components/layout/top-nav";

// Portal shell: top-nav + sidebar-nav, responsive per UX-DR39 —
// lg: expanded sidebar, md: icon-only rail, <md: sidebar becomes a Sheet
// triggered from the top bar.
export function Shell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // The persistent sidebar takes over at `md` (Tailwind's default 768px) —
  // close the mobile Sheet if the viewport crosses that while it's open, so
  // it can't stay mounted on top of the now-visible sidebar.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileNavOpen(false);
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <TopNav onOpenMobileNav={() => setMobileNavOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden shrink-0 border-r border-border md:block md:w-16 lg:w-64">
          <div className="h-full lg:hidden">
            <SidebarNav collapsed />
          </div>
          <div className="hidden h-full lg:block">
            <SidebarNav />
          </div>
        </aside>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarNav />
          </SheetContent>
        </Sheet>

        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/40 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
