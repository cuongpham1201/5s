/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `pg` is a native-ish server package — keep it external so Next doesn't bundle it
  // into route handlers (avoids build-trace issues). Server-only, never client.
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
  // PWA service worker + manifest are served from /public (manual SW, no extra deps).
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
