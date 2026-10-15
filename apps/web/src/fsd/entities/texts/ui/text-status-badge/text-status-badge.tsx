'use client';
import {
    ArchiveIcon,
    FilePenLineIcon,
    CheckIcon,
    PencilLineIcon,
} from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
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
    const Icon = archived
        ? ArchiveIcon
        : status === 'draft'
          ? FilePenLineIcon
          : status === 'edited'
            ? PencilLineIcon
            : CheckIcon;
    const text = archived
        ? t('texts.manage.archived')
        : status === 'draft'
          ? t('texts.manage.draft')
          : status === 'edited'
            ? t('texts.manage.edited')
            : t('texts.manage.translated');
    return (
        <Badge
            size='sm'
            tone={
                archived || status === 'draft'
                    ? 'neutral'
                    : status === 'edited'
                      ? 'warning'
                      : 'success'
            }
            icon={<Icon size={14} />}
        >
            {text}
        </Badge>
    );
}
