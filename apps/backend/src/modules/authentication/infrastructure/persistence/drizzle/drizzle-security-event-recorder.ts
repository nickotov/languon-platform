import { randomUUID } from 'node:crypto';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type {
    SecurityEvent,
    SecurityEventRecorder,
} from '../../../application/ports/security-event';
import { authSecurityEventsTable } from './schema';

export class DrizzleSecurityEventRecorder implements SecurityEventRecorder {
    private failureCount = 0;
    private nextWarningAt = 0;

    public constructor(
        private readonly database: PostgresJsDatabase<typeof databaseSchema>,
    ) {}

    public async record(event: SecurityEvent): Promise<void> {
        try {
            await this.database.insert(authSecurityEventsTable).values({
                correlationId: event.correlationId,
                errorCategory: event.errorCategory ?? null,
                eventType: event.eventType,
                id: randomUUID(),
                metadata: event.metadata ?? {},
                occurredAt: event.occurredAt,
                outcome: event.outcome,
                sessionId: event.sessionId ?? null,
                userId: event.userId ?? null,
            });
        } catch (error) {
            this.failureCount++;
            const now = performance.now();
            if (now >= this.nextWarningAt) {
                // Driver errors can contain bound parameters. Emit only a process-local count.
                this.nextWarningAt = now + 60_000;
                console.warn('Authentication audit write failed.', {
                    failureCount: this.failureCount,
                });
            }

            throw error;
        }
    }
}
