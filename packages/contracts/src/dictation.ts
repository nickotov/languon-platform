export type DictationWord = {
    kind: 'matched' | 'changed' | 'missing' | 'extra';
    expected?: string;
    submitted?: string;
};

function words(text: string, segmenter?: Intl.Segmenter) {
    const canonical = text.normalize('NFC');
    if (segmenter) {
        return Array.from(segmenter.segment(canonical))
            .filter((part) => part.isWordLike)
            .map((part) => part.segment);
    }

    return (
        canonical.match(/[\p{L}\p{M}\p{N}]+(?:['’ʼ][\p{L}\p{M}\p{N}]+)*/gu) ??
        []
    );
}

/** A shortest word edit alignment keeps a missing word from shifting all later feedback. */
export function compareDictation(
    expected: string,
    submitted: string,
    language: string,
): DictationWord[] {
    // These writing systems routinely omit spaces between words. ICU determines
    // lexical boundaries while whitespace-delimited languages keep contractions.
    const scriptLocale = /^(zh|ja|th|km|lo|my)(?:-|$)/iu.exec(language)?.[1];
    const segmenter = scriptLocale
        ? new Intl.Segmenter(scriptLocale, { granularity: 'word' })
        : undefined;
    const target = words(expected, segmenter);
    const answer = words(submitted, segmenter);
    const normalize = (word: string) =>
        word
            .replace(/[’ʼ]/gu, "'")
            .toLocaleLowerCase(
                /^(tr|az|lt)(-|$)/iu.exec(language)?.[1] ?? 'und',
            );
    const keys = target.map(normalize);
    const values = answer.map(normalize);
    const width = answer.length + 1;
    const cost = new Uint16Array((target.length + 1) * width);
    for (let column = 1; column < width; column++) {
        cost[column] = column;
    }

    for (let row = 1; row <= target.length; row++) {
        const offset = row * width;
        cost[offset] = row;
        for (let column = 1; column < width; column++) {
            cost[offset + column] = Math.min(
                cost[offset - width + column - 1]! +
                    Number(keys[row - 1] !== values[column - 1]),
                cost[offset - width + column]! + 1,
                cost[offset + column - 1]! + 1,
            );
        }
    }

    let row = target.length;
    let column = answer.length;
    const reversed: DictationWord[] = [];
    while (row || column) {
        const index = row * width + column;
        const match = keys[row - 1] === values[column - 1];
        if (
            row &&
            column &&
            cost[index] === cost[index - width - 1]! + Number(!match)
        ) {
            reversed.push({
                kind: match ? 'matched' : 'changed',
                expected: target[--row]!,
                submitted: answer[--column]!,
            });
        } else if (row && cost[index] === cost[index - width]! + 1) {
            reversed.push({ kind: 'missing', expected: target[--row]! });
        } else {
            reversed.push({ kind: 'extra', submitted: answer[--column]! });
        }
    }

    return reversed.reverse();
}
