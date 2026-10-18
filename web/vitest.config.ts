/// <reference types="vitest/config" />
/**
 * Testerna kör mot en fryst kopia av datasetet (src/test/fixtures/, exporten från oktober 2026),
 * inte mot src/generated/ som skrivs om varje månad. Annars skulle nästa månads siffror få
 * testerna att fallera och stoppa publiceringen.
 *
 * Pluginen nedan styr om alla importer av src/generated/areas.json och areas.geojson
 * (även med ?raw/?url) till fixturerna, men bara här i vitest. Bygget och dev-servern läser
 * de riktiga filerna. Kontraktstestet (src/lib/contract.test.ts) läser den riktiga exporten
 * med node:fs och påverkas inte.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getViteConfig } from "astro/config";
import type { Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const GENERATED = path.join(here, "src/generated");
const FIXTURES = path.join(here, "src/test/fixtures");
const FROZEN = new Set(["areas.json", "areas.geojson"]);

function frozenDataset(): Plugin {
  return {
    name: "prislandskap:frozen-dataset",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.includes("generated/")) return null;
      const [file, query] = source.split("?");
      const base = importer.startsWith("/") ? path.dirname(importer.split("?")[0]) : here;
      const resolved = path.resolve(base, file);
      if (path.dirname(resolved) !== GENERATED || !FROZEN.has(path.basename(resolved))) return null;
      const fixture = path.join(FIXTURES, path.basename(resolved));
      return query ? `${fixture}?${query}` : fixture;
    },
  };
}

export default getViteConfig({
  plugins: [frozenDataset()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
