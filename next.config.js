/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Add your production domain(s) here once you have one, e.g.
      // 'ryzel.example.com'. Requests from origins not in this list are
      // rejected by Next's CSRF protection for Server Actions.
      allowedOrigins: ['https://ryzel.online']
    }
  }
};
module.exports = nextConfig;