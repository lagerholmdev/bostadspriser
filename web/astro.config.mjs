// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Sajten publiceras på GitHub Pages under /bostadspriser/.
// Byt SITE och BASE om den flyttar till en egen domän.
const SITE = process.env.SITE_URL ?? "https://lagerholmdev.github.io";
const BASE = process.env.BASE_PATH ?? "/bostadspriser";

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap()],
});
