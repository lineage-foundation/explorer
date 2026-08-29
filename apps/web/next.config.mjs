/** @type {import("next").NextConfig} */
export default {
  output: "standalone",
  transpilePackages: ["@explorer/config", "@explorer/db", "@explorer/ui"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
