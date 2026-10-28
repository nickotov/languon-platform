import type {
    ProviderNativeComponent,
    ProviderNativePricingRules,
} from '@languon/contracts';
import type {
    ProviderPriceFetchResult,
    ProviderPriceSource,
    ProviderPriceTarget,
} from '../../application/provider-price-source';
import {
    nativePrice,
    publishedRate,
    sourceFailure,
} from './native-price-source';
import { readPricingText } from './pricing-http';

const sourceUrl = 'https://api-docs.deepseek.com/quick_start/pricing/';
/** State Council 2026 calendar, reviewed against the official published notice.
 * https://www.gov.cn/zhengce/content/202511/content_7047090.htm
 * Weekend make-up workdays stay off-peak under DeepSeek's explicit weekend rule.
 */
const holidays = [
    ['2026-01-01', '2026-01-03'],
    ['2026-02-15', '2026-02-23'],
    ['2026-04-04', '2026-04-06'],
    ['2026-05-01', '2026-05-05'],
    ['2026-06-19', '2026-06-21'],
    ['2026-09-25', '2026-09-27'],
    ['2026-10-01', '2026-10-07'],
];
const day = 86_400_000;
const clean = (html: string) =>
    html
        .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

/** Interpret table spans rather than guessing the position of a neighbouring model's price. */
function pricingTable(html: string): string[][] {
    const table = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].find(
        ([value]) => /CACHE HIT/.test(value) && /OFF-PEAK/.test(value),
    )?.[0];
    if (!table) throw new Error('Pricing table missing.');
    const active = new Map<number, { text: string; rows: number }>();
    const grid: string[][] = [];
    for (const [rowHtml] of table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
        if (grid.length >= 128)
            throw new Error('Pricing table exceeds reviewed bounds.');
        const row: string[] = [];
        for (const [column, span] of active) {
            row[column] = span.text;
            if (--span.rows === 0) active.delete(column);
        }
        let column = 0;
        for (const cell of rowHtml.matchAll(
            /<(?:td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi,
        )) {
            while (row[column] !== undefined) column++;
            const span = Number(/colspan=["']?(\d+)/i.exec(cell[1]!)?.[1] ?? 1);
            const rows = Number(/rowspan=["']?(\d+)/i.exec(cell[1]!)?.[1] ?? 1);
            if (column + span > 64)
                throw new Error('Pricing table exceeds reviewed bounds.');
            if (span < 1 || span > 32 || rows < 1 || rows > 64)
                throw new Error('Invalid pricing table span.');
            const text = clean(cell[2]!);
            for (let index = 0; index < span; index++) {
                row[column] = text;
                if (rows > 1) active.set(column, { text, rows: rows - 1 });
                column++;
            }
        }
        grid.push(row);
    }
    return grid;
}

function schedules(at: Date) {
    if (at.getUTCFullYear() !== 2026)
        throw new Error(
            'Reviewed holiday calendar does not cover the requested year.',
        );
    const from = Date.UTC(
        at.getUTCFullYear(),
        at.getUTCMonth(),
        at.getUTCDate(),
    );
    const until = Math.min(from + 32 * day, Date.UTC(2027, 0, 1));
    const peak: Array<{ from: string; until: string }> = [];
    for (let instant = from; instant < until; instant += day) {
        const date = new Date(instant);
        const key = date.toISOString().slice(0, 10);
        if (
            date.getUTCDay() === 0 ||
            date.getUTCDay() === 6 ||
            holidays.some(([start, end]) => key >= start! && key <= end!)
        )
            continue;
        for (const [start, end] of [
            [60, 240],
            [360, 600],
        ])
            peak.push({
                from: new Date(instant + start! * 60_000).toISOString(),
                until: new Date(instant + end! * 60_000).toISOString(),
            });
    }
    const offPeak: Array<{ from: string; until: string }> = [];
    let cursor = from;
    for (const window of peak) {
        const start = Date.parse(window.from);
        if (cursor < start)
            offPeak.push({
                from: new Date(cursor).toISOString(),
                until: window.from,
            });
        cursor = Date.parse(window.until);
    }
    if (cursor < until)
        offPeak.push({
            from: new Date(cursor).toISOString(),
            until: new Date(until).toISOString(),
        });
    return {
        validFrom: new Date(from).toISOString(),
        validUntil: new Date(until).toISOString(),
        peak,
        offPeak,
    };
}

function rules(
    html: string,
    modelId: string,
    at: Date,
): ProviderNativePricingRules | null {
    const grid = pricingTable(html);
    const header = grid.find((row) => row[0] === 'MODEL');
    const column = header?.indexOf(modelId) ?? -1;
    if (column < 3) return null;
    if (
        !/01:00\s*-\s*04:00 and 06:00\s*-\s*10:00 UTC, Monday through Friday, excluding Chinese public holidays/.test(
            clean(html),
        )
    )
        throw new Error('Published schedule changed.');
    const schedule = schedules(at);
    const components = (
        period: 'PEAK' | 'OFF-PEAK',
    ): ProviderNativeComponent[] => {
        const find = (label: string) => {
            const matching = grid.filter(
                (row) =>
                    row[0]?.includes('PRICING') &&
                    row[1]?.includes(label) &&
                    row[2] === period,
            );
            if (matching.length !== 1)
                throw new Error('Ambiguous model price row.');
            const text = matching[0]![column];
            if (!text?.startsWith('$'))
                throw new Error('USD model price missing.');
            return publishedRate(text.slice(1));
        };
        return [
            {
                meter: 'uncachedInputTokens',
                pricePerUnit: find('CACHE MISS'),
                unitQuantity: 1_000_000,
                chargeWhen: 'positive-usage',
            },
            {
                meter: 'cacheReadTokens',
                pricePerUnit: find('CACHE HIT'),
                unitQuantity: 1_000_000,
                chargeWhen: 'positive-usage',
            },
            {
                meter: 'outputTokens',
                pricePerUnit: find('OUTPUT TOKENS'),
                unitQuantity: 1_000_000,
                chargeWhen: 'positive-usage',
            },
        ];
    };
    return {
        version: 1,
        validFrom: schedule.validFrom,
        validUntil: schedule.validUntil,
        variants: [
            ...(schedule.peak.length
                ? [
                      {
                          id: 'weekday-peak',
                          applies: { dispatchWindows: schedule.peak },
                          components: components('PEAK'),
                      },
                  ]
                : []),
            {
                id: 'off-peak',
                applies: { dispatchWindows: schedule.offPeak },
                components: components('OFF-PEAK'),
            },
        ],
    };
}

export class DeepSeekPriceSource implements ProviderPriceSource {
    readonly providerId = 'deepseek';
    constructor(
        private readonly fetcher: typeof fetch = fetch,
        private readonly now: () => Date = () => new Date(),
    ) {}
    async fetchPrices(
        targets: ProviderPriceTarget[],
        signal?: AbortSignal,
    ): Promise<ProviderPriceFetchResult[]> {
        if (!targets.length) return [];
        let html: string;
        try {
            html = await readPricingText(
                this.fetcher,
                new URL(sourceUrl),
                signal,
            );
        } catch {
            return targets.map((target) =>
                sourceFailure(
                    target,
                    'unavailable',
                    'Official DeepSeek pricing is unavailable.',
                ),
            );
        }
        return targets.map((target) => {
            if (
                target.providerId !== this.providerId ||
                target.meter !== 'text-tokens'
            )
                return sourceFailure(
                    target,
                    'source-changed',
                    'The model meter does not match DeepSeek text pricing.',
                );
            try {
                const found = rules(html, target.modelId, this.now());
                return found
                    ? {
                          target,
                          status: 'available',
                          price: nativePrice(
                              target,
                              found,
                              sourceUrl,
                              'deepseek-official-table-calendar-2026-v1',
                          ),
                      }
                    : sourceFailure(
                          target,
                          'model-not-found',
                          'The exact model is absent from the official DeepSeek pricing table.',
                      );
            } catch {
                return sourceFailure(
                    target,
                    'source-changed',
                    'DeepSeek pricing or reviewed holiday-calendar coverage needs review.',
                );
            }
        });
    }
}
