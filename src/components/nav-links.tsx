"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Panel" },
  { href: "/programa", label: "Programa" },
  { href: "/liquidez", label: "Liquidez" },
  { href: "/bitacora", label: "Bitácora" },
  { href: "/auditoria", label: "Auditoría" },
  { href: "/identidad", label: "Identidad" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
