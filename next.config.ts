import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.imgur.com" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  async redirects() {
    return [
      {
        // League Showdown server (Google Cloud VM behind Caddy/HTTPS).
        // Temporary redirect so browsers don't cache it.
        source: "/showdown",
        destination: "https://showdown.titan-pdl.com",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
