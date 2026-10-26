import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';

const witnessSchema = z
    .object({
        attemptId: z.uuid(),
        jobId: z.uuid(),
        leaseToken: z.string().min(1).max(200).optional(),
        workerId: z.string().min(1).max(200).optional(),
        fencingToken: z
            .string()
            .regex(/^[0-9]{1,19}$/)
            .optional(),
    })
    .strict();
export type TextAiProviderAttemptWitness = z.infer<typeof witnessSchema>;
const context = new AsyncLocalStorage<Readonly<TextAiProviderAttemptWitness>>();

/** The admitted operation, not model output or a transport caller, supplies this witness. */
export function withTextAiProviderAttemptWitness<T>(
    witness: TextAiProviderAttemptWitness,
    operation: () => T,
): T {
    return context.run(Object.freeze(witnessSchema.parse(witness)), operation);
}
export function currentTextAiProviderAttemptWitness():
    Readonly<TextAiProviderAttemptWitness> | undefined {
    return context.getStore();
}
