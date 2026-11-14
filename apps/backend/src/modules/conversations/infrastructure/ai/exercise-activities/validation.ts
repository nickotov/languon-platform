import {
    NamedExerciseSemanticsSchema,
    type ExerciseLearningBlock,
    type LearningBlock,
    type NamedExerciseSemantics,
    type NamedExerciseSource,
} from '@languon/contracts';

type NamedExerciseBlock = ExerciseLearningBlock & {
    semantics: NamedExerciseSemantics;
};
type VocabularyBlock = Extract<LearningBlock, { type: 'vocabulary' }>;
type GrammarBlock = Extract<LearningBlock, { type: 'grammar' }>;

export class NamedExerciseActivityValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NamedExerciseActivityValidationError';
    }
}

const normalized = (value: string) =>
    value.normalize('NFC').trim().replace(/\s+/gu, ' ');

function requireCondition(
    condition: boolean,
    message: string,
): asserts condition {
    if (!condition) {
        throw new NamedExerciseActivityValidationError(message);
    }
}

export function vocabularyExerciseSourceSense(
    entry: VocabularyBlock['entries'][number],
): string {
    return entry.definition ?? entry.translation;
}

/** Examples alone do not identify which grammatical rule the learner selected. */
export function grammarExerciseSourceRule(block: GrammarBlock): string {
    const rule = block.rule ?? block.pattern;
    requireCondition(
        Boolean(rule),
        'Grammar exercises need an explicit rule or pattern.',
    );

    return rule!;
}

function sameAnswers(
    left: readonly string[],
    right: readonly string[],
): boolean {
    const expected = left.map(normalized).sort();
    const actual = right.map(normalized).sort();

    return (
        expected.length === actual.length &&
        expected.every((answer, index) => answer === actual[index])
    );
}

function validatePreparedKey(block: NamedExerciseBlock) {
    const checking = block.semantics.checking;
    if (!('key' in checking)) {
        return;
    }

    const key = checking.key;
    if (block.format === 'multiple-choice' && key.kind === 'choice') {
        requireCondition(
            key.correctChoiceId === block.correctChoiceId &&
                key.explanations.length === block.choices.length &&
                block.choices.every((choice) =>
                    key.explanations.some(
                        (item) => item.choiceId === choice.id,
                    ),
                ),
            'Prepared choice key must cover exactly the actual choices.',
        );

        const correct = block.choices.find(
            (choice) => choice.id === block.correctChoiceId,
        );

        requireCondition(
            Boolean(correct) &&
                normalized(correct!.text) === normalized(block.referenceAnswer),
            'Reference answer must name the correct choice.',
        );

        return;
    }

    if (block.format === 'fill-in-the-blank' && key.kind === 'gaps') {
        const gaps = block.parts.filter((part) => part.kind === 'gap');
        requireCondition(
            key.gaps.length === gaps.length &&
                gaps.every((gap) =>
                    key.gaps.some(
                        (item) =>
                            item.gapId === gap.id &&
                            sameAnswers(
                                item.acceptedAnswers,
                                gap.acceptedAnswers,
                            ),
                    ),
                ),
            'Prepared gap keys must cover the actual gaps and accepted variants exactly.',
        );

        return;
    }

    if (block.format === 'free-text' && key.kind === 'text') {
        requireCondition(
            sameAnswers(key.acceptedAnswers, block.acceptedAnswers ?? []) &&
                key.acceptedAnswers.some(
                    (answer) =>
                        normalized(answer) ===
                        normalized(block.referenceAnswer),
                ),
            'Prepared text variants must match the exercise and include its reference answer.',
        );

        return;
    }

    throw new NamedExerciseActivityValidationError(
        'Prepared key does not match the exercise interaction.',
    );
}

