'use client';
import type {
    PortraitInterviewCompletedOperation,
    PortraitItems,
    StartPortraitInterviewResponse,
} from '@languon/contracts';
import { UserMessage } from '@/fsd/shared/ui';
import { interviewText } from '../../lib/interview-copy';
import { InterviewMessage } from './interview-message';
import { InterviewProposal } from './interview-proposal';
import styles from './portrait-interview.module.css';
export function InterviewTranscript({
    session,
    opening,
    proposal,
    busy,
    onAccept,
    onDismiss,
    onReview,
}: {
    session: StartPortraitInterviewResponse;
    opening: { revealed: number; typing: boolean; done: boolean };
    proposal: PortraitInterviewCompletedOperation | null;
    busy: boolean;
    onAccept(items?: PortraitItems): void;
    onDismiss(): void;
    onReview(): void;
}) {
    const locale = session.context.locale;
    const latestUser = session.context.messages.at(-2);
    const sourceQuote =
        proposal?.id === session.latestCompletedOperation?.id &&
        latestUser?.role === 'user'
            ? latestUser.content
            : undefined;
    return (
        <div
            role='log'
            aria-live='polite'
            aria-label='Interview conversation'
            className={styles.transcript}
        >
            {session.context.messages.map((message, index) => (
                <div key={`${index}-${message.role}`}>
                    {message.role === 'user' ? (
                        <div role='list'>
                            <UserMessage text={message.content} />
                        </div>
                    ) : (
                        <InterviewMessage
                            locale={locale}
                            message={message.content}
                        />
                    )}
                </div>
            ))}
            {session.context.messages.length === 0 && opening.revealed >= 1 ? (
                <InterviewMessage
                    locale={locale}
                    message={interviewText(
                        locale,
                        session.context.approvedItems
                            ? 'updateGreeting'
                            : 'greeting',
                    )}
                />
            ) : null}
            {session.context.messages.length === 0 &&
            !session.context.approvedItems &&
            opening.revealed >= 2 ? (
                <InterviewMessage
                    locale={locale}
                    message={session.initialQuestion.message}
                />
            ) : null}
            {opening.typing && !busy ? (
                <InterviewMessage locale={locale} typing />
            ) : null}
            {proposal ? (
                <InterviewProposal
                    key={proposal.id}
                    proposal={proposal}
                    previousItems={
                        session.context.draftItems ??
                        session.context.approvedItems
                    }
                    sourceQuote={sourceQuote}
                    locale={locale}
                    busy={busy}
                    onAccept={onAccept}
                    onDismiss={onDismiss}
                    onReview={onReview}
                />
            ) : null}
            {busy ? (
                <div className={styles.generating}>
                    <InterviewMessage locale={locale} typing />
                    <p className={styles.meta}>
                        {interviewText(locale, 'pinnedPolicy')}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
