import type { SentenceAttempt } from '@languon/contracts';

export function segmentAnswer(
    answer: string,
    issues: SentenceAttempt['feedback']['issues'],
) {
    const valid = issues
        .map((issue, index) => ({ index, span: issue.span }))
        .filter(
            (item) =>
                item.span &&
                answer.slice(item.span.start, item.span.end) ===
                    item.span.quote,
        );
    const chunks: { text: string; issue: number | null }[] = [];
    answer.split('').forEach((point, index) => {
        const issue =
            valid.find(
                (item) =>
                    item.span &&
                    index >= item.span.start &&
                    index < item.span.end,
            )?.index ?? null;
        const last = chunks.at(-1);
        if (last && last.issue === issue) {
            last.text += point;
        } else {
            chunks.push({ text: point, issue });
        }
    });

    return chunks;
}

export function dictionaryTargetText(
    attempt: SentenceAttempt,
    entryId: string,
): string | undefined {
    const segment = attempt.exercise.segments.find(
        (item) => item.target?.entryId === entryId,
    );
    const hintId = segment?.target?.hintId;

    return attempt.exercise.hints.find((hint) => hint.id === hintId)?.text;
}
