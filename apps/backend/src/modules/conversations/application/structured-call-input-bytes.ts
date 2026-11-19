import { z } from 'zod';

/** Mirrors Mastra's inline structured-output prompt. The provider gate measures UTF-8 bytes of the native message array, including JSON escaping. */
export function structuredCallInputBytes(input: {
    schema: z.ZodType;
    instructions: string;
    prompt: string;
}): number {
    const schema = z.toJSONSchema(input.schema, {
        io: 'input',
        target: 'draft-7',
    });
    const jsonInstruction = `Return your response as JSON matching this schema:\n\n${JSON.stringify(schema)}\n\nReturn only valid JSON. Do not include markdown or explanatory text.`;

    return Buffer.byteLength(
        JSON.stringify({
            prompt: [
                {
                    role: 'system',
                    content: input.instructions,
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: input.prompt,
                            // The SDK stamps this metadata during message conversion.
                            // Maximum safe integer bounds every valid JS timestamp.
                            providerOptions: {
                                mastra: { createdAt: Number.MAX_SAFE_INTEGER },
                            },
                        },
                        { type: 'text', text: jsonInstruction },
                    ],
                },
            ],
        }),
        'utf8',
    );
}
