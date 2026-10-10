/** @type {import("next").NextConfig} */
export default {
  output: "standalone",
  transpilePackages: ["@explorer/config", "@explorer/db", "@explorer/ui", "@explorer/api"],
  // Trades used to be called swaps, in page URLs and in the API.
  async redirects() {
    return [
      { source: "/swap/:druid", destination: "/trade/:druid", permanent: true },
      { source: "/api/v1/swaps", destination: "/api/v1/trades", permanent: true },
      { source: "/api/v1/swaps/:druid", destination: "/api/v1/trades/:druid", permanent: true },
    ];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
