import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SandAgent",
    template: "%s | SandAgent",
  },
  description:
    "Turn powerful Coding Agents into your product's superpower. AI SDK compatible.",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
      <GoogleAnalytics gaId="G-B1FLZ40NXT" />
    </html>
  );
}
