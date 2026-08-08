import type { NextConfig } from "next";

/**
 * Sandbox dev config.
 *
 * The loader below is what gives every JSX element a `data-vibe-loc` attribute,
 * which is how a clicked element in the preview maps back to a file and line.
 * It is opt-in via VIBE_INSPECTOR so that publish builds produce clean markup.
 *
 * Both a Turbopack rule and a webpack rule are declared. Turbopack implements
 * only a subset of the webpack loader API; if the rule misbehaves there,
 * dropping `--turbopack` from compile_page.sh switches to the webpack path with
 * no other change.
 */
const inspectorEnabled = process.env.VIBE_INSPECTOR === "1";
const LOADER = "/home/user/vibe/loc-loader.cjs";

const nextConfig: NextConfig = {
  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  ...(inspectorEnabled
    ? {
        turbopack: {
          rules: {
            "*.tsx": { loaders: [LOADER], as: "*.tsx" },
          },
        },
      }
    : {}),

  webpack(config) {
    if (inspectorEnabled) {
      config.module.rules.push({ test: /\.tsx$/, use: LOADER });
    }
    return config;
  },
};

export default nextConfig;
