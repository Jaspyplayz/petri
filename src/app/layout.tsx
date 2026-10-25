import type { Metadata } from "next";
import { NavBar } from "@/shared/ui/nav-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Petri", template: "%s · Petri" },
  description: "Blobby, a pet that evolves from visitor ideas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NavBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
