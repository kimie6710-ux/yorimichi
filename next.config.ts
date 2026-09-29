import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let a phone on the same Wi-Fi open the dev server (npm run dev:phone).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
