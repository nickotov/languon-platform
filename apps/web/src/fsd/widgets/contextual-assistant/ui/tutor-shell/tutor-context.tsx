'use client';
import {
    BookA,
    ChevronDown,
    FileText,
    StickyNote,
    TriangleAlert,
} from 'lucide-react';
import { useId } from 'react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/fsd/shared/ui';
import { tutorShellCopy } from './shell-copy';
import styles from './tutor-shell.module.css';
export type TutorContextProps = {
    contextLabel?: string | undefined;
    sourceKind: 'dictionary' | 'text' | 'knowledge';
    useDraft: boolean;
    hasDraft: boolean;
    unavailable?: boolean | undefined;
    onUseDraft(value: boolean): void;
};
export function TutorContext({
    contextLabel,
    sourceKind,
    useDraft,
    hasDraft,
    unavailable,
    onUseDraft,
}: TutorContextProps) {
    const { locale } = useI18n();
    const copy = tutorShellCopy(locale);
    const existing = conversationCopy(locale);
    const id = useId();
    const SourceIcon = {
        dictionary: BookA,
        text: FileText,
        knowledge: StickyNote,
    }[sourceKind];
    const LabelIcon = unavailable ? TriangleAlert : SourceIcon;
    const label = unavailable
        ? copy.unavailable
        : (contextLabel ?? existing.source);
    const explanation = unavailable ? copy.unavailable : copy[sourceKind];
    const showDraft = hasDraft && !unavailable;
    function saved() {
        onUseDraft(false);
    }
    function draft() {
        onUseDraft(true);
    }
    return (
        <Popover>
            <PopoverTrigger
                className={styles.context}
                aria-label={copy.context}
            >
                <LabelIcon aria-hidden />
                <span className={styles.contextTitle}>{label}</span>
                {useDraft && showDraft && (
                    <span className={styles.draft}>{existing.draftLabel}</span>
                )}
                <ChevronDown aria-hidden />
            </PopoverTrigger>
            <PopoverContent align='start' className={styles.contextPopover}>
                <strong>{copy.context}</strong>
                {!unavailable && <p className={styles.sourceTitle}>{label}</p>}
                <p className={styles.contextDescription}>{explanation}</p>
                {showDraft && (
                    <fieldset className={styles.draftOptions}>
                        <legend>{copy.unsaved}</legend>
                        <label>
                            <input
                                type='radio'
                                name={id}
                                checked={!useDraft}
                                onChange={saved}
                            />
                            {copy.saved}
                        </label>
                        <label>
                            <input
                                type='radio'
                                name={id}
                                checked={useDraft}
                                onChange={draft}
                            />
                            {existing.draftContext}
                        </label>
                    </fieldset>
                )}
            </PopoverContent>
        </Popover>
    );
}
