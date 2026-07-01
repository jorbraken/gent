import { OpsysError } from './errors.js';
import { COMMENT_PARENT_TYPES, MEMORY_KINDS, WORK_STATUSES, type CommentParentType, type MemoryKind, type WorkStatus } from './types.js';

function assertOneOf<const T extends readonly string[]>(value: unknown, label: string, accepted: T): T[number] {
  if (typeof value !== 'string' || !accepted.includes(value)) {
    throw new OpsysError(`Invalid ${label} "${String(value)}". Accepted values: ${accepted.join(', ')}`);
  }
  return value as T[number];
}

export function assertWorkStatus(value: unknown): WorkStatus {
  return assertOneOf(value, 'status', WORK_STATUSES);
}

export function assertMemoryKind(value: unknown): MemoryKind {
  return assertOneOf(value, 'memory kind', MEMORY_KINDS);
}

export function assertCommentParentType(value: unknown): CommentParentType {
  return assertOneOf(value, 'parent type', COMMENT_PARENT_TYPES);
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new OpsysError(`${fieldName} is required`);
  }
  return value.trim();
}
