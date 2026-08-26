import { S3Client } from '@aws-sdk/client-s3';

import type { DictionaryDocumentS3Environment } from './dictionary-document-environment';

export function createDictionaryDocumentS3Client(
    environment: DictionaryDocumentS3Environment,
): S3Client {
    return new S3Client({
        credentials: {
            accessKeyId: environment.accessKeyId,
            secretAccessKey: environment.secretAccessKey,
        },
        endpoint: environment.endpoint,
        forcePathStyle: environment.forcePathStyle,
        maxAttempts: 2,
        region: environment.region,
    });
}
