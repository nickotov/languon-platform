import { BookOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Card,
    Empty,
    Select,
    Space,
    Statistic,
    Typography,
} from 'antd';
import { useState } from 'react';

import { useSentenceLibrary } from '../../hooks/use-sentence-library';
import { SentenceWorkspace } from './sentence-workspace';
import styles from './sentence-library-panel.module.css';

type Props = { userId: string; mutable: boolean };
export function SentenceLibraryPanel({ userId, mutable }: Props) {
    const t = useTranslate();
    const [active, setActive] = useState(false);
    const library = useSentenceLibrary(userId, active);
    const open = () => setActive(true);
    const options = library.dictionaries.map((dictionary) => ({
        value: dictionary.dictionaryId,
        label: `${dictionary.title} · ${dictionary.sourceLanguage.toUpperCase()} → ${dictionary.targetLanguage.toUpperCase()}`,
    }));
    const current = library.dictionaries.find(
        (dictionary) => dictionary.dictionaryId === library.dictionaryId,
    );
    const header = (
        <Space>
            <BookOutlined aria-hidden />
            <span>{t('sentences.title')}</span>
        </Space>
    );
    return (
        <Card className={styles.panel} title={header}>
            <div className={styles.intro}>
                <div>
                    <Typography.Title level={4}>
                        {t('sentences.heading')}
                    </Typography.Title>
                    <Typography.Paragraph type='secondary'>
                        {t('sentences.description')}
                    </Typography.Paragraph>
                </div>
                {current ? (
                    <div className={styles.stats}>
                        <Statistic
                            title={t('sentences.generated')}
                            value={current.generatedCount}
                        />
                        <Statistic
                            title={t('sentences.available')}
                            value={current.availableCount}
                        />
                    </div>
                ) : null}
            </div>
            {!active ? (
                <Button
                    icon={<BookOutlined aria-hidden />}
                    onClick={open}
                    type='primary'
                >
                    {t('sentences.manage')}
                </Button>
            ) : (
                <Space
                    direction='vertical'
                    size='large'
                    className={styles.full}
                >
                    {library.discoveryError ? (
                        <Alert
                            action={
                                <Button onClick={library.retryDiscovery}>
                                    {t('actions.retry')}
                                </Button>
                            }
                            message={library.discoveryError.message}
                            showIcon
                            type='error'
                        />
                    ) : null}
                    <div className={styles.dictionaryBar}>
                        <label className={styles.dictionary}>
                            {t('sentences.dictionary')}
                            <Select
                                aria-label={t('sentences.dictionary')}
                                loading={library.discoveryLoading}
                                onChange={library.chooseDictionary}
                                options={options}
                                optionFilterProp='label'
                                placeholder={t('sentences.chooseDictionary')}
                                showSearch
                                value={library.dictionaryId || null}
                            />
                        </label>
                        <Button
                            icon={<ReloadOutlined aria-hidden />}
                            loading={library.discoveryLoading}
                            onClick={library.retryDiscovery}
                        >
                            {t('actions.refresh')}
                        </Button>
                        {library.dictionaryCursor ? (
                            <Button
                                disabled={library.discoveryLoading}
                                onClick={library.loadMoreDictionaries}
                            >
                                {t('sentences.moreDictionaries')}
                            </Button>
                        ) : null}
                    </div>
                    {!library.discoveryLoading &&
                    !library.discoveryError &&
                    !library.dictionaries.length ? (
                        <Empty description={t('sentences.noDictionaries')} />
                    ) : null}
                    {library.dictionaryId ? (
                        <SentenceWorkspace
                            key={library.dictionaryId}
                            library={library}
                            mutable={mutable}
                            userId={userId}
                        />
                    ) : null}
                </Space>
            )}
        </Card>
    );
}
