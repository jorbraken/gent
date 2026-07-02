import { type Sandbox } from "./sandboxes.js";

// Built-in starting points for `gent create sandbox <template>`. Podman/Docker
// templates arrive alongside those drivers in a future slice.
const TEMPLATES: Record<string, () => Sandbox> = {
  local: () => ({
    id: "local",
    name: "Local (no isolation)",
    driver: "local",
    lifecycle: "ephemeral",
    network: "full",
  }),
  "apple-container": () => ({
    id: "apple-container",
    name: "Secure Agent (Apple Container)",
    driver: "apple-container",
    image: "gent-claude",
    workdir: "/workspace",
    lifecycle: "ephemeral",
    network: "none",
    mounts: [],
  }),
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

export function isTemplateName(value: string): boolean {
  return value in TEMPLATES;
}

export function getTemplate(name: string): Sandbox {
  const factory = TEMPLATES[name];
  if (!factory) {
    throw new Error(`Unknown sandbox template "${name}". Available templates: ${TEMPLATE_NAMES.join(", ")}.`);
  }
  return factory();
}
