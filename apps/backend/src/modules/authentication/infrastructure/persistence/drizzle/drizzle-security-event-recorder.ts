import { randomUUID } from "node:crypto";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { databaseSchema } from "../../../../../infrastructure/database/schema";
import type {
  SecurityEvent,
  SecurityEventRecorder,
} from "../../../application/ports/security-event";
import { authSecurityEventsTable } from "./schema";

export class DrizzleSecurityEventRecorder implements SecurityEventRecorder {
  public constructor(
    private readonly database: PostgresJsDatabase<typeof databaseSchema>,
  ) {}

  public async record(event: SecurityEvent): Promise<void> {
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
  }
}
