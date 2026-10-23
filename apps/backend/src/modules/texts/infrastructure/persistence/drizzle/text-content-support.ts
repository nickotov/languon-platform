import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    TextSchema,
    type TextDocument,
    type TextFolder,
} from '@languon/contracts';
import type { textsTable, textFoldersTable } from './schema';
export type TextsContentDatabase = PostgresJsDatabase<typeof databaseSchema>;
export type TextsContentTransaction = Parameters<
    Parameters<TextsContentDatabase['transaction']>[0]
>[0];
export type TextRow = typeof textsTable.$inferSelect;
export type FolderRow = typeof textFoldersTable.$inferSelect;
export function textDocument(row: TextRow): TextDocument {
    return TextSchema.parse({
        id: row.id,
        folderId: row.folderId,
        title: row.title,
        sourceLanguage: row.sourceLanguage,
        targetLanguage: row.targetLanguage,
        sourceText: row.sourceText,
        alignment: row.alignment,
        status: row.status,
        lifecycle: row.lifecycle,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    });
}

export function textFolder(row: FolderRow): TextFolder {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        lifecycle: row.lifecycle,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}