function validateChoiceInteraction(block: NamedExerciseBlock) {
    if (block.format !== 'multiple-choice') {
        return;
    }

    requireCondition(
        new Set(block.choices.map((choice) => normalized(choice.text))).size ===
            block.choices.length,
        'Choice answers must be distinct after NFC and whitespace normalization.',
    );

    if (block.semantics.activity.id === 'R03') {
        const checking = block.semantics.checking;
        const key = 'key' in checking ? checking.key : undefined;
        const classification =
            key?.kind === 'choice' ? key.classification : undefined;
        const labels = ['True', 'False', 'Not stated'];
        requireCondition(
            block.choices.length === 3 &&
                classification !== undefined &&
                block.choices.every(
                    (choice, index) =>
                        choice.text === labels[index] &&
                        classification.roles[index]?.choiceId === choice.id &&
                        classification.roles[index]?.role ===
                            ['true', 'false', 'not-stated'][index],
                ),
            'True, false or not stated requires exactly three canonical ordered choices and matching classification roles.',
        );

        const notStatedChoice = block.choices[2]!;
        if (notStatedChoice.id === block.correctChoiceId) {
            requireCondition(
                key?.kind === 'choice' &&
                    classification.absenceRationale !== undefined &&
                    key.explanations.some(
                        (item) =>
                            item.choiceId === notStatedChoice.id &&
                            normalized(item.explanation) ===
                                normalized(classification.absenceRationale!),
                    ),
                'A correct Not stated claim needs its specific absence rationale as the prepared explanation.',
            );
        }
    }
}

function preparedAnswers(block: NamedExerciseBlock): string[] {
    if (block.format === 'multiple-choice') {
        return block.choices
            .filter((choice) => choice.id === block.correctChoiceId)
            .map((choice) => normalized(choice.text));
    }

    if (block.format === 'fill-in-the-blank') {
        return block.parts.flatMap((part) =>
            part.kind === 'gap' ? part.acceptedAnswers.map(normalized) : [],
        );
    }

    return [block.referenceAnswer, ...(block.acceptedAnswers ?? [])].map(
        normalized,
    );
}

