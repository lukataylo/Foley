/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  webpack: (config) => {
    // Remotion ships its own asset pipeline; let it handle its files.
    config.module.rules.push({ test: /\.(mp4|mp3|webm)$/, type: "asset/resource" });
    return config;
  },
  async rewrites() {
    return [
      // Mintlify-style markdown export. /docs/<id>.md → /api/docs/<id>.
      // Pattern matches the same id shape isValidWalkthroughId allows.
      {
        source: "/docs/:id([a-z0-9_-]+).md",
        destination: "/api/docs/:id",
      },
    ];
  },
};
module.exports = nextConfig;
