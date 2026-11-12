import type { ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge } from '@/fsd/shared/ui';
import type { DictionaryCardAuthoringField } from '../../../../types';
import styles from '../../../styles/dictionary-card-form-common.module.css';

export function OptionalCardFields({
    fullWidthFields,
    exampleFields,
    renderField,
}: {
    fullWidthFields: DictionaryCardAuthoringField[];
    exampleFields: DictionaryCardAuthoringField[];
    renderField(field: DictionaryCardAuthoringField): ReactNode;
}) {
    const { t } = useI18n();

    return (
        <div className={styles.optionalFields}>
            <p className={styles.optionalHeading}>
                {t('dictionary.authoring.optionalContent')}
                <Badge className={styles.optionalBadge} size='sm'>
                    {t('dictionary.authoring.mayStayEmpty')}
                </Badge>
            </p>
            {fullWidthFields.map(renderField)}
            {exampleFields.length ? (
                <div className={styles.wordPair}>
                    {exampleFields.map(renderField)}
                </div>
            ) : null}
        </div>
    );
}
