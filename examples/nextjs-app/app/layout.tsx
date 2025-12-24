import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SandAgent Example",
  description: "Example Next.js app using SandAgent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
