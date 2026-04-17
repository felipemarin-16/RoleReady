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
    <header className="flex items-center justify-between gap-4 py-4">
      <Link href="/" className="shrink-0 font-display text-2xl font-semibold text-ink transition hover:text-pine sm:text-3xl">
        RoleReady
      </Link>
      <nav className="ml-auto flex items-center justify-end gap-5 text-sm font-semibold sm:gap-8">
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
