import { Plus } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Menu } from '@/fsd/shared/ui';
import { navigationSections } from '../../lib/navigation-sections';
import { useShellNavigation } from '../../model/navigation-context';
import styles from './create-menu.module.css';
export function CreateMenu({
    rail = false,
    touch = false,
}: {
    rail?: boolean;
    touch?: boolean;
}) {
    const { t } = useI18n();
    const { create, creating } = useShellNavigation();
    const items = navigationSections.map((section) => ({
        label: t(section.createLabel),
        icon: <section.icon size={16} strokeWidth={1.75} />,
        onSelect: () => create(section.kind),
        disabled: creating,
    }));
    const className = [
        styles.trigger,
        rail ? styles.rail : '',
        touch ? styles.touch : '',
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <Menu
            heading={t('shell.createAction')}
            iconOnly
            showTooltip={rail}
            tooltipPlacement='right'
            items={items}
            label={t('shell.create')}
            trigger={<Plus size={16} />}
            triggerClassName={className}
        />
    );
}
