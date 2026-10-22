'use client';
import { useEffect, useState } from 'react';
import type { ActionAllowanceQuote } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, Dialog, DialogActions } from '@/fsd/shared/ui';
import { compactCreditAmount } from '@/fsd/shared/lib/credit-amount';

export function ActionConsentDialog({
    quote,
    onSend,
    onClose,
}: {
    quote: ActionAllowanceQuote | null;
    onSend(): void;
    onClose(): void;
}) {
    const { locale, href } = useI18n();
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!quote) return;
        setNow(Date.now());
        const timer = setTimeout(
            () => setNow(Date.now()),
            Math.max(0, Date.parse(quote.expiresAt) - Date.now()),
        );
        return () => clearTimeout(timer);
    }, [quote]);
    const expired = quote !== null && Date.parse(quote.expiresAt) <= now;
    const at = Math.max(0, ['en', 'ru', 'fr', 'es'].indexOf(locale));
    const title = [
        'Review this action’s budget',
        'Подтвердите бюджет действия',
        'Vérifiez le budget de cette action',
        'Revisa el presupuesto de esta acción',
    ][at]!;
    const description = [
        'This action’s credit and execution limits permit a smaller response. Send explicitly to authorize this allowance.',
        'Кредитный бюджет и лимиты выполнения допускают более короткий ответ. Подтвердите отправку с этим лимитом.',
        'Les limites de crédit et d’exécution permettent une réponse plus courte. Confirmez cet envoi et cette limite.',
        'Los límites de crédito y ejecución permiten una respuesta más corta. Confirma el envío con este límite.',
    ][at]!;
    const send = ['Send', 'Отправить', 'Envoyer', 'Enviar'][at]!;
    const topUp = ['Top up', 'Пополнить', 'Recharger', 'Recargar'][at]!;
    const cancel = [
        'Keep editing',
        'Продолжить редактирование',
        'Continuer à modifier',
        'Seguir editando',
    ][at]!;
    const maximum = [
        'Maximum credits',
        'Максимум кредитов',
        'Crédits maximum',
        'Créditos máximos',
    ][at]!;
    const allowance = [
        'Approximate output tokens',
        'Примерный лимит токенов ответа',
        'Tokens de réponse approximatifs',
        'Tokens de salida aproximados',
    ][at]!;
    const exact = [
        'Exact value',
        'Точное значение',
        'Valeur exacte',
        'Valor exacto',
    ][at]!;
    const expires = ['Expires', 'Действует до', 'Expire', 'Caduca'][at]!;
    const expiry = quote
        ? new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
              new Date(quote.expiresAt),
          )
        : '';
    return (
        <Dialog
            open={quote !== null}
            onClose={onClose}
            title={title}
            description={description}
            footer={
                <DialogActions>
                    <Button variant='secondary' onClick={onClose}>
                        {cancel}
                    </Button>
                    <ButtonLink
                        variant='secondary'
                        href={href('/profile?tab=credits')}
                        target='_blank'
                        rel='noopener noreferrer'
                    >
                        {topUp}
                    </ButtonLink>
                    <Button onClick={onSend} disabled={expired}>
                        {send}
                    </Button>
                </DialogActions>
            }
        >
            {quote && (
                <>
                    <p>
                        {maximum}:{' '}
                        {compactCreditAmount(quote.maximumCredits, locale)}
                    </p>
                    <details>
                        <summary>{exact}</summary>
                        {quote.maximumCredits}
                    </details>
                    <p>
                        {allowance}:{' '}
                        {quote.approximateOutputTokens.toLocaleString(locale)}
                    </p>
                    <p>
                        {expires}: {expiry}
                    </p>
                </>
            )}
        </Dialog>
    );
}
