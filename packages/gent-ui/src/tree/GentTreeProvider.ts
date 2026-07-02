import * as vscode from "vscode";
import { ENTITY_KINDS, ENTITY_REGISTRY, type GentEntityKind, type GentEntityRef } from "../../../../src/core/studio/index.js";
import { type GentCoreBridge } from "../coreBridge.js";

export class GentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly kind: GentEntityKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly entityId?: string,
    public readonly sourcePath?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = entityId ? `gent.entity.${kind}` : `gent.group.${kind}`;
    if (entityId) {
      this.command = { command: "gent.openEntity", title: "Open", arguments: [this] };
      this.resourceUri = sourcePath ? vscode.Uri.file(sourcePath) : undefined;
    }
  }
}

export class GentTreeProvider implements vscode.TreeDataProvider<GentTreeItem> {
  private readonly changed = new vscode.EventEmitter<GentTreeItem | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly bridge: Pick<GentCoreBridge, "snapshot">) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  getTreeItem(element: GentTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GentTreeItem): Promise<GentTreeItem[]> {
    const snapshot = this.bridge.snapshot();
    if (!element) {
      return ENTITY_KINDS.map((kind) => new GentTreeItem(kind, ENTITY_REGISTRY[kind].labelPlural, vscode.TreeItemCollapsibleState.Collapsed));
    }
    return snapshot.entities[element.kind].map((entity: GentEntityRef) =>
      new GentTreeItem(entity.kind, entity.label, vscode.TreeItemCollapsibleState.None, entity.id, entity.path)
    );
  }
}
