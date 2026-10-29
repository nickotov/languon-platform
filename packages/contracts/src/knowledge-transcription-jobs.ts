import { z } from 'zod';
import { KnowledgeTranscriptionRequestSchema } from './knowledge-transcription';
import { parseCreditMilli } from './ai-credit-amount';
import { AssistantLanguageSchema } from './contextual-assistant';
const credits = z.string().refine((value) => {
    try {
        parseCreditMilli(value);
        return true;
    } catch {
        return false;
    }
}, 'Expected exact nonnegative credits.');
export const SubmitKnowledgeTranscriptionRequestSchema =
    KnowledgeTranscriptionRequestSchema.extend({
        confirmedMaximumCredits: credits.optional(),
    });
export const KnowledgeTranscriptionJobSchema = z
    .object({
        id: z.uuid(),
        noteId: z.uuid(),
        assetId: z.uuid(),
        state: z.enum([
            'confirmation-required',
            'queued',
            'running',
            'completed',
            'failed',
            'cancelled',
        ]),
        maximumCredits: credits,
        result: z
            .object({
                text: z.string().min(1).max(80_000),
                languages: z.array(AssistantLanguageSchema).max(16),
            })
            .strict()
            .nullable(),
        failureCode: z.string().max(100).nullable(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
    })
    .strict();
export const KnowledgeTranscriptionJobResponseSchema = z
    .object({ job: KnowledgeTranscriptionJobSchema })
    .strict();
export type SubmitKnowledgeTranscriptionRequest = z.infer<
    typeof SubmitKnowledgeTranscriptionRequestSchema
>;
export type KnowledgeTranscriptionJob = z.infer<
    typeof KnowledgeTranscriptionJobSchema
>;
