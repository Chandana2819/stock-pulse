import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "./components/AuthGuard";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Replaces the previous geometric-sans display font. A serif headline face is
// the single biggest lever for not reading as "yet another dark-mode trading
// terminal" — that look (monospace everywhere, geometric sans headlines,
// pure-black background) is the default for nearly every crypto/trading
// dashboard. An editorial serif borrows from financial print (FT, The
// Economist) instead, while the brand green/mascot stay unchanged.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700", "900"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "BullHawk Stock Advisor",
  description: "Analyze stocks, manage portfolios, and record trade theses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-bg text-text-custom min-h-full flex flex-col">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
