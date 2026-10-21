'use client';
import { useState, type ChangeEvent } from 'react';
import {
    portraitCharacterCount,
    type PortraitInterviewCompletedOperation,
    type PortraitItems,
} from '@languon/contracts';
import { Button, Textarea } from '@/fsd/shared/ui';
import {
    PortraitSummaryPanel,
    PortraitEditor,
} from '@/fsd/features/portrait-editor';
import { Lightbulb, Check, Pencil, X } from 'lucide-react';
import { interviewText, type InterviewLocale } from '../../lib/interview-copy';
import styles from './portrait-interview.module.css';
export function InterviewProposal({
    proposal,
    locale,
    busy,
    previousItems,
    sourceQuote,
    onAccept,
    onDismiss,
    onReview,
}: {
    proposal: PortraitInterviewCompletedOperation;
    locale: InterviewLocale;
    busy: boolean;
    previousItems: PortraitItems | null;
    sourceQuote?: string | undefined;
    onAccept(items?: PortraitItems): void;
    onDismiss(): void;
    onReview(): void;
}) {
    const [editing, setEditing] = useState(false);
    const [items, setItems] = useState(proposal.result.proposedItems);
    const notes =
        items?.notes?.filter(
            (note) => !previousItems?.notes?.some((old) => old.id === note.id),
        ) ?? [];
    const singleNote = notes.length === 1 ? notes[0] : undefined;
    const summary = singleNote?.text ?? proposal.result.answerSummary;
    const count = portraitCharacterCount(singleNote?.text ?? '');
    const over = count > 200;
    function edit() {
        setEditing((value) => !value);
    }
    function editNote(event: ChangeEvent<HTMLTextAreaElement>) {
        const text = event.target.value;
        setItems((previous) =>
            previous && singleNote
                ? {
                      ...previous,
                      notes: (previous.notes ?? []).map((note) =>
                          note.id === singleNote.id ? { ...note, text } : note,
                      ),
                  }
                : previous,
        );
    }
    function accept() {
        if (items && !over) onAccept(items);
    }
    if (!items) return null;
    return (
        <article
            className={styles.proposal}
            aria-label={interviewText(locale, 'proposal')}
        >
            <p className={styles.proposalTitle}>
                <Lightbulb size={16} />
                {interviewText(locale, 'proposal')} ·{' '}
                {interviewText(locale, proposal.result.topic)}
            </p>
            {editing && singleNote ? (
                <div>
                    <Textarea
                        label={interviewText(locale, 'edit')}
                        value={singleNote.text}
                        onChange={editNote}
                        rows={3}
                        aria-invalid={over}
                    />
                    <p className={over ? styles.limitError : styles.meta}>
                        {count}/200
                    </p>
                </div>
            ) : null}
            {!editing && summary ? (
                <p className={styles.proposalText}>{summary}</p>
            ) : null}
            {sourceQuote ? (
                <p className={styles.meta}>
                    {interviewText(locale, 'sourceQuote')} “{sourceQuote}”
                </p>
            ) : null}
            {editing && !singleNote ? (
                <PortraitEditor
                    items={items}
                    onChange={setItems}
                    locale={locale}
                />
            ) : (
                <details className={styles.proposalDetails}>
                    <summary>
                        {interviewText(locale, 'proposedDetails')}
                    </summary>
                    <PortraitSummaryPanel locale={locale} items={items} />
                </details>
            )}
            {proposal.stale ? (
                <p className={styles.limitError}>
                    {interviewText(locale, 'staleProposal')}
                </p>
            ) : null}
            <div className={styles.proposalActions}>
                <Button
                    size='compact'
                    leadingIcon={<Check size={16} />}
                    onClick={accept}
                    disabled={busy || proposal.stale || over}
                >
                    {interviewText(locale, 'add')}
                </Button>
                <Button
                    size='compact'
                    variant='secondary'
                    leadingIcon={<Pencil size={16} />}
                    onClick={edit}
                >
                    {interviewText(locale, editing ? 'finishEditing' : 'edit')}
                </Button>
                <Button
                    size='compact'
                    variant='ghost'
                    leadingIcon={<X size={16} />}
                    onClick={onDismiss}
                >
                    {interviewText(locale, 'dismiss')}
                </Button>
            </div>
            {proposal.stale ? (
                <Button size='compact' variant='secondary' onClick={onReview}>
                    {interviewText(locale, 'review')}
                </Button>
            ) : null}
        </article>
    );
}
