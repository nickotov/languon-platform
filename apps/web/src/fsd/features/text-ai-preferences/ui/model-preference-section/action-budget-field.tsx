import type { ChangeEvent } from 'react';
import { Input } from '@/fsd/shared/ui';
import type { ModelPreferenceController } from '../../hooks/use-model-preference';
import { budgetCopy, compactCredits } from '../../lib/action-budget';
import styles from './model-preference-section.module.css';

export function ActionBudgetField({
    controller,
    locale,
}: {
    controller: ModelPreferenceController;
    locale: string;
}) {
    const { base } = controller;
    const copy = budgetCopy(locale);
    function change(event: ChangeEvent<HTMLInputElement>) {
        controller.selectBudget(event.target.value);
    }
    if (!base) return null;
    const error = controller.budgetValid ? undefined : copy.invalid;
    return (
        <div className={styles.stack}>
            <Input
                label={copy.label}
                inputMode='decimal'
                value={controller.budgetDraft}
                onChange={change}
                disabled={controller.saveState === 'saving'}
                hint={copy.help}
                {...(error ? { error } : {})}
            />
            {base.maxCreditsPerAction != null ? (
                <details className={styles.copy}>
                    <summary>
                        {copy.maximum}:{' '}
                        {compactCredits(base.maxCreditsPerAction)}
                    </summary>
                    <p>
                        {copy.exact}: {base.maxCreditsPerAction}
                    </p>
                </details>
            ) : (
                <p className={styles.copy}>{copy.unset}</p>
            )}
        </div>
    );
}
