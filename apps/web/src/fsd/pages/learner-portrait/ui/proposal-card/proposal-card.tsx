import { useState } from 'react';
import { Check, Lightbulb, Pencil, X } from 'lucide-react';
import type { PortraitItems } from '@languon/contracts';
import {
    PortraitEditor,
    PortraitDetailsList,
} from '@/fsd/features/portrait-editor';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { portraitCopy } from '../../lib/copy';
import styles from './proposal-card.module.css';

export function ProposalCard({
    items,
    onAccept,
    onDismiss,
}: {
    items: PortraitItems;
    onAccept(items: PortraitItems): void;
    onDismiss(): void;
}) {
    const { locale } = useI18n();
    const [editing, setEditing] = useState(false);
    const [edited, setEdited] = useState(items);
    function edit() {
        setEditing(true);
    }
    function done() {
        setEditing(false);
    }
    function accept() {
        onAccept(edited);
    }
    return (
        <article className={styles.card}>
            <div className={styles.heading}>
                <Lightbulb aria-hidden size={16} />
                <span>{portraitCopy(locale, 'proposal')}</span>
                <span className={styles.badge}>
                    {portraitCopy(locale, 'notSaved')}
                </span>
            </div>
            <p className={styles.body}>
                {portraitCopy(locale, 'proposalBody')}
            </p>
            {editing ? (
                <PortraitEditor items={edited} onChange={setEdited} />
            ) : (
                <PortraitDetailsList items={edited} locale={locale} />
            )}
            <div className={styles.actions}>
                <Button
                    size='compact'
                    onClick={accept}
                    leadingIcon={<Check aria-hidden size={16} />}
                >
                    {portraitCopy(locale, 'add')}
                </Button>
                <Button
                    variant='secondary'
                    size='compact'
                    onClick={editing ? done : edit}
                    leadingIcon={<Pencil aria-hidden size={16} />}
                >
                    {portraitCopy(locale, 'edit')}
                </Button>
                <Button
                    variant='ghost'
                    size='compact'
                    onClick={onDismiss}
                    leadingIcon={<X aria-hidden size={16} />}
                >
                    {portraitCopy(locale, 'dismiss')}
                </Button>
            </div>
        </article>
    );
}
