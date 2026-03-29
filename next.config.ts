import type { NextConfig } from "next";

const nextConfig: NextConfig = {

    // Enable static HTML export
  // output: "export",

    // Disable Next.js built-in Image Optimization (required for static export)
  images: {
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: "/models/:path*",
        headers: [
          { key: "Content-Type", value: "model/gltf-binary" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },

  /* config options here */
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
};

export default nextConfig;
