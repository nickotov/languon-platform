import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { snippetCopy } from '../../../../lib/snippet-copy';
import styles from '../../../styles/snippet-card-common.module.css';

export function SnippetActions({
    position,
    disabled,
    onAppend,
    onPrepend,
    onReplace,
}: {
    position: 'top' | 'bottom';
    disabled: boolean;
    onAppend(): void;
    onPrepend(): void;
    onReplace(): void;
}) {
    const { locale } = useI18n();
    const copy = snippetCopy(locale);
    const label = position === 'top' ? copy.actions : copy.actionsAfterReview;

    return (
        <div
            className={styles.actions}
            role='group'
            aria-label={label}
            data-dictionary-snippet-actions={position}
        >
            <Button
                type='button'
                size='small'
                onClick={onAppend}
                disabled={disabled}
            >
                {copy.append}
            </Button>
            <Button
                type='button'
                size='small'
                variant='secondary'
                onClick={onPrepend}
                disabled={disabled}
            >
                {copy.prepend}
            </Button>
            <Button
                type='button'
                size='small'
                variant='danger'
                onClick={onReplace}
                disabled={disabled}
            >
                {copy.replace}
            </Button>
        </div>
    );
}
