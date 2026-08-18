/**
 * Report-Only so a wrong allowlist logs violations to the console instead of
 * breaking the site; flipping to the enforcing header is a follow-up. This
 * constrains where resources may load from — it is not an inline-XSS defence:
 * `script-src` keeps `'unsafe-inline'` because GTM injects inline scripts with
 * no nonce and the layout ships an inline JSON-LD script.
 */
const contentSecurityPolicy = [
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://api3.geo.admin.ch https://wmts.geo.admin.ch https://tiles.openfreemap.org",
  "img-src 'self' data: blob: https://*.google-analytics.com https://www.googletagmanager.com https://*.geo.admin.ch",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
