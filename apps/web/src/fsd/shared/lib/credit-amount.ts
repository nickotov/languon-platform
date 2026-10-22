import { parseCreditMilli } from '@languon/contracts';

/** Round only for display; admission always compares exact integer milli-credits. */
export function compactCreditAmount(value: string, locale: string): string {
    const milli = parseCreditMilli(value);
    const formatter = new Intl.NumberFormat(locale);
    const separator =
        new Intl.NumberFormat(locale)
            .formatToParts(1.1)
            .find((part) => part.type === 'decimal')?.value ?? '.';
    if (milli > 0n && milli < 10n) return `<0${separator}01`;
    const hundredths = (milli + 5n) / 10n;
    const fraction = String(hundredths % 100n)
        .padStart(2, '0')
        .replace(/0+$/, '');
    return `${formatter.format(hundredths / 100n)}${fraction ? separator + fraction : ''}`;
}
