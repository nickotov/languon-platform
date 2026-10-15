import {
    TextAlignmentSchema,
    TextLanguageSchema,
    TextSelectionSchema,
    TextSourceSchema,
    TextTitleSchema,
    type TextAlignment,
    type TextErrorCode,
    type TextPairEdit,
    type TextSelection,
    type TextSourceSegment,
    type TextTranslationSegment,
} from '@languon/contracts';

export class TextDomainError extends Error {
    public constructor(
        public readonly code: TextErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'TextDomainError';
    }
}

export function assertTextVersion(actual: number, expected: number): void {
    if (actual !== expected)
        throw new TextDomainError(
            'version_conflict',
            'The text changed. Reload it before saving.',
        );
}

export function resolveTextTitle(
    title: string | undefined,
    sourceText: string,
): string {
    const value =
        title ??
        Array.from(
            sourceText
                .split(/\r?\n/u)
                .find((line) => line.trim())
                ?.trim() ?? '',
        )
            .slice(0, 200)
            .join('');
    const result = TextTitleSchema.safeParse(value);
    if (!result.success)
        throw new TextDomainError(
            'invalid_request',
            'A nonempty text title is required.',
        );
    return result.data;
}

/** Offsets are UTF-16 indices (DOM Range/string slicing), never Unicode code-point counts. */
export function segmentText(
    sourceText: string,
    sourceLanguage: string,
    createId: () => string,
): TextSourceSegment[] {
    if (
        !TextSourceSchema.safeParse(sourceText).success ||
        !TextLanguageSchema.safeParse(sourceLanguage).success
    )
        throw new TextDomainError(
            'invalid_request',
            'Text or source language is invalid.',
        );
    const segmenter = new Intl.Segmenter(sourceLanguage, {
        granularity: 'sentence',
    });
    const ranges: { start: number; end: number; paragraphIndex: number }[] = [];
    let offset = 0;
    let paragraphIndex = 0;
    // Split at paragraph boundaries before sentence segmentation, retaining delimiters verbatim.
    for (const paragraph of sourceText.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu) ??
        []) {
        if (!paragraph) continue;
        for (const sentence of segmenter.segment(paragraph)) {
            const start = offset + sentence.index;
            const end = start + sentence.segment.length;
            if (!sentence.segment.trim() && ranges.length)
                ranges[ranges.length - 1]!.end = end;
            else ranges.push({ start, end, paragraphIndex });
        }
        offset += paragraph.length;
        paragraphIndex += 1;
    }
    // Leading blank lines are layout of the first real sentence, not a model translation unit.
    while (
        ranges.length > 1 &&
        !sourceText.slice(ranges[0]!.start, ranges[0]!.end).trim()
    ) {
        ranges[1]!.start = ranges[0]!.start;
        ranges.shift();
    }
    const source = ranges.map((range) => ({
        pairId: createId(),
        text: sourceText.slice(range.start, range.end),
        startOffset: range.start,
        endOffset: range.end,
        paragraphIndex: range.paragraphIndex,
    }));
    if (
        !source.length ||
        source.map((s) => s.text).join('') !== sourceText ||
        new Set(source.map((s) => s.pairId)).size !== source.length
    )
        throw new TextDomainError(
            'invalid_alignment',
            'Source sentences could not be segmented.',
        );
    return source;
}

export function validateTranslation(
    source: TextSourceSegment[],
    translation: TextTranslationSegment[],
): TextAlignment {
    const result = TextAlignmentSchema.safeParse({
        source,
        translation,
        editedPairIds: [],
    });
    if (!result.success)
        throw new TextDomainError(
            'invalid_alignment',
            'Translation must contain every source sentence exactly once in order.',
        );
    return result.data;
}

