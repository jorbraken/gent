export const WORK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const MEMORY_KINDS = ['note', 'decision', 'lesson'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const COMMENT_PARENT_TYPES = ['task', 'bug'] as const;
export type CommentParentType = (typeof COMMENT_PARENT_TYPES)[number];

export interface RegistryProject {
  id: number;
  name: string;
  rootPath: string;
  dbPath: string;
  createdAt: string;
  updatedAt: string;
}
