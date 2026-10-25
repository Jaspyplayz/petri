import type { Metadata } from "next";
import localFont from "next/font/local";
import { NavBar } from "@/shared/ui/nav-bar";
import "./globals.css";

const fredoka = localFont({
  src: "./fonts/fredoka-latin.woff2",
  weight: "300 700",
  display: "swap",
  variable: "--font-fredoka",
});

export const metadata: Metadata = {
  title: { default: "Petri", template: "%s · Petri" },
  description: "Blobby, a pet that evolves from visitor ideas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fredoka.variable} h-full antialiased`}>
      <body className={`${fredoka.className} flex min-h-full flex-col`}>
        <NavBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
