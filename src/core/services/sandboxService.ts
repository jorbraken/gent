import {
  listSandboxes,
  loadSandbox,
  saveSandbox,
  type Sandbox,
} from "../../sandboxes.js";
import { getDriver } from "../../sandboxDrivers.js";

export class SandboxService {
  load(id: string): Sandbox {
    return loadSandbox(id);
  }

  list(): Sandbox[] {
    return listSandboxes();
  }

  save(sandbox: Sandbox): void {
    saveSandbox(sandbox);
  }

  async validate(sandbox: Sandbox): Promise<string[]> {
    return getDriver(sandbox.driver).validate(sandbox);
  }
}
