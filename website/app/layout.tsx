import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "自习之间 · 校园自习区",
  description: "议事委员会校园自习区：选座预约、时长管理与秩序维护。使用学校原账号登录。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
