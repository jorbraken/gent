import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { GLOBAL_GENT_DIR } from "./config.js";

// Registry of scaffolded .gent dirs, stored centrally in the global ~/.gent so
// `gent scaffold list` can show every project regardless of where it lives.
const SCAFFOLDS_PATH = path.join(GLOBAL_GENT_DIR, "scaffolds.yaml");

interface ScaffoldRegistry {
  scaffolds: string[];
}

// Absolute paths of every tracked .gent dir, in registration order.
export function listScaffolds(): string[] {
  if (!fs.existsSync(SCAFFOLDS_PATH)) return [];
  try {
    const raw = yaml.load(fs.readFileSync(SCAFFOLDS_PATH, "utf8")) as
      | ScaffoldRegistry
      | null;
    return raw?.scaffolds ?? [];
  } catch {
    return [];
  }
}

// Record a .gent dir in the registry (idempotent, dedup by absolute path).
export function registerScaffold(gentDir: string): void {
  const abs = path.resolve(gentDir);
  const current = listScaffolds();
  if (current.includes(abs)) return;
  fs.mkdirSync(GLOBAL_GENT_DIR, { recursive: true });
  fs.writeFileSync(
    SCAFFOLDS_PATH,
    yaml.dump({ scaffolds: [...current, abs] }, { lineWidth: -1 }),
    "utf8"
  );
}
