import type { ReactNode } from 'react';
import { useCompanionLayout } from '@/fsd/shared/ui';
import styles from './knowledge-detail-page.module.css';

export function WorkspaceDocumentPane({ children }: { children: ReactNode }) {
    const placement = useCompanionLayout();
    return (
        <div
            className={styles.documentPane}
            data-workspace-document
            id={placement?.documentPanelId}
            role={placement?.mobile ? 'tabpanel' : undefined}
            aria-labelledby={
                placement?.mobile ? placement.documentTabId : undefined
            }
        >
            {children}
        </div>
    );
}