export function applyTextEdits(
    alignment: TextAlignment,
    pairs: TextPairEdit[],
): TextAlignment {
    if (
        pairs.length !== alignment.source.length ||
        pairs.some((pair, i) => pair.pairId !== alignment.source[i]?.pairId)
    )
        throw new TextDomainError(
            'invalid_alignment',
            'Edits must preserve every sentence pair and its order.',
        );
    let offset = 0;
    const edited = new Set(alignment.editedPairIds);
    const source = pairs.map((pair, i) => {
        if (
            pair.source !== alignment.source[i]!.text ||
            pair.translation !== alignment.translation[i]!.text
        )
            edited.add(pair.pairId);
        const segment = {
            ...alignment.source[i]!,
            text: pair.source,
            startOffset: offset,
            endOffset: offset + pair.source.length,
        };
        offset = segment.endOffset;
        return segment;
    });
    const parsed = TextAlignmentSchema.safeParse({
        source,
        translation: pairs.map((p) => ({
            pairId: p.pairId,
            text: p.translation,
        })),
        editedPairIds: [...edited],
    });
    if (!parsed.success)
        throw new TextDomainError(
            'invalid_alignment',
            'Edited sentences are invalid or exceed the text limit.',
        );
    return parsed.data;
}

function splitsSurrogate(value: string, offset: number): boolean {
    if (offset <= 0 || offset >= value.length) return false;
    const previous = value.charCodeAt(offset - 1);
    const current = value.charCodeAt(offset);
    return (
        previous >= 0xd800 &&
        previous <= 0xdbff &&
        current >= 0xdc00 &&
        current <= 0xdfff
    );
}

export interface TextOccurrenceContext {
    phrase: string;
    startOffset: number;
    endOffset: number;
    sentence: string;
    previousSentence: string | null;
    nextSentence: string | null;
    sourceLanguage: string;
    targetLanguage: string;
}

export function resolveTextSelection(
    alignment: TextAlignment,
    selection: TextSelection,
    languages: { sourceLanguage: string; targetLanguage: string },
): TextOccurrenceContext {
    if (!TextSelectionSchema.safeParse(selection).success)
        throw new TextDomainError(
            'invalid_selection',
            'Select a word or phrase within one sentence.',
        );
    const segments = alignment[selection.side];
    const index = segments.findIndex(
        (segment) => segment.pairId === selection.pairId,
    );
    const segment = segments[index];
    if (
        !segment ||
        selection.endOffset > segment.text.length ||
        splitsSurrogate(segment.text, selection.startOffset) ||
        splitsSurrogate(segment.text, selection.endOffset)
    )
        throw new TextDomainError(
            'invalid_selection',
            'The selected occurrence is no longer available.',
        );
    const phrase = segment.text
        .slice(selection.startOffset, selection.endOffset)
        .trim();
    if (!phrase || Array.from(phrase).length > 200)
        throw new TextDomainError(
            'invalid_selection',
            'Select between 1 and 200 characters.',
        );
    const sourceLanguage =
        selection.side === 'source'
            ? languages.sourceLanguage
            : languages.targetLanguage;
    const targetLanguage =
        selection.side === 'source'
            ? languages.targetLanguage
            : languages.sourceLanguage;
    // A translated pair or manual edit may contain multiple sentences. Do not let a selection cross them.
    const sentences = [
        ...new Intl.Segmenter(sourceLanguage, {
            granularity: 'sentence',
        }).segment(segment.text),
    ].filter((sentence) => sentence.segment.trim().length > 0);
    const sentenceIndex = sentences.findIndex(
        (s) =>
            selection.startOffset >= s.index &&
            selection.endOffset <= s.index + s.segment.length,
    );
    if (sentenceIndex < 0)
        throw new TextDomainError(
            'invalid_selection',
            'Select a phrase within one sentence.',
        );
    const neighboringSentence = (
        text: string | undefined,
        last: boolean,
    ): string | null => {
        if (!text) return null;
        const values = [
            ...new Intl.Segmenter(sourceLanguage, {
                granularity: 'sentence',
            }).segment(text),
        ].filter((sentence) => sentence.segment.trim().length > 0);
        return (last ? values.at(-1) : values[0])?.segment ?? null;
    };
    const selectedText = segment.text.slice(
        selection.startOffset,
        selection.endOffset,
    );
    const startOffset =
        selection.startOffset -
        sentences[sentenceIndex]!.index +
        (selectedText.length - selectedText.trimStart().length);
    return {
        phrase,
        startOffset,
        endOffset: startOffset + phrase.length,
        sentence: sentences[sentenceIndex]!.segment,
        previousSentence:
            sentences[sentenceIndex - 1]?.segment ??
            neighboringSentence(segments[index - 1]?.text, true),
        nextSentence:
            sentences[sentenceIndex + 1]?.segment ??
            neighboringSentence(segments[index + 1]?.text, false),
        sourceLanguage,
        targetLanguage,
    };
}
