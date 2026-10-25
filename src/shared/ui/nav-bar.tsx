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
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-culture-deep">
          Petri
        </Link>
        <ul className="flex gap-5">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  data-testid={link.testId}
                  aria-current={active ? "page" : undefined}
                  className={`text-sm font-semibold text-nav ${active ? "underline decoration-2 underline-offset-8" : "hover:underline"}`}
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
