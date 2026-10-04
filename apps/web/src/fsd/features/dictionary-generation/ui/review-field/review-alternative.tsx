import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';

import styles from '../dictionary-generation-panel-common.module.css';

export function ReviewAlternative({
    value,
    language,
    direction,
    onSelect,
}: {
    value: string;
    language: string;
    direction: 'ltr' | 'rtl';
    onSelect(value: string): void;
}) {
    const { t } = useI18n();

    const label = t('dictionary.generation.useAlternative');

    function handleSelect() {
        onSelect(value);
    }

    return (
        <li className={styles.alternative}>
            <span
                className={styles.alternativeValue}
                dir={direction}
                lang={language}
            >
                {value}
            </span>
            <Button
                onClick={handleSelect}
                size='small'
                type='button'
                variant='secondary'
            >
                {label}
            </Button>
        </li>
    );
}
