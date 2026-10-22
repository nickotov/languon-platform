import { ChevronUp } from 'lucide-react';
import type { ConversationTurn } from '@languon/contracts';
import { conversationCopy } from '@/fsd/entities/conversation';
import { compactCredits } from '@/fsd/features/text-ai-preferences';
import { useI18n } from '@/fsd/shared/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/fsd/shared/ui';
import styles from './conversation-messages.module.css';

function billingCopy(locale: string) {
    const index = ['en', 'ru', 'fr', 'es'].indexOf(locale);
    const at = Math.max(0, index);
    const values = {
        execution: ['Execution', 'Выполнение', 'Exécution', 'Ejecución'],
        billing: ['Billing', 'Оплата', 'Facturation', 'Facturación'],
        held: [
            'Credits held',
            'Кредиты зарезервированы',
            'Crédits réservés',
            'Créditos reservados',
        ],
        charged: ['Charged', 'Списано', 'Facturé', 'Cobrado'],
        released: [
            'Hold released · no charge',
            'Резерв снят · без списания',
            'Réserve libérée · sans frais',
            'Reserva liberada · sin cargo',
        ],
        free: ['Free', 'Бесплатно', 'Gratuit', 'Gratis'],
        unknown: ['Unknown', 'Неизвестно', 'Inconnu', 'Desconocido'],
        queued: ['Queued', 'В очереди', 'En attente', 'En cola'],
        running: ['Running', 'Выполняется', 'En cours', 'En curso'],
        succeeded: ['Completed', 'Завершено', 'Terminé', 'Completado'],
        failed: ['Failed', 'Ошибка', 'Échec', 'Error'],
        cancelled: ['Stopped', 'Остановлено', 'Arrêté', 'Detenido'],
    };
    return Object.fromEntries(
        Object.entries(values).map(([key, row]) => [key, row[at]!]),
    ) as Record<keyof typeof values, string>;
}

export function TurnUsage({ turn }: { turn: ConversationTurn }) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const labels = billingCopy(locale);
    const billing = turn.billing;
    let trigger = `${copy.chargedCredits}: ${compactCredits(turn.usage.chargedCredits)}`;
    if (billing) {
        trigger = labels[billing.state];
        if (billing.state === 'held')
            trigger += `: ${compactCredits(billing.heldCredits)}`;
        if (billing.state === 'charged')
            trigger += `: ${billing.chargedCredits == null ? labels.unknown : compactCredits(billing.chargedCredits)}`;
    }
    let measurement = turn.usage.estimated ? copy.estimated : copy.reported;
    if (billing?.measurement === 'estimated') measurement = copy.estimated;
    if (
        billing?.measurement === 'unknown' ||
        (billing && billing.measurement === null)
    )
        measurement = labels.unknown;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button type='button' className={styles.quiet}>
                    <ChevronUp size={14} aria-hidden='true' />
                    {trigger}
                </button>
            </PopoverTrigger>
            <PopoverContent
                side='top'
                align='end'
                aria-label={copy.usage}
                className={styles.usagePopover}
            >
                <dl className={styles.usageDetails}>
                    <dt>{labels.execution}</dt>
                    <dd>{labels[turn.status]}</dd>
                    {billing && (
                        <>
                            <dt>{labels.billing}</dt>
                            <dd>{labels[billing.state]}</dd>
                            <dt>{labels.held}</dt>
                            <dd>{billing.heldCredits}</dd>
                            <dt>{copy.chargedCredits}</dt>
                            <dd>{billing.chargedCredits ?? labels.unknown}</dd>
                        </>
                    )}
                    {!billing && (
                        <>
                            <dt>{copy.chargedCredits}</dt>
                            <dd>{turn.usage.chargedCredits}</dd>
                        </>
                    )}
                    <dt>{copy.model}</dt>
                    <dd>{turn.modelId}</dd>
                    <dt>{copy.inputTokens}</dt>
                    <dd>{turn.usage.inputTokens}</dd>
                    <dt>{copy.outputTokens}</dt>
                    <dd>{turn.usage.outputTokens}</dd>
                    <dt>{copy.usage}</dt>
                    <dd>{measurement}</dd>
                </dl>
            </PopoverContent>
        </Popover>
    );
}
