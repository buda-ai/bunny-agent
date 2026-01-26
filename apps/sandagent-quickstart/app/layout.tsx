import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SandAgent Quickstart",
  description: "Quickstart example for building AI agents with SandAgent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
