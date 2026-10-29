import { useState, type ChangeEvent } from 'react';
import type { LearningBlock } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button/button';
import type {
    LearningBlockLabels,
    LearningBlockPlayback,
    LearningBlockVariant,
    LearningPrivateStudy,
} from '../../types';
import { BlockPlayButton } from '../block-play-button/block-play-button';
import styles from './bilingual-block.module.css';
import { PrivateStudyPanel } from './private-study-panel';
import { BilingualPreview } from './bilingual-preview';

type Bilingual = Extract<LearningBlock, { type: 'bilingual-text' }>;
interface BilingualProps {
    block: Pick<Bilingual, 'language' | 'segments' | 'translations'> & {
        id?: string;
    };
    labels: LearningBlockLabels;
    variant?: LearningBlockVariant | undefined;
    scope?: string | undefined;
    playback?: LearningBlockPlayback | undefined;
    privateStudy?: LearningPrivateStudy | undefined;
}
export function BilingualBlock({
    block,
    labels,
    variant,
    scope,
    playback,
    privateStudy,
}: BilingualProps) {
    const [bilingual, setBilingual] = useState(
        variant !== undefined &&
            (block.translations.length > 0 || privateStudy !== undefined),
    );
    const [language, setLanguage] = useState(
        block.translations[0]?.language ??
            privateStudy?.targets[0]?.language ??
            '',
    );
    const privateSelected =
        privateStudy?.targets.some((target) => target.language === language) ??
        false;
    const availableTranslations = privateSelected
        ? (privateStudy?.overlays ?? [])
        : block.translations;
    const translation = availableTranslations.find(
        (item) => item.language === language,
    );
    const translations = new Map(
        translation?.segments.map((item) => [item.sourceSegmentId, item.text]),
    );
    function handleOriginal() {
        setBilingual(false);
        privateStudy?.onViewChange?.(undefined);
    }
    function handleBilingual() {
        setBilingual(true);
        privateStudy?.onViewChange?.(privateSelected ? language : undefined);
    }
    function handleLanguage(event: ChangeEvent<HTMLSelectElement>) {
        const value = event.target.value;
        setLanguage(value);
        const personal =
            privateStudy?.targets.some((target) => target.language === value) ??
            false;
        if (personal) privateStudy?.onSelectLanguage(value);
        privateStudy?.onViewChange?.(personal ? value : undefined);
    }
    const hasTranslations =
        block.translations.length > 0 || Boolean(privateStudy?.targets.length);
    const showTranslation = bilingual && translation !== undefined;
    const preview = variant === 'compact' || variant === 'review';
    const compact = variant === 'compact';
    const blockId = block.id ?? scope ?? block.segments[0]?.id ?? '';
    const originalRequest = {
        id: `${scope ?? blockId}:all`,
        blockId,
        text: block.segments.map((s) => s.text).join('\n\n'),
        language: block.language,
    };
    const originalClass = bilingual ? styles.segment : styles.selectedSegment;
    const bilingualClass = bilingual ? styles.selectedSegment : styles.segment;
    const showLanguage =
        hasTranslations && (bilingual || variant === undefined);
    function removePrivateView() {
        setBilingual(false);
        privateStudy?.onViewChange?.(undefined);
    }
    const rowPrivate = showTranslation && privateSelected;
    const translationClass = rowPrivate
        ? styles.privateTranslation
        : styles.translation;
    if (preview)
        return (
            <BilingualPreview block={block} labels={labels} compact={compact} />
        );
    return (
        <div className={styles.root}>
            <div className={styles.controls}>
                <div
                    className={styles.segments}
                    role='group'
                    aria-label={labels.bilingual}
                >
                    <Button
                        className={originalClass}
                        size='compact'
                        variant='ghost'
                        aria-pressed={!bilingual}
                        onClick={handleOriginal}
                    >
                        {labels.original}
                    </Button>
                    <Button
                        className={bilingualClass}
                        size='compact'
                        variant='ghost'
                        aria-pressed={bilingual}
                        disabled={!hasTranslations}
                        onClick={handleBilingual}
                    >
                        {labels.bilingual}
                    </Button>
                </div>
                {showLanguage ? (
                    <label className={styles.language}>
                        {labels.translationLanguage}
                        <select
                            aria-label={labels.translationLanguage}
                            className={styles.select}
                            value={language}
                            onChange={handleLanguage}
                        >
                            {block.translations.map((item) => (
                                <option
                                    key={item.language}
                                    value={item.language}
                                >
                                    {privateStudy?.languageNames?.[
                                        item.language
                                    ] ?? item.language}
                                </option>
                            ))}
                            {privateStudy?.targets.map((target) => (
                                <option
                                    key={target.language}
                                    value={target.language}
                                >
                                    {target.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
                <span className={styles.spacer} />
                <BlockPlayButton
                    request={originalRequest}
                    playback={playback}
                    labels={labels}
                />
            </div>
            {bilingual && privateSelected && privateStudy ? (
                <PrivateStudyPanel
                    study={privateStudy}
                    ready={translation !== undefined}
                    language={language}
                    onRemove={removePrivateView}
                />
            ) : null}
            <ol className={styles.list}>
                {block.segments.map((segment) => {
                    const request = {
                        id: `${scope ?? blockId}:${segment.id}`,
                        blockId,
                        text: segment.text,
                        language: block.language,
                    };
                    const className = showTranslation
                        ? styles.pair
                        : styles.single;
                    return (
                        <li className={className} key={segment.id}>
                            <div className={styles.source}>
                                <p lang={block.language} dir='auto'>
                                    {segment.text}
                                </p>
                                <BlockPlayButton
                                    request={request}
                                    playback={playback}
                                    labels={labels}
                                />
                            </div>
                            {showTranslation ? (
                                <p
                                    className={translationClass}
                                    lang={language}
                                    dir='auto'
                                >
                                    {translations.get(segment.id)}
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
