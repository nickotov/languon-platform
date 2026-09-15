import { z } from 'zod';

import { AuthTimestampSchema } from './primitives';

export const AccountDeletionScheduleRequestSchema = z.object({}).strict();

export const AccountDeletionScheduleResponseSchema = z
    .object({
        purgeAt: AuthTimestampSchema,
        scheduledAt: AuthTimestampSchema,
        status: z.literal('deletion_scheduled'),
    })
    .strict();

export type AccountDeletionScheduleRequest = z.infer<typeof AccountDeletionScheduleRequestSchema>;
export type AccountDeletionScheduleResponse = z.infer<typeof AccountDeletionScheduleResponseSchema>;
