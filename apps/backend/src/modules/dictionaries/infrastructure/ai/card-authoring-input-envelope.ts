import { Buffer } from 'node:buffer';
import { getLocalPrompt } from '@languon/prompts';
import { z } from 'zod';
import {
    DictionaryCardAuthoringProviderDeltaSchema,
    type DictionaryCardAuthoringProviderInput,
} from '../../domain/card-authoring';

export const dictionaryCardAuthoringProviderFramingTokenReserve = 16_384;
export const cardAuthoringInputOverhead =
    Buffer.byteLength(
        getLocalPrompt('dictionary-card-authoring-agent'),
        'utf8',
    ) +
    Buffer.byteLength(
        JSON.stringify(
            z.toJSONSchema(DictionaryCardAuthoringProviderDeltaSchema),
        ),
        'utf8',
    ) +
    dictionaryCardAuthoringProviderFramingTokenReserve;

/** Conservative byte ceiling shared by admission and the exact provider DTO. */
export function cardAuthoringProviderInputTokens(
    input: DictionaryCardAuthoringProviderInput,
): number {
    return (
        Buffer.byteLength(JSON.stringify(input), 'utf8') +
        cardAuthoringInputOverhead
    );
}
