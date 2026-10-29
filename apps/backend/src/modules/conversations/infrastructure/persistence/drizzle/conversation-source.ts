import { readSharedConversationNote } from './conversation-knowledge-share';
import { createHash } from 'node:crypto';
import { and, eq, or, ilike } from 'drizzle-orm';
import type { ConversationSource, KnowledgeBody } from '@languon/contracts';
import {
    noteSourceMaterial,
    textSourceMaterial,
} from './conversation-source-material';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    textsTable,
    textFoldersTable,
    textSharesTable,
} from '../../../../texts/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    ConversationError,
    conversationUnavailable,
    type ConversationSourceSnapshot,
    type SourceAuthority,
} from '../../../domain/conversation';

export type ConversationsDatabase = PostgresJsDatabase<typeof databaseSchema>;
export type ConversationsTransaction = Parameters<
    Parameters<ConversationsDatabase['transaction']>[0]
>[0];
export interface ConversationSourceDependencies {
    verifyDictionaryShare(
        key: string,
        digest: string,
    ): boolean | Promise<boolean>;
    verifyTextShare(key: string, digest: string): boolean | Promise<boolean>;
    verifyKnowledgeShare?(
        key: string,
        digest: string,
    ): boolean | Promise<boolean>;
    readNote(
        tx: ConversationsTransaction,
        ownerId: string,
        id: string,
    ): Promise<{
        title: string;
        summary: string;
        studiedLanguage: string | null;
        version: number;
        body: KnowledgeBody;
    }>;
}
export class ConversationSourceResolver {
    constructor(
        private readonly dependencies: ConversationSourceDependencies,
    ) {}

