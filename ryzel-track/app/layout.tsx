import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Track your shipment | Ryzel",
  description: "Real-time shipment tracking",
};

// Deliberately minimal — no header, nav, or footer linking anywhere else.
// This app has exactly one purpose: show tracking status for a code.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
