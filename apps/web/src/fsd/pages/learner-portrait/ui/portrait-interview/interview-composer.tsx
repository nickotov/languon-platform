'use client';
import {
    useEffect,
    useId,
    useRef,
    useState,
    type FormEvent,
    type ChangeEvent,
    type KeyboardEvent,
} from 'react';
import { portraitCharacterCount } from '@languon/contracts';
import { Send } from 'lucide-react';
import { IconButton, Textarea } from '@/fsd/shared/ui';
import { interviewText, type InterviewLocale } from '../../lib/interview-copy';
import styles from './portrait-interview.module.css';
export function InterviewComposer({
    clearVersion = 0,
    disabled,
    locale,
    free,
    onSend,
}: {
    clearVersion?: number;
    disabled: boolean;
    locale: InterviewLocale;
    free: boolean;
    onSend(text: string): Promise<boolean>;
}) {
    const [text, setText] = useState('');
    const previousVersion = useRef(clearVersion);
    useEffect(() => {
        if (previousVersion.current !== clearVersion) setText('');
        previousVersion.current = clearVersion;
    }, [clearVersion]);
    const counterId = useId();
    const count = portraitCharacterCount(text);
    const over = count > 1000;
    const sendDisabled = disabled || over || !text.trim();
    function changeText(event: ChangeEvent<HTMLTextAreaElement>) {
        setText(event.target.value);
    }
    async function send() {
        if (sendDisabled) return;
        await onSend(text.trim());
    }
    async function submit(event: FormEvent) {
        event.preventDefault();
        await send();
    }
    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void send();
        }
    }
    const counter = `${count.toLocaleString(locale)}/${(1000).toLocaleString(locale)} ${interviewText(locale, 'characters')}`;
    const cost = interviewText(locale, free ? 'composerFree' : 'composerPaid');
    return (
        <form
            onSubmit={submit}
            className={styles.composer}
            aria-label='Message the interviewer'
        >
            <div className={styles.composerField}>
                <Textarea
                    aria-label={interviewText(locale, 'chat')}
                    placeholder={interviewText(locale, 'chat')}
                    value={text}
                    onChange={changeText}
                    rows={3}
                    aria-invalid={over}
                    aria-describedby={counterId}
                    onKeyDown={handleKeyDown}
                    resize='none'
                />
                <IconButton
                    type='submit'
                    icon={<Send />}
                    label={interviewText(locale, 'send')}
                    variant='primary'
                    rounded
                    disabled={sendDisabled}
                    className={styles.send}
                />
            </div>
            <p
                id={counterId}
                className={over ? styles.limitError : styles.meta}
                aria-live={over ? 'polite' : 'off'}
            >
                {counter} · {cost}
            </p>
        </form>
    );
}
