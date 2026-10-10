/** @type {import("next").NextConfig} */
export default {
  output: "standalone",
  transpilePackages: ["@explorer/config", "@explorer/db", "@explorer/ui", "@explorer/api"],
  // Trade pages used to live under /swap.
  async redirects() {
    return [{ source: "/swap/:druid", destination: "/trade/:druid", permanent: true }];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
