import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StatPacks — MLB K Model",
  description: "Daily MLB strikeout picks powered by LightGBM + Beta-Binomial modeling.",
  openGraph: {
    title: "StatPacks — MLB K Model",
    description: "Daily MLB strikeout picks powered by LightGBM + Beta-Binomial modeling.",
    url: "https://statpacks.vercel.app",
    siteName: "StatPacks",
    images: [
      {
        url: "https://statpacks.vercel.app/og-image.png",
        width: 1200,
        height: 1200,
        alt: "StatPacks",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "StatPacks — MLB K Model",
    description: "Daily MLB strikeout picks powered by LightGBM + Beta-Binomial modeling.",
    images: ["https://statpacks.vercel.app/og-image.png"],
  },
  icons: {
    icon: "/og-image.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@700;900&family=Oswald:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
