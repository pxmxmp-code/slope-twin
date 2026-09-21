import type { Metadata } from "next";
import "./theme.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import "./shadcn-overrides.css";

export const metadata: Metadata = {
  title: "Slope Twin · 边坡实景",
  description: "二维正射影像与三维实景模型浏览",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="/cesium/Widgets/widgets.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
