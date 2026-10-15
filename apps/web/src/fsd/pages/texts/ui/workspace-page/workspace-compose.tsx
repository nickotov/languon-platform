import { useEffect, useState } from 'react';
import { Languages, AlertCircle, WandSparkles } from 'lucide-react';
import { Button, Input, Textarea, Tabs } from '@/fsd/shared/ui';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
import {
    sourceCodePoints,
    WORKSPACE_SOURCE_LIMIT,
} from '../../lib/workspace-content';
import { WorkspaceBanners } from './workspace-banners';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';
export function WorkspaceCompose({ ws }: { ws: TextWorkspace }) {
    const { copy } = useWorkspaceCopy();
    const count = sourceCodePoints(ws.input.sourceText);
    const over = count > WORKSPACE_SOURCE_LIMIT;
    const locked = ws.translation.active || ws.saving;
    const [tab, setTab] = useState('source');
    useEffect(() => {
        if (ws.translation.active) setTab('translation');
    }, [ws.translation.active]);
    const tabItems = [
        { value: 'source', label: copy('source') },
        { value: 'translation', label: copy('translation') },
    ];

    function title(event: React.ChangeEvent<HTMLInputElement>) {
        ws.setInput({ ...ws.input, title: event.target.value });
    }
    function source(event: React.ChangeEvent<HTMLTextAreaElement>) {
        ws.setInput({ ...ws.input, sourceText: event.target.value });
    }
    function sample() {
        ws.setInput({
            ...ws.input,
            sourceText:
                'A quiet morning\n\nThe city was still asleep when I opened the window. A small bird was singing in the garden.',
        });
    }
    function shorten() {
        setTab('source');
        ws.shortenSource();
    }
    function translate() {
        void ws.translate();
    }
    return (
        <div className={styles.scroll}>
            <div className={styles.composeTabs}>
                <Tabs
                    aria-label={copy('translation')}
                    variant='segmented'
                    size='sm'
                    fullWidth
                    value={tab}
                    onValueChange={setTab}
                    items={tabItems}
                />
            </div>
            <div className={styles.compose} data-tab={tab}>
                <section className={styles.sourcePane}>
                    <Input
                        label={copy('title')}
                        value={ws.input.title}
                        maxLength={160}
                        disabled={locked}
                        placeholder={copy('optional')}
                        hint={copy('titleHint')}
                        onChange={title}
                    />
                    <Textarea
                        data-workspace-source
                        label={copy('source')}
                        rows={16}
                        resize='vertical'
                        disabled={locked}
                        lang={ws.input.sourceLanguage || undefined}
                        placeholder={copy('placeholder')}
                        value={ws.input.sourceText}
                        onChange={source}
                        {...(over ? { error: copy('invalid') } : {})}
                    />
                    <div className={styles.counterRow}>
                        {!ws.input.sourceText && !locked ? (
                            <Button variant='ghost' onClick={sample}>
                                {copy('sample')}
                            </Button>
                        ) : (
                            <span />
                        )}
                        <span
                            className={over ? styles.error : styles.hint}
                            aria-live='polite'
                        >
                            {over && <AlertCircle />}
                            {count.toLocaleString()} / 20,000{' '}
                            {copy('characters')}
                        </span>
                    </div>
                </section>
                <section className={styles.translationPane}>
                    <WorkspaceBanners ws={ws} onShorten={shorten} />
                    {!locked && (
                        <div className={styles.translationEmpty}>
                            <Languages />
                            <h2>{copy('translation')}</h2>
                            <p>{copy('translationHint')}</p>
                            <div className={styles.mobileOnly}>
                                <Button
                                    onClick={translate}
                                    leadingIcon={<WandSparkles />}
                                >
                                    {copy('translate')}
                                </Button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
