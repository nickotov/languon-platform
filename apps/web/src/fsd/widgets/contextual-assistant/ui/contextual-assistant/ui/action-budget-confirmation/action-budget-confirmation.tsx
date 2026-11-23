import type { ConversationActionQuote } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, Dialog, DialogActions } from '@/fsd/shared/ui';
import { compactCredits } from '@/fsd/features/text-ai-preferences';

export function ActionBudgetConfirmation({
    quote,
    onSend,
    onClose,
}: {
    quote: ConversationActionQuote | null;
    onSend(): void;
    onClose(): void;
}) {
    const { locale, href } = useI18n();
    const at = Math.max(0, ['en', 'ru', 'fr', 'es'].indexOf(locale));
    const title = [
        'Review this action’s budget',
        'Подтвердите бюджет действия',
        'Vérifiez le budget de cette action',
        'Revisa el presupuesto de esta acción',
    ][at]!;
    const recordingQuote = quote?.scope === 'listening-lesson';
    const lessonQuote = quote?.scope === 'lesson-if-planned' || recordingQuote;
    const description = recordingQuote
        ? [
              'This maximum covers lesson text, exercises and generation of a new recording.',
              'Этот максимум покрывает текст урока, упражнения и создание новой аудиозаписи.',
              'Ce plafond couvre le texte, les exercices et la création du nouvel enregistrement.',
              'Este máximo cubre el texto, los ejercicios y la creación de la nueva grabación.',
          ][at]!
        : lessonQuote
          ? [
                'If your request creates a lesson, this maximum covers the entire lesson, including automatic retries.',
                'Если по запросу будет создан урок, этот максимум действует на весь урок, включая автоматические повторные попытки.',
                'Si votre demande crée une leçon, ce plafond couvre toute la leçon, y compris les nouvelles tentatives automatiques.',
                'Si tu solicitud crea una lección, este máximo cubre toda la lección, incluidos los reintentos automáticos.',
            ][at]!
          : [
                'This action’s credit and execution limits permit a smaller response. Send explicitly to authorize this allowance.',
                'Кредитный бюджет и лимиты выполнения допускают более короткий ответ. Подтвердите отправку с этим лимитом.',
                'Les limites de crédit et d’exécution permettent une réponse plus courte. Confirmez cet envoi et cette limite.',
                'Los límites de crédito y ejecución permiten una respuesta más corta. Confirma el envío con este límite.',
            ][at]!;
    const send = ['Send', 'Отправить', 'Envoyer', 'Enviar'][at]!;
    const topUp = ['Top up', 'Пополнить', 'Recharger', 'Recargar'][at]!;
    const cancel = ['Cancel', 'Отмена', 'Annuler', 'Cancelar'][at]!;
    const maximum = [
        'Maximum credits',
        'Максимум кредитов',
        'Crédits maximum',
        'Créditos máximos',
    ][at]!;
    const allowance = lessonQuote
        ? [
              'Approximate output tokens per stage',
              'Примерный лимит токенов ответа на этап',
              'Tokens de réponse approximatifs par étape',
              'Tokens de salida aproximados por etapa',
          ][at]!
        : [
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
                    <Button onClick={onSend}>{send}</Button>
                </DialogActions>
            }
        >
            {quote && (
                <>
                    <p>
                        {maximum}: {compactCredits(quote.maximumCredits)}
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
