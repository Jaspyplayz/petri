"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Blob", testId: "nav-home" },
  { href: "/feedback", label: "Feedback", testId: "nav-feedback" },
  { href: "/timeline", label: "Timeline", testId: "nav-timeline" },
] as const;

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="border-b border-ink/10">
      <nav aria-label="Main" className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-culture-deep">
          Petri
        </Link>
        <ul className="flex gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  data-testid={link.testId}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-culture text-agar" : "text-ink-soft hover:bg-agar-deep"}`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
