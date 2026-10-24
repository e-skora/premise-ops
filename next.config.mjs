/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("node:sqlite", "bun:sqlite");
    }
    return config;
  },
};

export default nextConfig;
