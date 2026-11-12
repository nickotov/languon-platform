import { type KeyboardEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { useCompanionLayout } from '@/fsd/shared/ui';
import styles from '../../../../../styles/knowledge-detail-page-workspace-controls-common.module.css';

export function WorkspaceMobileTabs() {
    const placement = useCompanionLayout();
    const { t } = useI18n();
    if (!placement?.workspace) {
        return null;
    }

    function selectDocument() {
        placement?.setMobileTab('document');
    }

    function selectTutor() {
        if (placement?.mode === 'focus') {
            placement.setMode('split');
        }

        placement?.setMobileTab('tutor');
    }

    function handleKey(event: KeyboardEvent<HTMLDivElement>) {
        if (
            !placement ||
            !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
        ) {
            return;
        }

        event.preventDefault();
        let tab: 'document' | 'tutor' =
            placement.mobileTab === 'document' ? 'tutor' : 'document';

        if (event.key === 'Home') {
            tab = 'document';
        }

        if (event.key === 'End') {
            tab = 'tutor';
        }

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
