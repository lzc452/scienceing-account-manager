import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import { nowIso } from '../../db/config';
import {
  MANUAL_DEFAULT_CONTENT,
  MANUAL_DEFAULT_SLUG,
  MANUAL_DEFAULT_TITLE,
} from './manual-default';

/**
 * 手册正文上限：6M 字符。支持 data URL 内联插图（编辑器「上传图片」自动压缩后
 * 内联进 Markdown），约可容纳 4MB 压缩图；防误粘贴超大内容拖慢接口与页面。
 */
export const MANUAL_CONTENT_MAX_LENGTH = 6_000_000;
export const MANUAL_TITLE_MAX_LENGTH = 120;

export interface ManualPayload {
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
  updatedByDisplayName: string | null;
  /** true 表示库里还没有记录，当前返回的是内置默认内容（尚未落库） */
  isDefault: boolean;
}

export interface UpdateManualDto {
  title?: unknown;
  content?: unknown;
}

/**
 * 使用手册读写（t13）。
 *
 * 存储：manuals 表（迁移 v4），按 slug 单行存放 Markdown。
 * 读取没有任何记录时回退到内置默认内容（不自动落库，避免游客只读请求产生写操作）。
 */
@Injectable()
export class ManualService implements OnModuleInit {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * 首次启动（或升级到含手册的版本）把内置默认内容落库，之后以库内版本为准。
   * 用 INSERT OR IGNORE：管理员已改过的内容不会被覆盖。
   */
  onModuleInit(): void {
    this.ensureSeedRow();
  }

  private ensureSeedRow(): void {
    this.dbService.db
      .prepare(
        `INSERT OR IGNORE INTO manuals (slug, title, content, updated_by, updated_at)
         VALUES (?, ?, ?, NULL, ?)`,
      )
      .run(MANUAL_DEFAULT_SLUG, MANUAL_DEFAULT_TITLE, MANUAL_DEFAULT_CONTENT, nowIso());
  }

  read(slug: string = MANUAL_DEFAULT_SLUG): ManualPayload {
    const row = this.dbService.db
      .prepare(
        `SELECT m.slug, m.title, m.content, m.updated_at AS updatedAt, u.display_name AS updatedBy
         FROM manuals m LEFT JOIN users u ON u.id = m.updated_by
         WHERE m.slug = ?`,
      )
      .get(slug) as
      | { slug: string; title: string; content: string; updatedAt: string; updatedBy: string | null }
      | undefined;

    if (!row) {
      return {
        slug,
        title: MANUAL_DEFAULT_TITLE,
        content: MANUAL_DEFAULT_CONTENT,
        updatedAt: '',
        updatedByDisplayName: null,
        isDefault: true,
      };
    }

    return {
      slug: row.slug,
      title: row.title,
      content: row.content,
      updatedAt: row.updatedAt,
      updatedByDisplayName: row.updatedBy,
      isDefault: false,
    };
  }

  /** 管理员保存：slug 固定为内置默认 slug（当前只有一份手册）。 */
  update(dto: UpdateManualDto, adminId: number, slug: string = MANUAL_DEFAULT_SLUG): ManualPayload {
    const title = typeof dto?.title === 'string' ? dto.title.trim() : '';
    const content = typeof dto?.content === 'string' ? dto.content : '';

    if (!title) throw new Error('标题不能为空');
    if (title.length > MANUAL_TITLE_MAX_LENGTH) throw new Error(`标题不能超过 ${MANUAL_TITLE_MAX_LENGTH} 个字符`);
    if (!content.trim()) throw new Error('正文不能为空');
    if (content.length > MANUAL_CONTENT_MAX_LENGTH) {
      throw new Error(`正文不能超过 ${MANUAL_CONTENT_MAX_LENGTH} 个字符（当前 ${content.length}）`);
    }

    this.dbService.db
      .prepare(
        `INSERT INTO manuals (slug, title, content, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title = excluded.title,
           content = excluded.content,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .run(slug, title, content, adminId, nowIso());

    return this.read(slug);
  }
}
