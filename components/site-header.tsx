import Link from "next/link";

import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  current?: "home" | "interview" | "results";
};

const LINKS = [
  { label: "Home", href: "/#home", key: "home" },
  { label: "About", href: "/#about", key: "about" },
  { label: "Contact", href: "/#contact", key: "contact" },
] as const;

export function SiteHeader({ current = "home" }: SiteHeaderProps) {
  return (
    <header className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/" className="font-display text-3xl font-semibold text-ink transition hover:text-pine">
        RoleReady
      </Link>
      <nav className="flex items-center justify-center gap-6 text-sm font-semibold sm:gap-10">
        {LINKS.map((link) => {
          const active = current === "home" && link.key === "home";

          return (
            <Link
              key={link.key}
              href={link.href}
              className={cn(
                "transition",
                active ? "text-ink" : "text-ink/75 hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
