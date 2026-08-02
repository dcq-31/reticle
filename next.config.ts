import type { NextConfig } from "next";

/**
 * Security headers applied to every response. Reticle is a fully client-side
 * app (no auth, no embeddable widgets), so we lock everything down by default
 * and only loosen what the runtime actually needs.
 *
 *  - `X-Frame-Options: DENY` — never embed in an iframe.
 *  - `Referrer-Policy: strict-origin-when-cross-origin` — minimal leakage.
 *  - `Permissions-Policy` — disable APIs we never use (camera, microphone, …).
 *  - `X-Content-Type-Options: nosniff` — trust declared content types.
 *  - `Cross-Origin-Opener-Policy: same-origin` — keep popup linkage scoped.
 *
 * CSP is intentionally left to Vercel/host defaults for now — Three.js +
 * Turbopack interact subtly with strict CSP and it deserves its own pass
 * once a deploy URL is in hand to validate against.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "interest-cohort=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
