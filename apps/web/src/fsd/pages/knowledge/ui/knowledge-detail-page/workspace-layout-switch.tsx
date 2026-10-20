import { useId, type MouseEvent, type KeyboardEvent } from 'react';
import { Columns2, FileText, MessagesSquare, Sparkles } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Tooltip, useCompanionLayout } from '@/fsd/shared/ui';
import styles from './workspace-controls.module.css';

type Mode = 'focus' | 'split' | 'chat';

export function WorkspaceLayoutSwitch() {
    const placement = useCompanionLayout();
    const { t } = useI18n();
    const id = useId();
    if (!placement?.workspace) return null;

    const options = [
        {
            mode: 'focus' as const,
            label: t('knowledge.layoutFocus'),
            hint: t('knowledge.layoutFocusHint'),
            Icon: FileText,
        },
        {
            mode: 'split' as const,
            label: t('knowledge.layoutSplit'),
            hint: t('knowledge.layoutSplitHint'),
            Icon: Columns2,
        },
        {
            mode: 'chat' as const,
            label: t('knowledge.layoutChat'),
            hint: t('knowledge.layoutChatHint'),
            Icon: MessagesSquare,
        },
    ];
    const enabled = options.filter(
        (option) => option.mode !== 'chat' || placement.allowChatLayout,
    );
    function select(event: MouseEvent<HTMLButtonElement>) {
        placement?.setMode(event.currentTarget.value as Mode);
    }
    function handleKey(event: KeyboardEvent<HTMLDivElement>) {
        if (
            !placement ||
            !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
        )
            return;
        event.preventDefault();
        const index = enabled.findIndex(
            (option) => option.mode === placement.mode,
        );
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
        let next =
            (index +
                ((event.key === 'ArrowRight') !== rtl ? 1 : -1) +
                enabled.length) %
            enabled.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = enabled.length - 1;
        const mode = enabled[next]?.mode;
        if (!mode) return;
        placement.setMode(mode);
        requestAnimationFrame(() =>
            document.getElementById(`${id}-${mode}`)?.focus(),
        );
    }
    function renderOption(option: (typeof options)[number]) {
        const selected = placement?.mode === option.mode;
        const disabled = option.mode === 'chat' && !placement?.allowChatLayout;
        const hint = `${option.label} — ${option.hint}`;
        return (
            <Tooltip key={option.mode} content={hint} placement='bottom'>
                <button
                    id={`${id}-${option.mode}`}
                    type='button'
                    role='radio'
                    data-workspace-layout-mode={option.mode}
                    aria-checked={selected}
                    aria-label={option.label}
                    disabled={disabled}
                    tabIndex={selected ? 0 : -1}
                    value={option.mode}
                    onClick={select}
                    className={styles.layoutOption}
                >
                    <option.Icon size={16} aria-hidden />
                </button>
            </Tooltip>
        );
    }
    return (
        <div
            role='radiogroup'
            aria-label={t('knowledge.layout')}
            onKeyDown={handleKey}
            className={styles.layoutSwitch}
        >
            {options.map(renderOption)}
        </div>
    );
}

export function WorkspaceMobileTabs() {
    const placement = useCompanionLayout();
    const { t } = useI18n();
    if (!placement?.workspace) return null;
    function selectDocument() {
        placement?.setMobileTab('document');
    }
    function selectTutor() {
        if (placement?.mode === 'focus') placement.setMode('split');
        placement?.setMobileTab('tutor');
    }
    function handleKey(event: KeyboardEvent<HTMLDivElement>) {
        if (
            !placement ||
            !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
        )
            return;
        event.preventDefault();
        let tab: 'document' | 'tutor' =
            placement.mobileTab === 'document' ? 'tutor' : 'document';
        if (event.key === 'Home') tab = 'document';
        if (event.key === 'End') tab = 'tutor';
        if (tab === 'tutor' && placement.mode === 'focus') {
            placement.setMode('split');
        }
        placement.setMobileTab(tab);
        requestAnimationFrame(() =>
            document
                .getElementById(
                    tab === 'document'
                        ? placement.documentTabId
                        : placement.tutorTabId,
                )
                ?.focus(),
        );
    }
    const documentSelected = placement.mobileTab === 'document';
    return (
        <div
            className={styles.mobileTabs}
            role='tablist'
            aria-label={t('knowledge.workspaceTabs')}
            onKeyDown={handleKey}
        >
            <button
                id={placement.documentTabId}
                type='button'
                role='tab'
                data-workspace-tab='document'
                aria-controls={placement.documentPanelId}
                aria-selected={documentSelected}
                tabIndex={documentSelected ? 0 : -1}
                onClick={selectDocument}
            >
                {t('knowledge.document')}
            </button>
            <button
                id={placement.tutorTabId}
                type='button'
                role='tab'
                data-workspace-tab='tutor'
                aria-controls={placement.companionId}
                aria-selected={!documentSelected}
                tabIndex={documentSelected ? -1 : 0}
                onClick={selectTutor}
            >
                <Sparkles size={16} aria-hidden />
                {t('knowledge.tutor')}
            </button>
        </div>
    );
}
