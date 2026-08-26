import type {
    DictionaryErrorCode,
    DictionaryErrorResponse,
} from '@languon/contracts';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class DictionaryHttpError extends Error {
    public constructor(
        public readonly code: DictionaryErrorCode,
        message: string,
        public readonly status: ContentfulStatusCode,
        public readonly retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = 'DictionaryHttpError';
    }

    public response(correlationId: string): DictionaryErrorResponse {
        return {
            error: {
                code: this.code,
                correlationId,
                message: this.message,
                ...(this.retryAfterSeconds === undefined
                    ? {}
                    : { retryAfterSeconds: this.retryAfterSeconds }),
            },
        };
    }
}
