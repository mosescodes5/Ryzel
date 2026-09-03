/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Add your production domain(s) here once you have one, e.g.
      // 'ryzel.example.com'. Requests from origins not in this list are
      // rejected by Next's CSRF protection for Server Actions.
      allowedOrigins: ['localhost:3000']
    }
  }
};

module.exports = nextConfig;

// --- Cloudflare Pages local dev (`next dev`) support ---
// Lets `next dev` read bindings (KV/D1/R2/env vars) declared in wrangler.toml
// via `getRequestContext()`, matching what the app sees once deployed.
// Safe to keep even before you've added any bindings.
if (process.env.NODE_ENV === 'development') {
  const { setupDevPlatform } = require('@cloudflare/next-on-pages/next-dev');
  setupDevPlatform();
}
