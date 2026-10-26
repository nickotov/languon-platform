import { AiActionCreditBudgetSchema } from '@languon/contracts';

/** Credits remain decimal strings; no floating point conversion at this boundary. */
export function validActionBudget(value: string): boolean {
    return AiActionCreditBudgetSchema.safeParse(value).success;
}

export function compactCredits(value: string): string {
    if (!/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(value)) return value;
    const [whole = '0', fraction = ''] = value.split('.');
    const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
    if (milli > 0n && milli < 10n) return '<0.01';
    const hundredths = (milli + 5n) / 10n;
    return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}

export function budgetCopy(locale: string) {
    if (locale === 'ru')
        return {
            label: 'Максимум кредитов на действие',
            help: 'Отправка разрешает расход в пределах этого максимума и доступного баланса. Максимум не повышается автоматически.',
            invalid:
                'Введите положительное число с точностью до 0,001 кредита.',
            exact: 'Точное значение',
            maximum: 'Максимум',
            unset: 'Укажите максимум перед платным действием.',
            authorization:
                'Отправка разрешает расход в пределах максимума и доступного баланса.',
        };
    if (locale === 'fr')
        return {
            label: 'Crédits maximum par action',
            help: 'L’envoi autorise une dépense dans cette limite et le solde disponible. La limite n’augmente jamais automatiquement.',
            invalid:
                'Saisissez un nombre positif avec au plus trois décimales.',
            unset: 'Définissez un maximum avant une action payante.',
            exact: 'Valeur exacte',
            maximum: 'Maximum',
            authorization:
                'L’envoi autorise une dépense dans cette limite et le solde disponible.',
        };
    if (locale === 'es')
        return {
            label: 'Créditos máximos por acción',
            help: 'Enviar autoriza el gasto dentro de este máximo y el saldo disponible. El máximo nunca aumenta automáticamente.',
            invalid: 'Introduce un número positivo con hasta tres decimales.',
            unset: 'Establece un máximo antes de una acción de pago.',
            exact: 'Valor exacto',
            maximum: 'Máximo',
            authorization:
                'Enviar autoriza el gasto dentro del máximo y el saldo disponible.',
        };
    return {
        label: 'Maximum credits per action',
        help: 'Sending authorizes spending within this maximum and your available balance. The maximum never increases automatically.',
        invalid: 'Enter a positive number with up to three decimal places.',
        unset: 'Set a maximum before a paid action.',
        exact: 'Exact value',
        maximum: 'Maximum',
        authorization:
            'Sending authorizes spending within the maximum and your available balance.',
    };
}
