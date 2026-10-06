const scripts: Record<string, { letters: RegExp } | undefined> = {
    Jpan: {
        letters: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
    },
    Kore: {
        letters: /[\p{Script=Hangul}\p{Script=Han}]/u,
    },
};

let letterCodePoints: number[] | undefined;
const sqlRanges = new Map<string, string>();

/** PostgreSQL lacks Unicode Script properties. Derive its character classes
 * from the same runtime Unicode rules as validation, once per process/script.
 * Scanning is lazy; model workers never need the SQL representations. */
function sqlLetterRange(name: string, script?: RegExp): string {
    const cached = sqlRanges.get(name);
    if (cached !== undefined) return cached;
    if (!letterCodePoints) {
        letterCodePoints = [];
        for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
            if (/\p{L}/u.test(String.fromCodePoint(codePoint)))
                letterCodePoints.push(codePoint);
        }
    }
    const selected = script
        ? letterCodePoints.filter((value) =>
              script.test(String.fromCodePoint(value)),
          )
        : letterCodePoints;
    const ranges: string[] = [];
    let start: number | undefined;
    let end: number | undefined;
    const append = () => {
        if (start === undefined || end === undefined) return;
        const first = String.fromCodePoint(start);
        ranges.push(
            start === end ? first : `${first}-${String.fromCodePoint(end)}`,
        );
    };
    for (const value of selected) {
        if (end !== undefined && value === end + 1) {
            end = value;
        } else {
            append();
            start = end = value;
        }
    }
    append();
    const result = ranges.join('');
    sqlRanges.set(name, result);
    return result;
}

export const sentenceLetterSqlRange = () => sqlLetterRange('letters');

export function sentenceLanguageScript(language: string) {
    const maximized = new Intl.Locale(language).maximize().script;
    const script =
        maximized === 'Hans' || maximized === 'Hant' ? 'Hani' : maximized;
    if (!script || !/^[A-Z][a-z]{3}$/.test(script)) return null;
    let profile = scripts[script];
    if (!profile) {
        try {
            profile = { letters: new RegExp(`\\p{Script=${script}}`, 'u') };
            scripts[script] = profile;
        } catch {
            // Some locale composite scripts have no Unicode Script property.
            return null;
        }
    }
    return {
        name: script,
        ...profile,
        get sqlRange() {
            return sqlLetterRange(script, profile.letters);
        },
    };
}

/** Detect clear script reversal, not semantic language identity. Names/loans may
 * use the other script, but must not dominate an entire practice sentence. */
export function sentenceLanguageMatches(
    text: string,
    language: string,
    otherLanguage: string,
): boolean {
    const expected = sentenceLanguageScript(language);
    const other = sentenceLanguageScript(otherLanguage);
    if (!expected || !other || expected.name === other.name) return true;
    // Han is shared by Chinese, Japanese and some Korean text.
    if (
        ['Hani', 'Jpan', 'Kore'].includes(expected.name) &&
        ['Hani', 'Jpan', 'Kore'].includes(other.name)
    )
        return true;
    const letters = [...text].filter((character) => /\p{L}/u.test(character));
    if (!letters.length) return true;
    const expectedCount = letters.filter((character) =>
        expected.letters.test(character),
    ).length;
    const otherCount = letters.filter((character) =>
        other.letters.test(character),
    ).length;
    return expectedCount > 0 && expectedCount >= otherCount;
}
