import type { Metadata } from "next";
import { NavBar } from "@/shared/ui/nav-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Petri", template: "%s · Petri" },
  description: "A small web app that evolves itself from visitor feedback.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NavBar />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
