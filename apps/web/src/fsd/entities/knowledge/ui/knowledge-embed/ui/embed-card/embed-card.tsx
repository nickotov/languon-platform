'use client';

import { ExternalLink, ImageIcon, Globe, Maximize2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog } from '@/fsd/shared/ui';
import { embedLabels } from '../../embed-labels';
import styles from '../../knowledge-embed-common.module.css';

export function EmbedCard({
    type,
    title,
    src,
    children,
}: {
    type: 'websiteEmbed' | 'imageEmbed';
    title: string;
    src: string;
    children: ReactNode;
}) {
    const { locale } = useI18n();
    const copy = embedLabels[locale];
    const [loaded, setLoaded] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const KindIcon = type === 'imageEmbed' ? ImageIcon : Globe;

    function load() {
        setLoaded(true);
    }

    function expand() {
        setExpanded(true);
    }

    function close() {
        setExpanded(false);
    }

    const sourceLink = (
        <a
            className={styles.link}
            href={src}
            rel='noopener noreferrer'
            target='_blank'
        >
            {copy.source}
            <ExternalLink aria-hidden size={14} />
        </a>
    );

    return (
        <figure className={styles.card} data-block-family='embed'>
            <figcaption className={styles.caption}>
                <span className={styles.name}>
                    <KindIcon aria-hidden size={18} />
                    {title}
                </span>
                {sourceLink}
                {loaded ? (
                    <Button
                        type='button'
                        aria-haspopup='dialog'
                        onClick={expand}
                        size='compact'
                        variant='secondary'
                        leadingIcon={<Maximize2 aria-hidden size={15} />}
                    >
                        {copy.expand}
                    </Button>
                ) : (
                    <Button
                        type='button'
                        onClick={load}
                        size='compact'
                        variant='secondary'
                    >
                        {copy.load}
                    </Button>
                )}
            </figcaption>
            {loaded && (
                <div className={styles.inline}>{!expanded && children}</div>
            )}
            <Dialog
                className={styles.expanded}
                bodyClassName={styles.dialogBody}
                titleClassName={styles.dialogTitle}
                title={title}
                closeLabel={copy.close}
                open={expanded}
                onClose={close}
                footer={sourceLink}
            >
                {expanded && children}
            </Dialog>
        </figure>
    );
}
