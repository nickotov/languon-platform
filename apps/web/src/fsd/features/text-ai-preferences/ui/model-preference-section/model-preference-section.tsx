'use client';
import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, Card, InlineAlert, Skeleton } from '@/fsd/shared/ui';
import type { TextAiModelSummary } from '@languon/contracts';
import type { SessionRequest } from '../../api/preferences-api';
import { useModelPreference } from '../../hooks/use-model-preference';
import { preferenceCopy } from '../../lib/copy';
import { ActionBudgetField } from './action-budget-field';
import { modelLabel } from './model-option';
import { PreferencePicker } from './preference-picker';
import { PreferenceAlerts } from './preference-alerts';
import styles from './model-preference-section.module.css';

type Props = {
    requestWithSession: SessionRequest;
    onDirtyChange?(dirty: boolean): void;
    onOpenCredits?(): void;
    taskInProgress?: boolean;
};
export function ModelPreferenceSection(props: Props) {
    const actor = useSessionStore((state) => state.user?.id ?? 'signed-out');
    const status = useSessionStore((state) => state.status);
    const identity = `${actor}:${status}`;
    return <ScopedModelPreferenceSection key={identity} {...props} />;
}
function ScopedModelPreferenceSection({
    requestWithSession,
    onDirtyChange,
    onOpenCredits,
    taskInProgress = false,
}: Props) {
    const { locale } = useI18n();
    const copy = preferenceCopy(locale);
    const authenticated = useSessionStore(
        (state) => state.status === 'authenticated',
    );
    const controller = useModelPreference(requestWithSession);
    const { base, draft, catalog, pref, dirty, saveState } = controller;
    const group = useId();
    const alertRef = useRef<HTMLDivElement>(null);
    // Publish the draft before paint so the host can install navigation guards
    // in the same commit as the visible edited choice.
    useLayoutEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useLayoutEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
    useEffect(() => {
        if (['error', 'rejected', 'conflict'].includes(saveState))
            alertRef.current?.focus({ preventScroll: true });
    }, [saveState]);
    const models = catalog.data?.models ?? [];
    const defaultModel = models.find(
        (model) => model.id === catalog.data?.defaultModelId,
    );
    let autoContext = copy.unknown;
    if (catalog.isSuccess)
        autoContext =
            defaultModel?.availability === 'available'
                ? defaultModel.label
                : copy.noDefault;
    const savedChoice =
        base?.mode === 'auto' ? 'auto' : (base?.modelId ?? null);
    const options: TextAiModelSummary[] = [...models];
    const missingSaved =
        base?.mode === 'explicit' &&
        !models.some((model) => model.id === base.modelId);
    if (missingSaved && base?.selectedModel) {
        const savedModel = catalog.isSuccess
            ? {
                  ...base.selectedModel,
                  availability: 'unavailable' as const,
                  unavailableReason: copy.missing,
              }
            : base.selectedModel;
        options.unshift(savedModel);
    }
    let status = copy.unchanged;
    if (dirty) status = copy.dirty;
    if (saveState === 'saved' && !dirty) status = copy.success;
    if (saveState === 'saving') status = copy.saving;
    function save() {
        void controller.save();
    }
    function retryPreference() {
        void pref.refetch();
    }
    return (
        <Card className={styles.section} padding='none' variant='outlined'>
            <header className={styles.header}>
                <h2>{copy.title}</h2>
                <p>{copy.description}</p>
            </header>
            <div className={styles.body}>
                <p className={styles.copy}>{copy.scope}</p>
                {!authenticated ? (
                    <InlineAlert>{copy.auth}</InlineAlert>
                ) : (
                    <>
                        {base ? (
                            <div className={styles.summary}>
                                <p className={styles.label}>{copy.saved}</p>
                                <strong>
                                    {modelLabel(savedChoice, options, copy)}
                                </strong>
                                {savedChoice === 'auto' ? (
                                    <p>{autoContext}</p>
                                ) : null}
                                {dirty ? (
                                    <div className={styles.draft}>
                                        <p className={styles.label}>
                                            {copy.draft}{' '}
                                            <Badge size='sm' tone='warning'>
                                                {copy.notSaved}
                                            </Badge>
                                        </p>
                                        <strong>
                                            {modelLabel(draft, options, copy)}
                                        </strong>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        <div ref={alertRef} tabIndex={-1}>
                            <PreferenceAlerts
                                controller={controller}
                                copy={copy}
                                taskInProgress={taskInProgress}
                            />
                        </div>
                        {pref.isError && !base ? (
                            <InlineAlert
                                tone='error'
                                actions={
                                    <Button
                                        onClick={retryPreference}
                                        size='compact'
                                        variant='secondary'
                                    >
                                        {copy.retry}
                                    </Button>
                                }
                            >
                                {copy.preferenceError}
                            </InlineAlert>
                        ) : null}
                        {pref.isPending ? (
                            <div aria-label={copy.loadingPreference}>
                                <Skeleton height={84} variant='rect' />
                                <Skeleton height={84} variant='rect' />
                            </div>
                        ) : null}
                        <PreferencePicker
                            controller={controller}
                            copy={copy}
                            group={group}
                            options={options}
                            autoContext={autoContext}
                        />
                        <ActionBudgetField
                            controller={controller}
                            locale={locale}
                        />
                        <div className={styles.creditNote}>
                            <p>{copy.creditHelp}</p>
                            {onOpenCredits ? (
                                <Button
                                    onClick={onOpenCredits}
                                    size='compact'
                                    variant='ghost'
                                >
                                    {copy.credits}
                                </Button>
                            ) : null}
                        </div>
                        <footer className={styles.footer}>
                            <div className={styles.actions}>
                                <Button
                                    disabled={!controller.saveAllowed}
                                    loading={saveState === 'saving'}
                                    onClick={save}
                                >
                                    {copy.save}
                                </Button>
                                <Button
                                    disabled={!dirty || saveState === 'saving'}
                                    onClick={controller.cancel}
                                    variant='ghost'
                                >
                                    {copy.cancel}
                                </Button>
                            </div>
                            <p aria-live='polite' role='status'>
                                {status}
                            </p>
                        </footer>
                    </>
                )}
            </div>
        </Card>
    );
}
