import { AccountingUsdSchema } from '@languon/contracts';

/** Shift decimal places exactly. Reject precision the accounting meter cannot retain. */
export function scalePublishedPrice(value: unknown, places: number): string {
    if (
        typeof value !== 'string' ||
        !/^(?:0|[1-9]\d{0,20})(?:\.\d{1,30})?$/.test(value)
    )
        throw new Error('Unsupported published price.');
    const [whole = '0', fraction = ''] = value.split('.');
    const shifted = `${whole}${fraction.padEnd(places, '0')}`;
    const decimalAt = whole.length + places;
    const integer = shifted.slice(0, decimalAt).replace(/^0+(?=\d)/, '');
    const decimal = shifted.slice(decimalAt).replace(/0+$/, '');
    const normalized = `${integer}${decimal ? `.${decimal}` : ''}`;
    return AccountingUsdSchema.parse(normalized);
}
