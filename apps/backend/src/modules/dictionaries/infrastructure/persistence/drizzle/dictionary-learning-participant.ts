import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { DictionaryNotFoundError } from '../../../application/dictionary-errors';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { resolveCardSettings } from '../../../domain/settings';
import {
    dictionariesTable,
    type dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

type Transaction = Parameters<
    Parameters<PostgresJsDatabase<typeof databaseSchema>['transaction']>[0]
>[0];
type DictionaryLearningAccess =
    | { kind: 'owner'; dictionaryId: string; learnerId: string }
    | {
          kind: 'shared';
          shareId: string;
          keyDigest: string;
          learnerId: string | null;
      };
export type LearningDictionary = {
    dictionary: typeof dictionariesTable.$inferSelect;
    settings: typeof dictionarySettingsTable.$inferSelect;
};

/** Infrastructure-only participant. All authority is checked under the same locks as learning writes. */
export async function authorizeLearningDictionary(
    tx: Transaction,
    access: DictionaryLearningAccess,
): Promise<LearningDictionary> {
    const condition =
        access.kind === 'owner'
            ? and(
                  eq(dictionariesTable.id, access.dictionaryId),
                  eq(dictionariesTable.ownerId, access.learnerId),
              )
            : eq(dictionariesTable.shareLocator, access.shareId);
    const [candidate] = await tx
        .select({
            id: dictionariesTable.id,
            ownerId: dictionariesTable.ownerId,
        })
        .from(dictionariesTable)
        .where(condition)
        .limit(1);
    if (!candidate) throw new DictionaryNotFoundError();
    // Users precede dictionaries, matching edit/account-purge order. Stable ordering handles shared learners.
    const ids = [
        ...new Set([
            candidate.ownerId,
            ...(access.learnerId ? [access.learnerId] : []),
        ]),
    ].sort();
    const users = await tx
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, ids))
        .orderBy(asc(usersTable.id))
        .for('share');
    if (
        users.length !== ids.length ||
        users.some((user) => user.status !== 'active')
    )
        throw new DictionaryNotFoundError();
    const [dictionary] = await tx
        .select()
        .from(dictionariesTable)
        .where(and(condition, eq(dictionariesTable.id, candidate.id)))
        .for('share');
    if (
        !dictionary ||
        dictionary.lifecycle !== 'active' ||
        (access.kind === 'shared' &&
            (dictionary.visibility !== 'unlisted' ||
                dictionary.shareKeyDigest !== access.keyDigest))
    )
        throw new DictionaryNotFoundError();
    const [settings] = await tx
        .select()
        .from(dictionarySettingsTable)
        .where(eq(dictionarySettingsTable.dictionaryId, dictionary.id));
    if (!settings) throw new DictionaryNotFoundError();
    return { dictionary, settings };
}

export function learningCardSettings(
    settings: LearningDictionary['settings'],
    card: typeof dictionaryCardsTable.$inferSelect,
) {
    return resolveCardSettings({
        dictionary: settings,
        overrides: {
            customNotationLabel: card.customNotationLabelOverride,
            definitionEnabled: card.definitionEnabledOverride,
            definitionLanguageRole: card.definitionLanguageRoleOverride,
            exampleEnabled: card.exampleEnabledOverride,
            exampleLanguageRole: card.exampleLanguageRoleOverride,
            exampleTranslationEnabled: card.exampleTranslationEnabledOverride,
            transcriptionEnabled: card.transcriptionEnabledOverride,
            transcriptionNotation: card.transcriptionNotationOverride,
        },
    });
}