function explicitlyDisclosesAnswer(
    text: string,
    answers: readonly string[],
): boolean {
    const value = normalized(text);
    // Detect explicit key disclosure, rather than word presence: supplied lemmas,
    // grammar examples and partial first-letter cues remain legitimate material.
    const markers = value.matchAll(/\banswer\s*(?::|is\b)\s*/giu);
    for (const marker of markers) {
        const remainder = value
            .slice(marker.index! + marker[0].length)
            .replace(/^["'“«「]/u, '');

        if (
            answers.some(
                (answer) =>
                    remainder === answer ||
                    (remainder.startsWith(answer) &&
                        /^[\s.,;!?"'”»」]/u.test(
                            remainder.slice(answer.length),
                        )),
            )
        ) {
            return true;
        }
    }

    return false;
}

function validateAnswerDisclosure(block: NamedExerciseBlock) {
    const answers = preparedAnswers(block);
    requireCondition(
        !block.hint || !answers.includes(normalized(block.hint)),
        'A hint must not consist of a prepared correct answer.',
    );

    requireCondition(
        ![block.question, block.hint ?? ''].some((value) =>
            explicitlyDisclosesAnswer(value, answers),
        ),
        'Questions and hints must not explicitly disclose the prepared answer key.',
    );
}

function validateTargetAndContext(block: NamedExerciseBlock) {
    const id = block.semantics.activity.id;
    const entries = block.semantics.sources.flatMap((source) =>
        source.kind === 'vocabulary' ? source.entries : [],
    );

    if (id === 'V01' || id === 'V02' || id === 'V06') {
        requireCondition(
            entries.length === 1,
            'This activity needs exactly one selected vocabulary entry per exercise.',
        );
    }

    if (id === 'V01') {
        const term = entries[0]!.term;
        const checking = block.semantics.checking;
        requireCondition(
            'key' in checking &&
                checking.key.kind === 'text' &&
                checking.key.acceptedAnswers.some(
                    (answer) => normalized(answer) === normalized(term),
                ),
            'Word recall must accept the exact selected source term.',
        );

        const quoted = ['"', "'", '“', '«', '「'].map(
            (quote, index) =>
                `${quote}${term}${['"', "'", '”', '»', '」'][index]}`,
        );
        const visible = [block.question, block.hint ?? ''].map(normalized);
        requireCondition(
            !visible.some(
                (value) =>
                    value === normalized(term) ||
                    quoted.some((answer) => value.includes(normalized(answer))),
            ),
            'Word recall must not reveal the selected word in the cue or hint.',
        );
    }

    if (id === 'V06') {
        requireCondition(
            normalized(block.question).includes(normalized(entries[0]!.term)),
            'Word-form questions must show the selected base word.',
        );
    }

    if (block.format === 'fill-in-the-blank') {
        requireCondition(
            block.parts.some(
                (part) =>
                    part.kind === 'text' && /[\p{L}\p{N}]/u.test(part.text),
            ),
            'A contextual gap activity needs meaningful visible sentence or phrase text.',
        );
    }

    requireCondition(
        normalized(block.question) !== normalized(block.referenceAnswer),
        'A question must not consist of its own prepared answer.',
    );
}

function validateFrozenBlockSource(
    source: NamedExerciseSource,
    blocks: readonly LearningBlock[],
) {
    if (source.kind === 'text-selection') {
        // The application must compare this to the separately authorized frozen
        // document selection; block lookup cannot establish note/version access.
        return;
    }

    const candidates = blocks.filter(
        (block) => block.id === source.origin.blockId,
    );

    requireCondition(
        candidates.length === 1,
        'Exercise source must identify exactly one supplied source block.',
    );

    const block = candidates[0]!;

    if (source.kind === 'vocabulary') {
        requireCondition(
            block.type === 'vocabulary',
            'Vocabulary provenance must refer to a vocabulary block.',
        );

        requireCondition(
            source.entries.every((entry) =>
                block.entries.some(
                    (actual) =>
                        actual.id === entry.entryId &&
                        actual.term === entry.term &&
                        vocabularyExerciseSourceSense(actual) === entry.sense,
                ),
            ),
            'Vocabulary provenance must preserve each selected entry and its exact sense.',
        );

        return;
    }

    if (source.kind === 'grammar') {
        requireCondition(
            block.type === 'grammar',
            'Grammar provenance must refer to a grammar block.',
        );

        requireCondition(
            source.rule === grammarExerciseSourceRule(block),
            'Grammar provenance must preserve the exact selected rule.',
        );

        return;
    }

    requireCondition(
        block.type === 'bilingual-text',
        'Text provenance must refer to a text block.',
    );

    requireCondition(
        source.passages.every((passage) =>
            block.segments.some(
                (actual) =>
                    actual.id === passage.segmentId &&
                    actual.text === passage.text,
            ),
        ),
        'Text provenance must preserve the exact selected passages.',
    );
}

/** Validates pedagogy-shaped content, not authorization or semantic correctness.
 * Supplied blocks must already be authorized by the application. A proposal ID
 * and a frozen selection's note/version still need their own authority checks.
 */
export function validateNamedExerciseActivity(
    block: ExerciseLearningBlock & {
        semantics?: NamedExerciseSemantics | undefined;
    },
    sourceBlocks?: readonly LearningBlock[],
): asserts block is NamedExerciseBlock {
    const result = NamedExerciseSemanticsSchema.safeParse(block.semantics);
    requireCondition(
        result.success,
        'A named exercise needs complete valid catalog semantics.',
    );

    const semantics = result.data;
    requireCondition(
        semantics.format === block.format,
        'Exercise interaction must match its named activity.',
    );

    const named = { ...block, semantics } as NamedExerciseBlock;

    validatePreparedKey(named);
    validateChoiceInteraction(named);
    validateTargetAndContext(named);
    validateAnswerDisclosure(named);

    if (sourceBlocks) {
        for (const source of semantics.sources) {
            validateFrozenBlockSource(source, sourceBlocks);
        }
    }
}
