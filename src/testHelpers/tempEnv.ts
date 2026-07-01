import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TempEnv {
  home: string;
  projectRoot: string;
  cleanup(): void;
}

export function createTempEnv(): TempEnv {
  const root = mkdtempSync(join(tmpdir(), 'gent-cli-'));
  return {
    home: join(root, 'home'),
    projectRoot: join(root, 'repo'),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
