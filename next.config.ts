import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "bcryptjs"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
  async headers() {
    const play = process.env.NEXT_PUBLIC_PLAY_ORIGIN || "http://localhost:3001";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Only the play origin may be framed; everything else is first-party.
          { key: "Content-Security-Policy", value: `frame-src ${play}; object-src 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com` },
        ],
      },
    ];
  },
};

export default nextConfig;
