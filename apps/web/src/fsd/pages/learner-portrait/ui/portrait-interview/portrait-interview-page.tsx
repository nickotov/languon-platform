'use client';
import { ActionConsentDialog } from '@/fsd/entities/ai-action';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { emptyPortraitItems } from '@/fsd/features/portrait-editor';
import { useInterviewQuestion } from '../../hooks/use-interview-question';
import { useInterviewQuestionScroll } from '../../hooks/use-interview-question-scroll';
import { useInterviewOpening } from '../../hooks/use-interview-opening';
import { usePortraitInterview } from '../../hooks/use-portrait-interview';
import { interviewErrorMessage, interviewText } from '../../lib/interview-copy';
import { countInterviewItems } from '../../lib/interview-questions';
import { InterviewCostNotice } from './interview-cost-notice';
import { InterviewRecovery } from './interview-recovery';
import { InterviewErrorNotice } from './interview-error-notice';
import { InterviewHeader } from './interview-header';
import { InterviewQuestionStage } from './interview-question-stage';
import { InterviewTranscript } from './interview-transcript';
import { InterviewComposer } from './interview-composer';
import { InterviewPreview } from './interview-preview';
import styles from './portrait-interview.module.css';

export function PortraitInterviewPage() {
    const engine = usePortraitInterview();
    const router = useRouter();
    const { href, locale: interfaceLocale } = useI18n();
    const [preview, setPreview] = useState(false);
    const [dismissedAttempt, setDismissedAttempt] = useState<string | null>(
        null,
    );
    const questions = useInterviewQuestion(engine.session, engine.submit);
    const session = engine.session;
    const opening = useInterviewOpening(session);
    useInterviewQuestionScroll(
        session?.context.messages.length ?? 0,
        engine.busy,
        engine.error,
    );
    function pause() {
        router.push(href('/portrait'));
    }
    function review() {
        router.push(href('/portrait/review'));
    }
    function togglePreview() {
        setPreview((value) => !value);
    }
    function dismissAttempt() {
        setDismissedAttempt(session?.lastAttempt?.id ?? null);
    }
    function closePreview() {
        setPreview(false);
    }
    if (engine.missing)
        return (
            <main className={styles.empty}>
                <h1>{interviewText(interfaceLocale, 'noInterview')}</h1>
                <p>{interviewText(interfaceLocale, 'expiryHelp')}</p>
                <ButtonLink href={href('/portrait/intro')}>
                    {interviewText(interfaceLocale, 'start')}
                </ButtonLink>
                <ButtonLink href={href('/portrait')} variant='secondary'>
                    {interviewText(interfaceLocale, 'back')}
                </ButtonLink>
            </main>
        );
    if (!session)
        return (
            <main className={styles.empty}>
                {engine.error ? (
                    <>
                        <InlineAlert
                            tone='error'
                            title={interviewText(
                                interfaceLocale,
                                'unavailable',
                            )}
                        >
                            {interviewErrorMessage(
                                interfaceLocale,
                                engine.error,
                            )}
                        </InlineAlert>
                        <Button onClick={engine.reconnect}>
                            {interviewText(interfaceLocale, 'retry')}
                        </Button>
                        <ButtonLink href={href('/portrait')}>
                            {interviewText(interfaceLocale, 'back')}
                        </ButtonLink>
                    </>
                ) : (
                    <LoadingState>
                        {interviewText(interfaceLocale, 'opening')}
                    </LoadingState>
                )}
            </main>
        );
    const locale = session.context.locale;
    const question = questions.question!;
    const items =
        session.context.draftItems ??
        session.context.approvedItems ??
        emptyPortraitItems();
    const update = session.context.approvedItems !== null;
    const recoverable =
        session.lastAttempt && session.lastAttempt.id !== dismissedAttempt
            ? session.lastAttempt
            : null;
    const latestRedirect = session.latestCompletedOperation?.result.redirect;
    return (
        <div className={styles.root}>
            <InterviewHeader
                locale={locale}
                update={update}
                completed={session.context.completedTopics}
                topic={question.topic}
                count={countInterviewItems(items)}
                busy={engine.busy}
                preview={preview}
                onPause={pause}
                onReview={review}
                onPreview={togglePreview}
                onLocale={engine.switchLocale}
            />
            <div className={styles.layout}>
                <main className={styles.conversation}>
                    {update ? (
                        <InlineAlert
                            tone='info'
                            title={interviewText(locale, 'updateRead')}
                        >
                            {interviewText(locale, 'updateHelp')}
                        </InlineAlert>
                    ) : null}
                    <InterviewTranscript
                        session={session}
                        opening={opening}
                        proposal={engine.proposal}
                        busy={engine.busy}
                        onAccept={engine.acceptProposal}
                        onDismiss={engine.dismissProposal}
                        onReview={review}
                    />
                    {engine.error ? (
                        <InterviewErrorNotice
                            error={engine.error}
                            locale={locale}
                            onReconnect={engine.reconnect}
                            onReview={review}
                        />
                    ) : null}
                    {latestRedirect ? (
                        <div className={styles.actions}>
                            <Button onClick={questions.focus}>
                                {interviewText(locale, 'next')}
                            </Button>
                            <Button variant='secondary' onClick={pause}>
                                {interviewText(locale, 'pause')}
                            </Button>
                            <ButtonLink
                                href={href('/knowledge')}
                                variant='ghost'
                            >
                                Knowledge
                            </ButtonLink>
                        </div>
                    ) : null}
                    {recoverable ? (
                        <InterviewRecovery
                            key={recoverable.id}
                            attempt={recoverable}
                            locale={locale}
                            busy={engine.busy}
                            onSubmit={engine.submit}
                            onDismiss={dismissAttempt}
                        />
                    ) : null}
                    <div
                        hidden={
                            engine.busy || Boolean(recoverable) || !opening.done
                        }
                    >
                        <InterviewQuestionStage
                            busy={engine.busy}
                            session={session}
                            optionalAllowed={questions.optionalAllowed}
                            question={question}
                            onQuestion={questions.setQuestion}
                            onAnswer={questions.answer}
                            onSkip={questions.skip}
                            onReview={review}
                        />
                    </div>
                    <InterviewComposer
                        clearVersion={session.context.messages.length}
                        disabled={engine.busy}
                        busy={engine.busy}
                        canStop={engine.canStop}
                        locale={locale}
                        free={session.creditsBypass}
                        onSend={questions.send}
                        onStop={engine.stop}
                    />
                </main>
                <InterviewPreview
                    items={items}
                    pending={engine.proposal ? 1 : 0}
                    locale={locale}
                    expiresAt={session.expiresAt}
                    open={preview}
                    onClose={closePreview}
                    onReview={review}
                />
            </div>
            <ActionConsentDialog
                quote={engine.actionConsent.quote}
                onSend={engine.actionConsent.confirm}
                onClose={engine.actionConsent.cancel}
            />
            <InterviewCostNotice
                locale={locale}
                open={engine.notice}
                onClose={engine.cancelCost}
                onConfirm={engine.confirmCost}
            />
        </div>
    );
}
