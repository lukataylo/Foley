/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Keep Remotion's renderer + bundler out of webpack's bundling for
    // server routes — they pull in platform-specific native binaries
    // (@remotion/compositor-*) that webpack can't resolve at build time.
    // Treating them as external means Node loads them at runtime instead.
    serverComponentsExternalPackages: [
      "@remotion/renderer",
      "@remotion/bundler",
      "@remotion/compositor-linux-x64-gnu",
      "@remotion/compositor-linux-x64-musl",
      "@remotion/compositor-linux-arm64-gnu",
      "@remotion/compositor-linux-arm64-musl",
      "@remotion/compositor-darwin-x64",
      "@remotion/compositor-darwin-arm64",
      "@remotion/compositor-win32-x64-msvc",
    ],
  },
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
