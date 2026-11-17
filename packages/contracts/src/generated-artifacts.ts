import { z } from 'zod';

/** Provenance identifies frozen evidence; it never grants access to private artifacts. */
export const GeneratedArtifactOriginSchema = z
    .object({
        kind: z.literal('generated-artifact'),
        runId: z.uuid(),
        revision: z.number().int().positive(),
        taskId: z
            .string()
            .min(1)
            .max(80)
            .regex(/^[A-Za-z0-9_-]+$/u),
        artifactId: z.uuid(),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict();

export type GeneratedArtifactOrigin = z.infer<
    typeof GeneratedArtifactOriginSchema
>;
