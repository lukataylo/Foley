/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  webpack: (config) => {
    // Remotion ships its own asset pipeline; let it handle its files.
    config.module.rules.push({ test: /\.(mp4|mp3|webm)$/, type: "asset/resource" });
    return config;
  },
};
module.exports = nextConfig;
