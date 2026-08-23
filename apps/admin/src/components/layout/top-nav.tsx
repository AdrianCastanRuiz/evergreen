import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";

interface TopNavProps {
  onOpenMobileNav: () => void;
}

export function TopNav({ onOpenMobileNav }: TopNavProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <span className="font-heading text-lg font-bold tracking-wide text-primary">
        Evergreen
      </span>
      <span className="text-sm text-muted-foreground">Admin</span>
    </header>
  );
}
