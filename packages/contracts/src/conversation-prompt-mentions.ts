import { z } from 'zod';
import { ExerciseActivityIdSchema } from './exercise-activity';

const range = {
    start: z.number().int().min(0).max(20_000),
    end: z.number().int().positive().max(20_000),
};

/** Labels are slices of canonical text, never identities or source authority. */
export const ConversationPromptMentionSchema = z.discriminatedUnion('kind', [
    z
        .object({
            ...range,
            kind: z.literal('exercise'),
            activityId: ExerciseActivityIdSchema,
            catalogVersion: z.literal(1),
        })
        .strict(),
    z
        .object({ ...range, kind: z.literal('block'), blockId: z.uuid() })
        .strict(),
]);
export const ConversationPromptMentionsSchema = z
    .array(ConversationPromptMentionSchema)
    .max(64);
export type ConversationPromptMention = z.infer<
    typeof ConversationPromptMentionSchema
>;

export function validConversationPromptMentions(
    content: string,
    mentions: ConversationPromptMention[],
) {
    let previousEnd = 0;
    const blocks = new Set<string>();
    for (const mention of mentions) {
        const label = content.slice(mention.start, mention.end);
        if (
            mention.start < previousEnd ||
            mention.end <= mention.start ||
            mention.end > content.length ||
            !label.trim() ||
            /[\uD800-\uDFFF]/u.test(label)
        ) {
            return false;
        }

        previousEnd = mention.end;
        if (mention.kind === 'block') {
            blocks.add(mention.blockId);
        }
    }

    return blocks.size <= 8;
}
