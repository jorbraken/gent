import { describe, expect, it } from 'vitest';
import { OpsysError } from '../errors.js';
import { assertCommentParentType, assertMemoryKind, assertWorkStatus, requireString } from '../validation.js';

describe('validation', () => {
  it('accepts allowed work statuses', () => {
    expect(assertWorkStatus('todo')).toBe('todo');
    expect(assertWorkStatus('in_progress')).toBe('in_progress');
    expect(assertWorkStatus('blocked')).toBe('blocked');
    expect(assertWorkStatus('done')).toBe('done');
  });

  it('rejects unknown work statuses with accepted values', () => {
    expect(() => assertWorkStatus('fixed')).toThrow('Invalid status "fixed". Accepted values: todo, in_progress, blocked, done');
  });

  it('validates memory kinds', () => {
    expect(assertMemoryKind('decision')).toBe('decision');
    expect(() => assertMemoryKind('random')).toThrow(OpsysError);
  });

  it('validates comment parent types', () => {
    expect(assertCommentParentType('task')).toBe('task');
    expect(assertCommentParentType('bug')).toBe('bug');
    expect(() => assertCommentParentType('memory')).toThrow('Invalid parent type "memory". Accepted values: task, bug');
  });

  it('requires non-empty strings', () => {
    expect(requireString(' Build ', 'title')).toBe('Build');
    expect(() => requireString('', 'title')).toThrow('title is required');
  });
});
