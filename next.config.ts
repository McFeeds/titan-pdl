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
        // League Showdown client (our own copy, Discord login). Temporary redirect so
        // browsers don't cache it.
        source: "/showdown",
        destination: "https://play.titan-pdl.com",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
