'use client';
import {
    ArchiveIcon,
    FilePenLineIcon,
    CheckIcon,
    PencilLineIcon,
} from 'lucide-react';
import { useI18n, type MessageKey } from '@/fsd/shared/i18n';
import { Badge } from '@/fsd/shared/ui';
export function TextStatusBadge({
    status,
    lifecycle,
}: {
    status: 'draft' | 'translated' | 'edited';
    lifecycle?: 'active' | 'archived' | undefined;
}) {
    const { t } = useI18n();
    const archived = lifecycle === 'archived';
    let Icon;
    let labelKey: MessageKey;
    let tone: 'neutral' | 'warning' | 'success';

    if (archived) {
        Icon = ArchiveIcon;
        labelKey = 'texts.manage.archived';
        tone = 'neutral';
    } else if (status === 'draft') {
        Icon = FilePenLineIcon;
        labelKey = 'texts.manage.draft';
        tone = 'neutral';
    } else if (status === 'edited') {
        Icon = PencilLineIcon;
        labelKey = 'texts.manage.edited';
        tone = 'warning';
    } else {
        Icon = CheckIcon;
        labelKey = 'texts.manage.translated';
        tone = 'success';
    }

    const text = t(labelKey);

    return (
        <Badge size='sm' tone={tone} icon={<Icon size={14} />}>
            {text}
        </Badge>
    );
}
