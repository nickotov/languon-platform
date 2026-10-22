'use client';
import styles from './sentence-preparation-notice.module.css';
import { Button, ButtonLink, InlineAlert } from '@/fsd/shared/ui';
import type { SentencePreparationController } from '../../types';
import { usePreparationCopy } from '../sentence-preparation-copy';
import { usePreparationRetryCooldown } from '../../hooks/use-preparation-retry-cooldown';

export function SentencePreparationNotice({
    controller,
    onStartAgain,
    onOpenLibrary,
    onOpenAiSettings,
}: {
    controller: SentencePreparationController;
    onStartAgain(): void;
    onOpenLibrary?: (() => void) | undefined;
    onOpenAiSettings?: (() => void) | undefined;
}) {
    const { P } = usePreparationCopy();
    const run = controller.preparation;
    const cooldown = usePreparationRetryCooldown(controller.error?.retryAt);
    const retryBlocked = controller.busy || cooldown;
    const restartActions = (
        <div className={styles.actions}>
            <Button
                size='compact'
                onClick={onStartAgain}
                disabled={controller.busy}
            >
                {P('startAgain')}
            </Button>
            {onOpenLibrary ? (
                <Button
                    size='compact'
                    variant='secondary'
                    onClick={onOpenLibrary}
                >
                    {P('openLibrary')}
                </Button>
            ) : null}
        </div>
    );
    const leave = (
        <ButtonLink size='compact' href='/dictionaries'>
            {P('toLibrary')}
        </ButtonLink>
    );
    function refresh() {
        void controller.refresh();
    }
    function resume() {
        if (run?.requiresNewBudget) void controller.continueWithBudget?.();
        else void controller.resume();
    }
    const retry = (
        <Button size='compact' onClick={refresh} disabled={retryBlocked}>
            {P('checkStatus')}
        </Button>
    );
    const resumeButton = (
        <Button size='compact' onClick={resume} disabled={retryBlocked}>
            {run?.requiresNewBudget ? P('continueBudget') : P('resume')}
        </Button>
    );
    const admissionRecovery = (
        <Button size='compact' disabled={retryBlocked} onClick={onStartAgain}>
            {P('startAgain')}
        </Button>
    );
    const modelActions = (
        <div className={styles.actions}>
            {run ? resumeButton : admissionRecovery}
            {onOpenAiSettings ? (
                <Button
                    size='compact'
                    variant='secondary'
                    onClick={onOpenAiSettings}
                >
                    {P('openAiSettings')}
                </Button>
            ) : null}
        </div>
    );
    if (controller.uncertain && !run)
        return (
            <InlineAlert
                tone='warning'
                title={P('uncertainTitle')}
                actions={retry}
            >
                {P('uncertainBody')}
            </InlineAlert>
        );
    if (controller.error) {
        const code = controller.error.code;
        if (code === 'authentication_required')
            return (
                <InlineAlert
                    tone='error'
                    title={P('session')}
                    actions={
                        <ButtonLink size='compact' href='/login'>
                            {P('signIn')}
                        </ButtonLink>
                    }
                >
                    {P('sessionBody')}
                </InlineAlert>
            );
        if (
            code === 'dictionary_not_found' ||
            code === 'shared_dictionary_not_found' ||
            code === 'feature_disabled'
        )
            return (
                <InlineAlert
                    tone='error'
                    title={P(
                        code === 'dictionary_not_found'
                            ? 'removedDict'
                            : 'revoked',
                    )}
                    actions={leave}
                >
                    {P(
                        code === 'dictionary_not_found'
                            ? 'removedDictBody'
                            : 'revokedBody',
                    )}
                </InlineAlert>
            );
        if (code === 'stale_content' || code === 'job_not_found')
            return (
                <InlineAlert
                    tone='info'
                    title={P('stale')}
                    actions={restartActions}
                >
                    {P(code === 'job_not_found' ? 'expiredBody' : 'staleBody')}
                </InlineAlert>
            );
        const keys = {
            ai_credits_exhausted: ['credits', 'creditsBody', 'warning'],
            daily_limit_exceeded: ['credits', 'creditsBody', 'warning'],
            capacity_unavailable: ['capacity', 'capacityBody', 'info'],
            rate_limited: ['capacity', 'capacityBody', 'info'],
            model_unavailable: ['model', 'modelBody', 'warning'],
        } as const;
        const [title, body, tone] = keys[code as keyof typeof keys] ?? [
            'network',
            'networkBody',
            'warning',
        ];
        return (
            <InlineAlert
                tone={tone}
                title={P(title)}
                actions={
                    code === 'model_unavailable'
                        ? modelActions
                        : run
                          ? retry
                          : admissionRecovery
                }
            >
                {P(body)}
            </InlineAlert>
        );
    }
    if (!run) return null;
    if (run.pauseReason === 'stale' || run.pauseReason === 'access')
        return (
            <InlineAlert
                tone={run.pauseReason === 'access' ? 'error' : 'info'}
                title={run.pauseReason === 'access' ? P('revoked') : P('stale')}
                actions={run.pauseReason === 'access' ? leave : restartActions}
            >
                {run.pauseReason === 'access'
                    ? P('revokedBody')
                    : P('staleBody')}
            </InlineAlert>
        );
    if (run.state === 'paused' || run.state === 'failed') {
        const keys = {
            budget: ['budget', 'budgetBody'],
            credits: ['credits', 'creditsBody'],
            capacity: ['capacity', 'capacityBody'],
            model: ['model', 'modelBody'],
            provider: ['provider', 'providerBody'],
            user: ['paused', 'pausedBody'],
        } as const;
        const [title, body] = run.requiresNewBudget
            ? keys.budget
            : (keys[run.pauseReason as keyof typeof keys] ?? keys.provider);
        return (
            <InlineAlert
                tone={
                    run.pauseReason === 'user' || run.pauseReason === 'capacity'
                        ? 'info'
                        : run.pauseReason === 'provider' ||
                            run.state === 'failed'
                          ? 'error'
                          : 'warning'
                }
                title={P(title)}
                actions={
                    run.pauseReason === 'model' ? modelActions : resumeButton
                }
            >
                {P(body)}
            </InlineAlert>
        );
    }
    if (run.state === 'completed') {
        const uncovered = run.eligibleCount - run.preparedCount;
        const body =
            uncovered > 0
                ? `${P('completedPartial', { n: uncovered })} ${P('notPractice')}`
                : run.generatedExerciseCount === 0
                  ? `${P('completedReuseOnly')} ${P('notPractice')}`
                  : P('notPractice');
        return (
            <InlineAlert
                tone='success'
                title={uncovered > 0 ? P('chipDone') : P('completed')}
            >
                {body}
            </InlineAlert>
        );
    }
    return null;
}
