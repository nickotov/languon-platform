import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import styles from './conversation-messages.module.css';

export function ResponseLimitNotice({
    onContinue,
    disabled,
}: {
    onContinue(): void;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const at = Math.max(0, ['en', 'ru', 'fr', 'es'].indexOf(locale));
    const label = [
        'Response limit reached',
        'Достигнут лимит ответа',
        'Limite de réponse atteinte',
        'Límite de respuesta alcanzado',
    ][at]!;
    const help = [
        'Continuing starts a new action within your saved maximum budget.',
        'Продолжение — новое действие в пределах сохранённого максимального бюджета.',
        'Continuer démarre une nouvelle action dans votre budget maximum enregistré.',
        'Continuar inicia una acción nueva dentro de tu presupuesto máximo guardado.',
    ][at]!;
    const action = ['Continue', 'Продолжить', 'Continuer', 'Continuar'][at]!;
    return (
        <section className={styles.incomplete} aria-label={label}>
            <p>
                {label}. {help}
            </p>
            <Button
                variant='secondary'
                onClick={onContinue}
                disabled={disabled}
            >
                {action}
            </Button>
        </section>
    );
}
