import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/**
 * In development, phones on your Wi-Fi open the app at this computer's network
 * address (e.g. http://192.168.1.23:3000). Next.js blocks unknown addresses by
 * default, so we allow this machine's own ones.
 */
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((info) => info !== undefined && info.family === "IPv4" && !info.internal)
  .map((info) => info!.address);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1", ...lanAddresses],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
