import { OpsysError } from '../errors.js';
import { assertCommentParentType, requireString } from '../validation.js';
import { CommentRepository, type CommentRecord } from '../../db/repositories/commentRepository.js';
import { WorkItemRepository, type WorkItemType } from '../../db/repositories/workItemRepository.js';

export class CommentService {
  constructor(private readonly commentRepository: CommentRepository, private readonly workItemRepository: WorkItemRepository) {}
  create(input: { parentType: unknown; parentId: number; body: unknown }): CommentRecord {
    const parentType = assertCommentParentType(input.parentType);
    if (!this.workItemRepository.get(parentType as WorkItemType, input.parentId)) throw new OpsysError(`${parentType} not found: ${input.parentId}`);
    return this.commentRepository.create({ parentType, parentId: input.parentId, body: requireString(input.body, 'body') });
  }
}
