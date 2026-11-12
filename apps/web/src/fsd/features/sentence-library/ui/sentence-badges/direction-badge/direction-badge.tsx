import componentStyles from '../../styles/sentence-badges-common.module.css';
import { ArrowRightIcon } from 'lucide-react';
import { Badge } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../../hooks/use-interface-text';

type LanguageCode = string;

/** Explicit direction: short codes visually, the full language pair for assistive tech. */
export function DirectionBadge({
    from,
    to,
}: {
    from: LanguageCode;
    to: LanguageCode;
}) {
    const { direction } = useInterfaceText();
    const label = direction(from, to);

    return (
        <Badge
            size='sm'
            tone='info'
            title={label}
            aria-label={label}
            className={componentStyles.statusBadge}
        >
            <span aria-hidden className={componentStyles.direction}>
                {from}
                <ArrowRightIcon className={componentStyles.arrow} />
                {to}
            </span>
        </Badge>
    );
}
