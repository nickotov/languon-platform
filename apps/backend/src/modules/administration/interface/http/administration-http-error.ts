import { randomUUID } from 'node:crypto';

import type { AdminErrorCode, AdminErrorResponse } from '@languon/contracts';

export type AdministrationHttpStatus =
    400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503;

export class AdministrationHttpError extends Error {
    public constructor(
        public readonly code: AdminErrorCode,
        message: string,
        public readonly status: AdministrationHttpStatus,
        public readonly retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = 'AdministrationHttpError';
    }

    public response(correlationId: string = randomUUID()): AdminErrorResponse {
        return {
            error: {
                code: this.code,
                correlationId,
                message: this.message,
            },
        };
    }
}
