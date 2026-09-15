import { z } from 'zod';

import { parseJournalKey } from './account-deletion-journal-codec';

const Schema = z.object({
    ACCOUNT_DELETION_JOURNAL_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,62}$/),
    ACCOUNT_DELETION_JOURNAL_PREFIX: z.string().regex(/^[a-z0-9][a-z0-9/_-]{0,127}$/),
    ACCOUNT_DELETION_JOURNAL_NAMESPACE: z.string().regex(/^[a-z][a-z0-9-]{0,99}$/),
    ACCOUNT_DELETION_JOURNAL_ENCRYPTION_KEY_BASE64: z.string(),
    ACCOUNT_DELETION_JOURNAL_REGION: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
    ACCOUNT_DELETION_JOURNAL_ENDPOINT: z.preprocess((value) => value === '' ? undefined : value, z.url().optional()),
    ACCOUNT_DELETION_JOURNAL_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
    ACCOUNT_DELETION_JOURNAL_ACCESS_KEY_ID: z.string().min(1).max(128),
    ACCOUNT_DELETION_JOURNAL_SECRET_ACCESS_KEY: z.string().min(16).max(512),
});

export interface AccountDeletionJournalEnvironment {
    accessKeyId: string;
    bucket: string;
    encryptionKey: Buffer;
    endpoint: string | undefined;
    forcePathStyle: boolean;
    namespace: string;
    prefix: string;
    region: string;
    secretAccessKey: string;
}

export function loadAccountDeletionJournalEnvironment(values: NodeJS.ProcessEnv, deployed: boolean): AccountDeletionJournalEnvironment {
    const raw = Schema.parse(values);
    let endpoint: string | undefined;
    if (raw.ACCOUNT_DELETION_JOURNAL_ENDPOINT) {
        const parsed = new URL(raw.ACCOUNT_DELETION_JOURNAL_ENDPOINT);
        if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash ||
            (deployed && parsed.protocol !== 'https:') || !['https:', 'http:'].includes(parsed.protocol)) {
            throw new Error('Deletion journal endpoint must be a credential-free origin and use HTTPS when deployed.');
        }
        endpoint = parsed.origin;
    }
    return {
        accessKeyId: raw.ACCOUNT_DELETION_JOURNAL_ACCESS_KEY_ID,
        bucket: raw.ACCOUNT_DELETION_JOURNAL_BUCKET,
        encryptionKey: parseJournalKey(raw.ACCOUNT_DELETION_JOURNAL_ENCRYPTION_KEY_BASE64),
        endpoint,
        forcePathStyle: raw.ACCOUNT_DELETION_JOURNAL_FORCE_PATH_STYLE === 'true',
        namespace: raw.ACCOUNT_DELETION_JOURNAL_NAMESPACE,
        prefix: raw.ACCOUNT_DELETION_JOURNAL_PREFIX,
        region: raw.ACCOUNT_DELETION_JOURNAL_REGION,
        secretAccessKey: raw.ACCOUNT_DELETION_JOURNAL_SECRET_ACCESS_KEY,
    };
}
