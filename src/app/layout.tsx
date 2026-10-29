import type { Metadata, Viewport } from "next";
import { UniverseProvider } from "@/components/providers/universe-provider";
import { GuideProvider } from "@/components/guide/guide-provider";
import { GlobalGuide } from "@/components/guide/global-guide";
import "./globals.css";
import "./memory-palace.css";
import "./galaxy-guide.css";
import "./planet-journey.css";
import "./companion.css";

export const metadata: Metadata = {
  title: { default: "UNIVERSE OF ME · 我的人生宇宙", template: "%s · UNIVERSE OF ME" },
  description: "人生不是一条直线，而是一个不断扩张的宇宙。探索、记录、重访属于你的每一段人生。",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#05080d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><UniverseProvider><GuideProvider>{children}<GlobalGuide /></GuideProvider></UniverseProvider></body></html>;
}
