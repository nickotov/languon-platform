'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Card, InlineAlert, Skeleton } from '@/fsd/shared/ui';
import type { SessionRequest } from '../../api/preferences-api';
import { useModelPreference } from '../../hooks/use-model-preference';
import { preferenceCopy } from '../../lib/copy';
import { ActionBudgetField } from './action-budget-field';
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
    const { base, pref, dirty, saveState } = controller;
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
