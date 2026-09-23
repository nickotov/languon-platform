export function isValidCardAuthoringSource(source: string) {
    const trimmed = source.trim();
    return (
        trimmed.length > 0 &&
        [...trimmed].length <= 200 &&
        ![...trimmed].some((character) => {
            const code = character.codePointAt(0)!;
            return (
                code <= 8 ||
                code === 11 ||
                code === 12 ||
                (code >= 14 && code <= 31) ||
                (code >= 127 && code <= 159)
            );
        })
    );
}
