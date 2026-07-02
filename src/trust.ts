import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { confirm } from "@inquirer/prompts";
import { GLOBAL_GENT_DIR, GENT_DIR, displayGentDir } from "./config.js";

interface TrustFile {
  trusted: string[];
}

export const TRUST_PATH = path.join(GLOBAL_GENT_DIR, "trust.yaml");

function canonicalExistingOrResolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export function canonicalGentDir(p = GENT_DIR): string {
  return canonicalExistingOrResolved(p);
}

export function isGlobalGentDir(p = GENT_DIR): boolean {
  return canonicalGentDir(p) === canonicalGentDir(GLOBAL_GENT_DIR);
}

function readTrustFile(): TrustFile {
  if (!fs.existsSync(TRUST_PATH)) return { trusted: [] };
  const raw = yaml.load(fs.readFileSync(TRUST_PATH, "utf8")) as Partial<TrustFile> | null;
  return { trusted: Array.isArray(raw?.trusted) ? raw.trusted.filter((v): v is string => typeof v === "string") : [] };
}

function writeTrustFile(file: TrustFile): void {
  fs.mkdirSync(GLOBAL_GENT_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TRUST_PATH, yaml.dump({ trusted: [...new Set(file.trusted)].sort() }), { mode: 0o600 });
}

export function listTrustedGentDirs(): string[] {
  return readTrustFile().trusted;
}

export function isGentDirTrusted(gentDir = GENT_DIR): boolean {
  if (isGlobalGentDir(gentDir)) return true;
  const key = canonicalGentDir(gentDir);
  return readTrustFile().trusted.includes(key);
}

export function trustGentDir(gentDir = GENT_DIR): string {
  const key = canonicalGentDir(gentDir);
  const file = readTrustFile();
  if (!file.trusted.includes(key)) {
    file.trusted.push(key);
    writeTrustFile(file);
  }
  return key;
}

export function untrustGentDir(gentDir = GENT_DIR): string {
  const key = canonicalGentDir(gentDir);
  const file = readTrustFile();
  writeTrustFile({ trusted: file.trusted.filter((entry) => entry !== key) });
  return key;
}

export async function ensureActiveGentDirTrusted(): Promise<void> {
  if (isGentDirTrusted(GENT_DIR)) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Project-local .gent is not trusted: ${displayGentDir(GENT_DIR)}. Run \`gent trust\` from this project to trust it.`
    );
  }
  const ok = await confirm({
    message: `Trust project-local .gent at ${displayGentDir(GENT_DIR)}?`,
    default: false,
  });
  if (!ok) {
    throw new Error(`Project-local .gent is not trusted: ${displayGentDir(GENT_DIR)}`);
  }
  trustGentDir(GENT_DIR);
}
