import { GraduationCap } from 'lucide-react';
import { interviewText, type InterviewLocale } from '../../lib/interview-copy';
import styles from './portrait-interview.module.css';

/** Source transcript timestamps are omitted: the durable API does not expose message times. */
export function InterviewMessage({
    message,
    typing = false,
    locale,
}: {
    message?: string;
    typing?: boolean;
    locale: InterviewLocale;
}) {
    const name = interviewText(locale, 'interviewer');
    return (
        <article className={styles.interviewerMessage} aria-label={name}>
            <span className={styles.interviewerAvatar} aria-hidden>
                <GraduationCap />
            </span>
            <div className={styles.interviewerColumn}>
                <div className={styles.interviewerMeta}>
                    <span>{name}</span>
                </div>
                <div className={styles.interviewerBubble}>
                    {typing ? (
                        <span
                            className={styles.interviewerTyping}
                            role='status'
                            aria-label={interviewText(
                                locale,
                                'interviewerTyping',
                            )}
                        >
                            <i />
                            <i />
                            <i />
                        </span>
                    ) : (
                        <p>{message}</p>
                    )}
                </div>
            </div>
        </article>
    );
}
