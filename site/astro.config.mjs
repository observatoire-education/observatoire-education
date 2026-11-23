// Site statique : HTML pur, JavaScript seulement là où il sert.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const ici = dirname(fileURLToPath(import.meta.url));

/** Copie MapLibre (modules ES et CSS) dans dist/js/maplibre/ : chargé au clic sur « Afficher la carte ». */
const maplibre = {
  name: "obs-maplibre",
  hooks: {
    "astro:build:done": ({ dir }) => {
      const source = [join(ici, "node_modules/maplibre-gl/dist"), join(ici, "../node_modules/maplibre-gl/dist")].find(existsSync);
      if (!source) throw new Error("maplibre-gl introuvable");
      const cible = join(fileURLToPath(dir), "js", "maplibre");
      mkdirSync(cible, { recursive: true });
      for (const f of ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs", "maplibre-gl.css"]) {
        copyFileSync(join(source, f), join(cible, f));
      }
    },
  },
};

export default defineConfig({
  output: "static",
  outDir: process.env.OBS_DIST ?? "../dist",
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
  integrations: [maplibre],
});