    async assertActiveActor(
        tx: ConversationsTransaction,
        ownerId: string,
        lock: 'share' | 'update' | 'none' = 'share',
    ) {
        const query = tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, ownerId));
        const [actor] = lock === 'none' ? await query : await query.for(lock);
        if (actor?.status !== 'active') throw conversationUnavailable();
    }

    async resolve(
        tx: ConversationsTransaction,
        ownerId: string,
        source: ConversationSource,
        access: { key?: string; authority?: SourceAuthority },
        includeMaterial = true,
        query = '',
        lockRows = true,
        actorVerified = false,
    ): Promise<{
        snapshot: ConversationSourceSnapshot;
        authority: SourceAuthority;
    }> {
        if (!actorVerified)
            await this.assertActiveActor(
                tx,
                ownerId,
                lockRows ? 'share' : 'none',
            );
        if (source.kind === 'knowledge') {
            const shared = source.shareLocator
                ? await readSharedConversationNote(
                      tx,
                      source,
                      access,
                      this.dependencies.verifyKnowledgeShare,
                  )
                : undefined;
            const note =
                shared?.note ??
                (await this.dependencies.readNote(tx, ownerId, source.id));

            if (source.view === 'saved' && note.version < 1)
                throw conversationUnavailable();

            return {
                authority: shared?.authority ?? { sourceOwnerId: ownerId },
                snapshot: {
                    title: note.title || 'Untitled',
                    description: note.summary,
                    studiedLanguage: note.studiedLanguage,
                    version: String(note.version),
                    provenance: 'saved',
                    material: includeMaterial
                        ? noteSourceMaterial({
                              id: source.id,
                              version: String(note.version),
                              title: note.title,
                              summary: note.summary,
                              body: note.body,
                          })
                        : [],
                    scope: 'complete',
                },
            };
        }

        if (source.kind === 'dictionary') {
            // Discover identity without a resource lock, then follow lifecycle
            // writers' owner-before-resource order. Only the locked re-read can
            // authorize access or supply content.
            const [candidate] = await tx
                .select({ ownerId: dictionariesTable.ownerId })
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, source.id));

            if (!candidate) throw conversationUnavailable();
            // resolve() verified this actor already; shared resources still need
            // their separate source owner's lifecycle check and lock.
            if (candidate.ownerId !== ownerId)
                await this.owner(tx, candidate.ownerId, lockRows);
            const dictionaryQuery = tx
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.id, source.id));
            const [dictionary] = lockRows
                ? await dictionaryQuery.for('share')
                : await dictionaryQuery;

            if (
                !dictionary ||
                dictionary.ownerId !== candidate.ownerId ||
                dictionary.lifecycle !== 'active'
            )
                throw conversationUnavailable();
            const authority: SourceAuthority = {
                sourceOwnerId: dictionary.ownerId,
            };

            if (dictionary.ownerId !== ownerId) {
                const known = access.authority?.share;
                if (
                    dictionary.visibility !== 'unlisted' ||
                    !dictionary.shareKeyDigest ||
                    source.shareLocator !== dictionary.shareLocator ||
                    !(known
                        ? known.digest === dictionary.shareKeyDigest &&
                          known.version === dictionary.shareKeyVersion
                        : access.key &&
                          (await this.dependencies.verifyDictionaryShare(
                              access.key,
                              dictionary.shareKeyDigest,
                          )))
                )
                    throw conversationUnavailable();
                authority.share = {
                    digest: dictionary.shareKeyDigest,
                    version: dictionary.shareKeyVersion!,
                };
            }

            const [settings] = includeMaterial
                ? await tx
                      .select()
                      .from(dictionarySettingsTable)
                      .where(
                          eq(
                              dictionarySettingsTable.dictionaryId,
                              dictionary.id,
                          ),
                      )
                : [];
            const [settingsRevision] = includeMaterial
                ? []
                : await tx
                      .select({ version: dictionarySettingsTable.version })
                      .from(dictionarySettingsTable)
                      .where(
                          eq(
                              dictionarySettingsTable.dictionaryId,
                              dictionary.id,
                          ),
                      );
            const terms = query
                .toLocaleLowerCase()
                .split(/[^\p{L}\p{N}]+/u)
                .filter((term) => term.length > 1)
                .slice(0, 12);
            const search = terms.length
                ? or(
                      ...terms.flatMap((term) => [
                          ilike(dictionaryCardsTable.source, `%${term}%`),
                          ilike(dictionaryCardsTable.translation, `%${term}%`),
                      ]),
                  )
                : undefined;
            const cards = includeMaterial
                ? await tx
                      .select()
                      .from(dictionaryCardsTable)
                      .where(
                          and(
                              eq(
                                  dictionaryCardsTable.dictionaryId,
                                  dictionary.id,
                              ),
                              eq(dictionaryCardsTable.lifecycle, 'active'),
                              search,
                          ),
                      )
                      .orderBy(dictionaryCardsTable.sortKey)
                      .limit(query ? 100 : 10001)
                : [];

            if (!query && cards.length > 10000)
                throw new ConversationError(
                    'source_too_large',
                    'This source has too many cards for a conversation. Use a smaller source.',
                );
            const visible = (override: string | null, defaultValue: boolean) =>
                override ? override === 'enabled' : defaultValue;
            const material = cards.map((card) => {
                const copiedCard = {
                    source: card.source,
                    translation: card.translation,
                    sourceLanguage: dictionary.sourceLanguageTag,
                    targetLanguage: dictionary.targetLanguageTag,
                    ...(visible(
                        card.definitionEnabledOverride,
                        settings?.definitionEnabled ?? false,
                    )
                        ? {
                              definition: card.definition,
                              definitionLanguage:
                                  (card.definitionLanguageRoleOverride ??
                                      settings?.definitionLanguageRole ??
                                      'source') === 'source'
                                      ? dictionary.sourceLanguageTag
                                      : dictionary.targetLanguageTag,
                          }
                        : {}),
                    ...(visible(
                        card.transcriptionEnabledOverride,
                        settings?.transcriptionEnabled ?? false,
                    )
                        ? {
                              transcription: card.transcription,
                              transcriptionNotation:
                                  card.transcriptionNotationOverride ??
                                  settings?.transcriptionNotation ??
                                  'ipa',
                              ...((card.transcriptionNotationOverride ??
                                  settings?.transcriptionNotation ??
                                  'ipa') === 'custom'
                                  ? {
                                        transcriptionCustomLabel:
                                            card.customNotationLabelOverride ??
                                            settings?.customNotationLabel ??
                                            null,
                                    }
                                  : {}),
                          }
                        : {}),
                    ...(visible(
                        card.exampleEnabledOverride,
                        settings?.exampleEnabled ?? true,
                    )
                        ? {
                              example: card.example,
                              exampleLanguage:
                                  (card.exampleLanguageRoleOverride ??
                                      settings?.exampleLanguageRole ??
                                      'source') === 'source'
                                      ? dictionary.sourceLanguageTag
                                      : dictionary.targetLanguageTag,
                          }
                        : {}),
                    ...(visible(
                        card.exampleEnabledOverride,
                        settings?.exampleEnabled ?? true,
                    ) &&
                    visible(
                        card.exampleTranslationEnabledOverride,
                        settings?.exampleTranslationEnabled ?? true,
                    )
                        ? {
                              exampleTranslation: card.exampleTranslation,
                              exampleTranslationLanguage:
                                  (card.exampleLanguageRoleOverride ??
                                      settings?.exampleLanguageRole ??
                                      'source') === 'source'
                                      ? dictionary.targetLanguageTag
                                      : dictionary.sourceLanguageTag,
                          }
                        : {}),
                };

                return {
                    id: card.id,
                    label: card.source,
                    kind: 'dictionary-card' as const,
                    card: copiedCard,
                    content: JSON.stringify(copiedCard),
                };
            });

            if (Buffer.byteLength(JSON.stringify(material), 'utf8') > 4_000_000)
                throw new ConversationError(
                    'source_too_large',
                    'This source is too large for a conversation. Use a smaller source.',
                );
            const revision = createHash('sha256')
                .update(JSON.stringify(material))
                .digest('hex')
                .slice(0, 16);

            return {
                authority,
                snapshot: {
                    title: dictionary.name,
                    description: dictionary.description,
                    studiedLanguage: dictionary.sourceLanguageTag,
                    version: `${dictionary.version}:${settings?.version ?? settingsRevision?.version ?? 0}:${revision}`,
                    provenance: 'saved',
                    material,
                    scope: query ? 'selected-material' : 'complete',
                },
            };
        }

        if (source.shareKind && !['text', 'folder'].includes(source.shareKind))
            throw conversationUnavailable();

        const [candidate] = await tx
            .select()
            .from(textsTable)
            .where(eq(textsTable.id, source.id));

        if (!candidate) throw conversationUnavailable();
        if (candidate.ownerId !== ownerId)
            await this.owner(tx, candidate.ownerId, lockRows);
        const folderQuery =
            candidate.folderId === null
                ? undefined
                : tx
                      .select()
                      .from(textFoldersTable)
                      .where(eq(textFoldersTable.id, candidate.folderId));
        const [folder] = folderQuery
            ? lockRows
                ? await folderQuery.for('share')
                : await folderQuery
            : [];
        const documentQuery = tx
            .select()
            .from(textsTable)
            .where(eq(textsTable.id, source.id));
        const [document] = lockRows
            ? await documentQuery.for('share')
            : await documentQuery;

        if (
            !document ||
            document.lifecycle !== 'active' ||
            document.folderId !== candidate.folderId ||
            document.ownerId !== candidate.ownerId ||
            (document.folderId !== null &&
                (folder?.lifecycle !== 'active' ||
                    folder.ownerId !== document.ownerId))
        )
            throw conversationUnavailable();
        const authority: SourceAuthority = { sourceOwnerId: document.ownerId };
        if (document.ownerId !== ownerId) {
            const shareQuery = tx
                .select()
                .from(textSharesTable)
                .where(
                    and(
                        eq(textSharesTable.locator, source.shareLocator ?? ''),
                        eq(
                            textSharesTable.kind,
                            source.shareKind === 'folder' ? 'folder' : 'text',
                        ),
                    ),
                );
            const [share] = lockRows
                ? await shareQuery.for('share')
                : await shareQuery;
            const known = access.authority?.share;
            if (
                !share ||
                document.status === 'draft' ||
                share.ownerId !== document.ownerId ||
                share.resourceId !==
                    (share.kind === 'text' ? document.id : document.folderId) ||
                !(known
                    ? known.id === share.id &&
                      known.digest === share.keyDigest &&
                      known.version === share.version
                    : access.key &&
                      (await this.dependencies.verifyTextShare(
                          access.key,
                          share.keyDigest,
                      )))
            )
                throw conversationUnavailable();
            authority.share = {
                id: share.id,
                digest: share.keyDigest,
                version: share.version,
            };
        }

        return {
            authority,
            snapshot: {
                title: document.title,
                description: null,
                studiedLanguage: document.sourceLanguage,
                version: String(document.version),
                provenance: 'saved',
                material: includeMaterial
                    ? textSourceMaterial({
                          id: document.id,
                          version: String(document.version),
                          title: document.title,
                          sourceText: document.sourceText,
                          sourceLanguage: document.sourceLanguage,
                          targetLanguage: document.targetLanguage,
                          alignment: document.alignment,
                      })
                    : [],
                scope: 'complete',
            },
        };
    }

    private async owner(
        tx: ConversationsTransaction,
        id: string,
        lockRows = true,
    ) {
        const query = tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, id));
        const [owner] = lockRows ? await query.for('share') : await query;
        if (owner?.status !== 'active') throw conversationUnavailable();
    }
}
