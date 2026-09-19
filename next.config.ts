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
        // Baseline hardening for every page. frame-ancestors / X-Frame-Options
        // stop other sites from framing the app (clickjacking the admin UI or
        // the candidate's interview); the referrer policy keeps secrets in
        // URLs (?invite=, /observe/<token>, reset links) from being sent to
        // other origins; the permissions policy limits camera, microphone and
        // screen capture to this origin.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()",
          },
        ],
      },
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
    // Next ships its own rule for .svg (next-image-loader). Simply pushing a
    // second @svgr/webpack rule left BOTH rules claiming every .svg, so a given
    // icon could be emitted as two different modules. Whichever chunk lost the
    // race got a module id with no factory behind it, and the webpack runtime
    // then threw "Cannot read properties of undefined (reading 'call')" —
    // intermittently, and blaming whichever component happened to load first.
    //
    // The fix is Next's documented recipe: take .svg away from the built-in
    // rule and hand it to svgr, keeping `?url` as an escape hatch for anyone
    // who wants the asset URL instead of a component.
    const fileLoaderRule = config.module.rules.find(
      (rule: { test?: { test?: (s: string) => boolean } }) =>
        rule?.test?.test?.(".svg")
    );

    if (fileLoaderRule) {
      config.module.rules.push(
        // import icon from "./icon.svg?url"  ->  URL, as before
        { ...fileLoaderRule, test: /\.svg$/i, resourceQuery: /url/ },
        // import Icon from "./icon.svg"      ->  React component
        {
          test: /\.svg$/i,
          issuer: fileLoaderRule.issuer,
          resourceQuery: { not: [/url/] },
          use: ["@svgr/webpack"],
        }
      );
      fileLoaderRule.exclude = /\.svg$/i;
    } else {
      config.module.rules.push({ test: /\.svg$/i, use: ["@svgr/webpack"] });
    }

    return config;
  },
};

export default nextConfig;
