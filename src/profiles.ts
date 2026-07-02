import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import {
  PROFILES_DIR,
  gentDirChain,
  resolveProfilePath,
  ensureGentDir,
} from "./config.js";
import { type AgentName } from "./agents.js";
import { profileSchema, formatZodError } from "./schemas.js";

export interface ProfileSettings {
  model?: string;
  permissionMode?: string;
  effortLevel?: string;
  [key: string]: unknown;
}

export interface Profile {
  name: string;
  agent?: AgentName;
  extends?: string | string[];
  description?: string;
  mcp?: string[];
  skills?: string[];
  strict_mcp?: boolean;
  settings?: ProfileSettings;
  system_prompt_append?: string;
  sandbox?: string;
}

const VALID_NAME = /^[a-zA-Z0-9_-]+$/;
const profileCache = new Map<string, Profile>();

export function validateProfileName(name: string): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `Invalid profile name "${name}". Only letters, numbers, hyphens, and underscores are allowed.`
    );
  }
}

// Write path for a profile — always the project-local profiles dir.
export function profilePath(name: string): string {
  validateProfileName(name);
  return path.join(PROFILES_DIR, `${name}.yaml`);
}

export function profileExists(name: string): boolean {
  validateProfileName(name);
  return resolveProfilePath(name) !== null;
}

export function mergeProfiles(profiles: Profile[]): Profile {
  if (profiles.length === 0) throw new Error("mergeProfiles requires at least one profile");
  if (profiles.length === 1) return profiles[0];

  return profiles.reduce((a, b) => {
    const mergedSettings = (a.settings || b.settings)
      ? { ...(a.settings ?? {}), ...(b.settings ?? {}) }
      : undefined;
    const mergedPrompt = [a.system_prompt_append, b.system_prompt_append]
      .filter(Boolean)
      .join("\n\n") || undefined;

    return {
      name: `${a.name}+${b.name}`,
      agent: b.agent ?? a.agent,
      sandbox: b.sandbox ?? a.sandbox,
      description: [a.description, b.description].filter(Boolean).join(" + ") || undefined,
      mcp: [...new Set([...(a.mcp ?? []), ...(b.mcp ?? [])])],
      skills: [...new Set([...(a.skills ?? []), ...(b.skills ?? [])])],
      strict_mcp: (a.strict_mcp ?? false) || (b.strict_mcp ?? false) || undefined,
      settings: mergedSettings,
      system_prompt_append: mergedPrompt,
    };
  });
}

export function loadProfile(name: string, seen = new Set<string>()): Profile {
  validateProfileName(name);
  const p = resolveProfilePath(name);
  if (!p) {
    throw new Error(
      `Profile "${name}" not found in ${gentDirChain().join(", ")}`
    );
  }
  const cached = profileCache.get(p);
  if (cached) return cached;
  const parsed = profileSchema.safeParse(yaml.load(fs.readFileSync(p, "utf8")) ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid profile at ${p}: ${formatZodError(parsed.error)}`);
  }
  const profile = parsed.data as Profile;
  profile.name = name; // filename is always authoritative

  if (profile.extends) {
    const parentNames = ([] as string[]).concat(profile.extends);
    const nextSeen = new Set([...seen, name]);
    for (const parentName of parentNames) {
      if (nextSeen.has(parentName)) {
        throw new Error(
          `Circular extends: "${parentName}" is already in the resolution chain`
        );
      }
    }
    const parents = parentNames.map((pName) => loadProfile(pName, nextSeen));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { extends: _ext, ...child } = profile;
    const merged = mergeProfiles([...parents, { ...child, name }]);
    profileCache.set(p, merged);
    return merged;
  }

  profileCache.set(p, profile);
  return profile;
}

export function saveProfile(profile: Profile): void {
  const parsed = profileSchema.safeParse(profile);
  if (!parsed.success) {
    throw new Error(`Invalid profile "${profile.name}": ${formatZodError(parsed.error)}`);
  }
  ensureGentDir();
  const p = profilePath(profile.name);
  fs.writeFileSync(p, yaml.dump(profile), "utf8");
  profileCache.delete(p);
}

export function listProfiles(): Profile[] {
  const seen = new Set<string>();
  const profiles: Profile[] = [];
  // Local first so a local profile shadows a global one of the same name.
  for (const dir of gentDirChain()) {
    const dirPath = path.join(dir, "profiles");
    if (!fs.existsSync(dirPath)) continue;
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith(".yaml")) continue;
      const name = f.replace(/\.yaml$/, "");
      if (seen.has(name)) continue;
      seen.add(name);
      profiles.push(loadProfile(name));
    }
  }
  return profiles;
}

export function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
