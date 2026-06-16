/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
