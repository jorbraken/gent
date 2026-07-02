export class EventEmitter<T = unknown> {
  private listeners: Array<(event: T) => void> = [];

  readonly event = (listener: (event: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => undefined };
  };

  fire(event: T): void {
    for (const listener of this.listeners) listener(event);
  }

  dispose(): void {
    this.listeners = [];
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  contextValue?: string;
  command?: unknown;
  resourceUri?: Uri;

  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
  ) {}
}

export class Uri {
  constructor(public readonly fsPath: string) {}

  static file(filePath: string): Uri {
    return new Uri(filePath);
  }
}

export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startCharacter: number,
    public readonly endLine: number,
    public readonly endCharacter: number,
  ) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: DiagnosticSeverity,
  ) {}
}

export enum ViewColumn {
  One = 1,
}

export const commands = {
  registerCommand: () => ({ dispose: () => undefined }),
};

export const window = {
  registerTreeDataProvider: () => ({ dispose: () => undefined }),
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showInputBox: async () => undefined,
  showQuickPick: async () => undefined,
  showTextDocument: async () => undefined,
  createWebviewPanel: () => ({
    webview: {
      html: "",
      onDidReceiveMessage: () => ({ dispose: () => undefined }),
    },
  }),
};

export const languages = {
  createDiagnosticCollection: () => ({
    clear: () => undefined,
    set: () => undefined,
    dispose: () => undefined,
  }),
};

export const workspace = {
  createFileSystemWatcher: () => ({
    onDidCreate: () => ({ dispose: () => undefined }),
    onDidChange: () => ({ dispose: () => undefined }),
    onDidDelete: () => ({ dispose: () => undefined }),
    dispose: () => undefined,
  }),
  openTextDocument: async () => ({}),
};
