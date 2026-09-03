import type { Metadata } from 'next';
import './globals.css';

// Runs the whole app on Cloudflare's Workers runtime (via @cloudflare/next-on-pages) instead
// of Node.js — required for Cloudflare Pages Functions, and every child route/layout inherits
// this unless it sets its own. Route Handlers (app/**/route.ts) don't inherit from layouts, so
// each one declares `export const runtime = 'edge'` individually.
export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'RYZEL — One platform. Multiple digital tools.',
  description: 'Virtual phone numbers today, a growing suite of digital tools tomorrow.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
