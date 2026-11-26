'use client';

import { KnowledgeEmbedUrlSchema } from '@languon/contracts';
import { useState } from 'react';
import { EmbedCard } from './ui/embed-card/embed-card';
import { useI18n } from '@/fsd/shared/i18n';
import { embedLabels } from './embed-labels';
import styles from './knowledge-embed-common.module.css';

type EmbedProps = { type: 'websiteEmbed' | 'imageEmbed'; src: string };

export function KnowledgeEmbed({ type, src }: EmbedProps) {
    const parsed = KnowledgeEmbedUrlSchema.safeParse(src);
    if (!parsed.success) {
        return null;
    }

    // Consent to loading one remote resource must not carry over after an edit.
    return (
        <EmbedPreview key={type + parsed.data} type={type} src={parsed.data} />
    );
}

function EmbedPreview({ type, src }: EmbedProps) {
    const { locale } = useI18n();
    const copy = embedLabels[locale];
    const [failed, setFailed] = useState(false);
    const image = type === 'imageEmbed';
    const host = new URL(src).host;
    const title = `${image ? copy.image : copy.website} · ${host}`;

    function onImageError() {
        setFailed(true);
    }

    function media() {
        if (!image) {
            // Only the fixed app wrapper may execute its bootstrap. Its remote child has an empty sandbox.
            return (
                <iframe
                    className={styles.frame}
                    src={`/knowledge-website-preview.html#${encodeURIComponent(src)}`}
                    title={title}
                    sandbox='allow-scripts'
                    referrerPolicy='no-referrer'
                />
            );
        }

        if (failed) {
            return (
                <span role='status' className={styles.failure}>
                    {copy.failed}
                </span>
            );
        }

        // Load directly in the browser. A server-side image optimizer would fetch user URLs.
        return (
            <img
                alt={title}
                className={styles.image}
                onError={onImageError}
                referrerPolicy='no-referrer'
                src={src}
            />
        );
    }

    return (
        <EmbedCard type={type} title={title} src={src}>
            {media()}
        </EmbedCard>
    );
}
