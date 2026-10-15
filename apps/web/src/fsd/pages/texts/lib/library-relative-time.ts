/** Localized relative labels used by the library cards and text rows. */
export function libraryRelativeTime(
    updatedAt: string,
    locale: string,
    now = Date.now(),
): string {
    const seconds = (new Date(updatedAt).getTime() - now) / 1000;
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ['year', 31_536_000],
        ['month', 2_592_000],
        ['day', 86_400],
        ['hour', 3_600],
        ['minute', 60],
        ['second', 1],
    ];
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    for (const [unit, duration] of units) {
        if (Math.abs(seconds) >= duration || unit === 'second') {
            return formatter.format(Math.round(seconds / duration), unit);
        }
    }
    return formatter.format(0, 'second');
}
