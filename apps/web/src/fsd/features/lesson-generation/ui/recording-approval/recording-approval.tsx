import { useEffect, useState } from 'react';
import { AudioLines, RefreshCw } from 'lucide-react';
import type { ConversationActionQuote } from '@languon/contracts';
import { useI18n, type Locale } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import styles from './recording-approval.module.css';

const messages = {
    en: {
        title: 'Listening lesson',
        limit: (n: string) =>
            n === '1' ? `Up to ${n} credit` : `Up to ${n} credits`,
        generate: 'Generate recording',
        details: 'Covers the recording and the remaining lesson content.',
        preparing: 'Checking the recording budget…',
        expired: 'This estimate has expired.',
        refresh: 'Refresh estimate',
    },
    ru: {
        title: 'Урок на слух',
        limit: (n: string) => `До ${n} кр.`,
        generate: 'Создать аудиозапись',
        details: 'Включает озвучивание и подготовку оставшегося материала.',
        preparing: 'Проверяем бюджет аудиозаписи…',
        expired: 'Срок действия расчёта истёк.',
        refresh: 'Обновить расчёт',
    },
    fr: {
        title: 'Compréhension orale',
        limit: (n: string) =>
            n === '1' ? `Jusqu’à ${n} crédit` : `Jusqu’à ${n} crédits`,
        generate: 'Créer l’enregistrement',
        details:
            'Ce montant couvre l’enregistrement et le reste du contenu de la leçon.',
        preparing: 'Vérification du budget de l’enregistrement…',
        expired: 'Cette estimation a expiré.',
        refresh: 'Actualiser l’estimation',
    },
    es: {
        title: 'Comprensión auditiva',
        limit: (n: string) =>
            n === '1' ? `Hasta ${n} crédito` : `Hasta ${n} créditos`,
        generate: 'Crear grabación',
        details: 'Incluye la grabación y el contenido restante de la lección.',
        preparing: 'Comprobando el presupuesto de la grabación…',
        expired: 'La estimación ha caducado.',
        refresh: 'Actualizar estimación',
    },
};

export function recordingApprovalCopy(locale: Locale) {
    return messages[locale];
}

export function RecordingApproval({
    quote,
    disabled,
    loading,
    onDecision,
}: {
    quote?: ConversationActionQuote | undefined;
    disabled: boolean;
    loading: boolean;
    onDecision?: ((quoteId?: string) => void) | undefined;
}) {
    const { locale } = useI18n();
    const text = recordingApprovalCopy(locale);
    const [, invalidate] = useState(0);
    const expires = quote && Date.parse(quote.expiresAt);
    useEffect(() => {
        if (
            !expires ||
            expires <= Date.now() ||
            expires - Date.now() > 2_147_483_646
        ) {
            return;
        }

        const timer = window.setTimeout(
            () => invalidate((value) => value + 1),
            expires - Date.now() + 1,
        );

        return () => window.clearTimeout(timer);
    }, [expires]);

    if (!quote) {
        return (
            <p className={styles.pending} role='status'>
                {text.preparing}
            </p>
        );
    }

    const expired = Date.parse(quote.expiresAt) <= Date.now();
    const amount = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 3,
    }).format(Number(quote.maximumCredits));

    function submit() {
        onDecision?.(
            quote && Date.parse(quote.expiresAt) > Date.now()
                ? quote.id
                : undefined,
        );
    }

    return (
        <div className={styles.approval}>
            <div className={styles.terms} role='status' aria-atomic='true'>
                <p className={styles.cost}>
                    <strong className={styles.amount}>
                        {text.limit(amount)}
                    </strong>
                </p>
                <p className={styles.description}>
                    {expired ? text.expired : text.details}
                </p>
            </div>
            <Button
                type='button'
                size='compact'
                loading={loading}
                aria-busy={loading}
                variant={expired ? 'secondary' : 'primary'}
                disabled={disabled || !onDecision}
                onClick={submit}
                leadingIcon={
                    expired ? (
                        <RefreshCw size={16} aria-hidden />
                    ) : (
                        <AudioLines size={16} aria-hidden />
                    )
                }
            >
                {expired ? text.refresh : text.generate}
            </Button>
        </div>
    );
}
