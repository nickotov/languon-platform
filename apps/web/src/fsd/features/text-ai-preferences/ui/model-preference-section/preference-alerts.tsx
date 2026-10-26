import { useI18n } from '@/fsd/shared/i18n';
import { budgetCopy } from '../../lib/action-budget';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { ModelPreferenceController } from '../../hooks/use-model-preference';
import type { preferenceCopy } from '../../lib/copy';
import styles from './model-preference-section.module.css';
export function PreferenceAlerts({
    controller,
    copy,
    taskInProgress,
}: {
    controller: ModelPreferenceController;
    copy: ReturnType<typeof preferenceCopy>;
    taskInProgress: boolean;
}) {
    const { locale } = useI18n();
    const budget = budgetCopy(locale);
    const { saveState, latest } = controller;
    function retrySave() {
        void controller.save();
    }
    function overwrite() {
        void controller.save(true);
    }
    function reload() {
        void controller.reloadLatest();
    }
    return (
        <div className={styles.stack}>
            {!controller.online ? (
                <InlineAlert tone='warning'>{copy.offline}</InlineAlert>
            ) : null}
            {taskInProgress ? <InlineAlert>{copy.running}</InlineAlert> : null}
            {saveState === 'error' ? (
                <InlineAlert
                    tone='error'
                    actions={
                        <Button
                            disabled={!controller.online}
                            onClick={retrySave}
                            size='compact'
                            variant='secondary'
                        >
                            {copy.retry}
                        </Button>
                    }
                >
                    {copy.saveError}
                </InlineAlert>
            ) : null}
            {saveState === 'conflict' ? (
                <InlineAlert tone='warning' title={copy.conflict}>
                    {latest ? (
                        <div className={styles.comparison}>
                            <p>
                                <strong>{copy.latest}</strong>
                                <br />
                                {budget.maximum}:{' '}
                                {latest.maxCreditsPerAction ?? budget.unset}
                            </p>
                            <p>
                                <strong>{copy.draft}</strong>
                                <br />
                                {budget.maximum}:{' '}
                                {controller.budgetDraft || budget.unset}
                            </p>
                        </div>
                    ) : null}
                    <div className={styles.actions}>
                        <Button
                            disabled={!latest}
                            onClick={controller.useLatest}
                            size='compact'
                            variant='secondary'
                        >
                            {copy.useLatest}
                        </Button>
                        <Button
                            disabled={
                                !latest ||
                                !controller.online ||
                                !controller.budgetValid
                            }
                            onClick={overwrite}
                            size='compact'
                        >
                            {copy.overwrite}
                        </Button>
                        <Button onClick={reload} size='compact' variant='ghost'>
                            {copy.reloadLatest}
                        </Button>
                    </div>
                </InlineAlert>
            ) : null}
        </div>
    );
}
