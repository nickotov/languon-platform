import { Check } from 'lucide-react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { ButtonLink } from '@/fsd/shared/ui';
import styles from './assistant-panel.module.css';

export function PublishedNoteNotice({
    note,
}: {
    note: { id: string; title: string };
}) {
    const { locale, href, t } = useI18n();
    const copy = conversationCopy(locale);
    const noteHref = href(`/knowledge/${note.id}`);
    return (
        <div className={styles.saved} role='status'>
            <Check size={16} aria-hidden />
            <span>
                {copy.saved}: {note.title}
            </span>
            <ButtonLink href={noteHref} variant='quiet' size='compact'>
                {t('knowledge.title')}
            </ButtonLink>
        </div>
    );
}
