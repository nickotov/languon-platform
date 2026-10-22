'use client';
import type { ActionBilling as Billing } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { compactCreditAmount } from '@/fsd/shared/lib/credit-amount';

/** Render only server-projected billing; an execution outcome alone never implies a charge. */
export function ActionBilling({
    billing,
    execution,
}: {
    billing?: Billing | undefined;
    execution?: string | undefined;
}) {
    const { locale } = useI18n();
    if (!billing) return null;
    const at = Math.max(0, ['en', 'ru', 'fr', 'es'].indexOf(locale));
    const labels = {
        held: [
            'Credits held',
            'Кредиты зарезервированы',
            'Crédits réservés',
            'Créditos reservados',
        ],
        charged: ['Charged', 'Списано', 'Facturé', 'Cobrado'],
        released: ['No charge', 'Без списания', 'Aucun débit', 'Sin cargo'],
        free: ['Free', 'Бесплатно', 'Gratuit', 'Gratis'],
    };
    const amount =
        billing.state === 'held'
            ? billing.heldCredits
            : billing.state === 'charged'
              ? billing.chargedCredits
              : null;
    const exact = [
        'Exact amounts',
        'Точные суммы',
        'Montants exacts',
        'Importes exactos',
    ][at];
    const charged = [
        'Charged credits',
        'Списанные кредиты',
        'Crédits facturés',
        'Créditos cobrados',
    ][at];
    const held = labels.held[at];
    const unknown = ['Unknown', 'Неизвестно', 'Inconnu', 'Desconocido'][at];
    const usage =
        billing.measurement === 'estimated'
            ? [
                  'Estimated usage',
                  'Оценка использования',
                  'Utilisation estimée',
                  'Uso estimado',
              ][at]
            : billing.measurement === 'unknown'
              ? [
                    'Usage unknown',
                    'Использование неизвестно',
                    'Utilisation inconnue',
                    'Uso desconocido',
                ][at]
              : null;
    const states: Record<string, string[]> = {
        queued: ['Queued', 'В очереди', 'En attente', 'En cola'],
        running: ['Running', 'Выполняется', 'En cours', 'En curso'],
        completed: ['Completed', 'Завершено', 'Terminé', 'Completado'],
        review: ['Completed', 'Завершено', 'Terminé', 'Completado'],
        accepted: ['Completed', 'Завершено', 'Terminé', 'Completado'],
        succeeded: ['Completed', 'Завершено', 'Terminé', 'Completado'],
        failed: ['Failed', 'Ошибка', 'Échec', 'Error'],
        cancelled: ['Stopped', 'Остановлено', 'Arrêté', 'Detenido'],
        stopping: [
            'Stopping',
            'Останавливается',
            'Arrêt en cours',
            'Deteniendo',
        ],
        paused: ['Paused', 'Приостановлено', 'En pause', 'En pausa'],
        expired: ['Expired', 'Истекло', 'Expiré', 'Caducado'],
        stopped: ['Stopped', 'Остановлено', 'Arrêté', 'Detenido'],
    };
    const state = execution ? states[execution]?.[at] : undefined;
    return (
        <div role='status' aria-live='polite'>
            {state && <p>{state}</p>}
            <p>
                {labels[billing.state][at]}
                {amount !== null
                    ? `: ${compactCreditAmount(amount, locale)}`
                    : billing.state === 'charged'
                      ? `: ${unknown}`
                      : ''}
            </p>
            {usage && <p>{usage}</p>}
            <details>
                <summary>{exact}</summary>
                <p>
                    {held}: {billing.heldCredits}
                </p>
                <p>
                    {charged}: {billing.chargedCredits ?? unknown}
                </p>
            </details>
        </div>
    );
}
