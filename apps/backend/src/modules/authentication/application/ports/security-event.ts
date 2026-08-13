export type SecurityEventOutcome = "failure" | "success";

export interface SecurityEvent {
  correlationId: string;
  errorCategory?: string;
  eventType: string;
  metadata?: Record<string, boolean | number | string | null>;
  occurredAt: Date;
  outcome: SecurityEventOutcome;
  sessionId?: string;
  userId?: string;
}

export interface SecurityEventRecorder {
  record(event: SecurityEvent): Promise<void>;
}
