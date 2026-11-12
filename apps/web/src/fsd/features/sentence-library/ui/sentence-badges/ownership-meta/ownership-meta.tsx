import componentStyles from '../../styles/sentence-badges-common.module.css';
import { UserIcon, UsersIcon } from 'lucide-react';
import { useInterfaceText } from '../../../hooks/use-interface-text';
import type { SavedSentence } from '../../../types';

export function OwnershipMeta({ sentence }: { sentence: SavedSentence }) {
    const { L, date } = useInterfaceText();
    const Icon = sentence.ownership === 'mine' ? UserIcon : UsersIcon;

    return (
        <span className={componentStyles.ownership}>
            <span>{L('savedOn', { date: date(sentence.createdAt) })}</span>
            <span aria-hidden>·</span>
            <span className={componentStyles.dictionaryLink}>
                <Icon aria-hidden className={componentStyles.icon} />
                {sentence.ownership === 'mine'
                    ? L('markerMine')
                    : L('markerShared')}
            </span>
        </span>
    );
}
