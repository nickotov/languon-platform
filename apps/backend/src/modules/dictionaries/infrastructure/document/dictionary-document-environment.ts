import { z } from 'zod';

const OptionalValueSchema = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
);

const StorageEnvironmentSchema = z.object({
    DICTIONARY_DOCUMENT_STORAGE_API_ACCESS_KEY_ID: OptionalValueSchema,
    DICTIONARY_DOCUMENT_STORAGE_API_SECRET_ACCESS_KEY: OptionalValueSchema,
    DICTIONARY_DOCUMENT_STORAGE_BUCKET: OptionalValueSchema,
    DICTIONARY_DOCUMENT_STORAGE_ENDPOINT: OptionalValueSchema,
    DICTIONARY_DOCUMENT_STORAGE_FORCE_PATH_STYLE: z
        .enum(['true', 'false'])
        .default('false'),
    DICTIONARY_DOCUMENT_STORAGE_MODE: z
        .enum(['unavailable', 's3'])
        .default('unavailable'),
    DICTIONARY_DOCUMENT_STORAGE_REGION: OptionalValueSchema,
    DICTIONARY_DOCUMENT_STORAGE_WORKER_ACCESS_KEY_ID: OptionalValueSchema,
    DICTIONARY_DOCUMENT_STORAGE_WORKER_SECRET_ACCESS_KEY: OptionalValueSchema,
});

export interface DictionaryDocumentS3Environment {
    accessKeyId: string;
    bucket: string;
    endpoint: string;
    forcePathStyle: boolean;
    region: string;
    secretAccessKey: string;
}

export function loadDictionaryDocumentS3Environment(
    values: NodeJS.ProcessEnv,
    options: { deployed: boolean; required: boolean; role: 'api' | 'worker' },
): DictionaryDocumentS3Environment | undefined {
    const environment = StorageEnvironmentSchema.parse(values);
    if (environment.DICTIONARY_DOCUMENT_STORAGE_MODE === 'unavailable') {
        if (options.required)
            throw new Error(
                'Document storage is required when document-terms:v1 is enabled.',
            );
        return undefined;
    }
    const accessKeyId =
        options.role === 'api'
            ? environment.DICTIONARY_DOCUMENT_STORAGE_API_ACCESS_KEY_ID
            : environment.DICTIONARY_DOCUMENT_STORAGE_WORKER_ACCESS_KEY_ID;
    const bucket = environment.DICTIONARY_DOCUMENT_STORAGE_BUCKET;
    const endpointValue = environment.DICTIONARY_DOCUMENT_STORAGE_ENDPOINT;
    const region = environment.DICTIONARY_DOCUMENT_STORAGE_REGION;
    const secretAccessKey =
        options.role === 'api'
            ? environment.DICTIONARY_DOCUMENT_STORAGE_API_SECRET_ACCESS_KEY
            : environment.DICTIONARY_DOCUMENT_STORAGE_WORKER_SECRET_ACCESS_KEY;
    if (
        !accessKeyId ||
        !bucket ||
        !endpointValue ||
        !region ||
        !secretAccessKey
    )
        throw new Error('S3 document storage configuration is incomplete.');
    if (
        accessKeyId.length > 128 ||
        secretAccessKey.length < 16 ||
        secretAccessKey.length > 512 ||
        !/^[a-z0-9][a-z0-9.-]{2,62}$/u.test(bucket) ||
        !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(region)
    )
        throw new Error('S3 document storage configuration is invalid.');
    const endpoint = new URL(endpointValue);
    if (
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        endpoint.pathname !== '/' ||
        (options.deployed && endpoint.protocol !== 'https:') ||
        (!options.deployed && !['http:', 'https:'].includes(endpoint.protocol))
    )
        throw new Error(
            'Document storage endpoint must be a credential-free origin and use HTTPS when deployed.',
        );
    return {
        accessKeyId,
        bucket,
        endpoint: endpoint.origin,
        forcePathStyle:
            environment.DICTIONARY_DOCUMENT_STORAGE_FORCE_PATH_STYLE === 'true',
        region,
        secretAccessKey,
    };
}
