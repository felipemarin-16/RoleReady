import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

type ShellProps = {
  badge: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  aside?: ReactNode;
  current?: "home" | "interview" | "results";
};

export function Shell({ badge, title, subtitle, children, aside, current = "home" }: ShellProps) {
  const hasAside = Boolean(aside);

  return (
    <main className="relative mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
      <SiteHeader current={current} />
      <section className={hasAside ? "grid gap-8 lg:grid-cols-[1.2fr_0.8fr]" : "grid gap-8"}>
        <div className="space-y-6">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
              {badge}
            </span>
            <div className="space-y-3">
              <h1 className="max-w-3xl font-display text-4xl leading-tight text-ink sm:text-5xl">
                {title}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate sm:text-lg">{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
        {hasAside ? <aside className="space-y-4">{aside}</aside> : null}
      </section>
    </main>
  );
}
