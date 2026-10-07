import type { AdminSentenceLibraryFilters } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Input, Select } from 'antd';
import { useState } from 'react';

import styles from './sentence-library-panel.module.css';

type Props = {
    value: AdminSentenceLibraryFilters;
    disabled?: boolean;
    onChange(value: AdminSentenceLibraryFilters): void;
};

export function SentenceFilters({ value, onChange, disabled = false }: Props) {
    const t = useTranslate();
    const [creator, setCreator] = useState(value.creatorId ?? '');
    const [creatorError, setCreatorError] = useState(false);
    const archiveOptions = ['all', 'active', 'archived'].map((option) => ({
        value: option,
        label: t(`sentences.${option}`),
    }));
    const relationOptions = ['all', 'available', 'generated'].map((option) => ({
        value: option,
        label: t(`sentences.${option}`),
    }));
    const currentOptions = ['all', 'current', 'outdated'].map((option) => ({
        value: option,
        label: t(`sentences.${option}`),
    }));
    const directionOptions = [
        { value: 'all', label: t('sentences.all') },
        { value: 'source-to-target', label: t('sentences.sourceToTarget') },
        { value: 'target-to-source', label: t('sentences.targetToSource') },
    ];
    const creatorOptions = [
        { value: 'all', label: t('sentences.all') },
        { value: 'true', label: t('sentences.archived') },
        { value: 'false', label: t('sentences.active') },
    ];
    const changePersonal = (
        personalArchive: AdminSentenceLibraryFilters['personalArchive'],
    ) => onChange({ ...value, personalArchive });
    const changeGlobal = (
        globalArchive: AdminSentenceLibraryFilters['globalArchive'],
    ) => onChange({ ...value, globalArchive });
    const changeRelation = (
        relation: AdminSentenceLibraryFilters['relation'],
    ) => onChange({ ...value, relation });
    const changeCurrent = (
        contentState: AdminSentenceLibraryFilters['contentState'],
    ) => onChange({ ...value, contentState });
    const changeDirection = (direction: string) => {
        const { direction: _previous, ...rest } = value;
        if (direction === 'all') onChange(rest);
        else
            onChange({
                ...rest,
                direction: direction as 'source-to-target' | 'target-to-source',
            });
    };
    const changeCreatorArchived = (next: string) => {
        const { creatorArchived: _previous, ...rest } = value;
        if (next === 'all') onChange(rest);
        else onChange({ ...rest, creatorArchived: next === 'true' });
    };
    const changeCreator = (event: React.ChangeEvent<HTMLInputElement>) => {
        setCreator(event.target.value);
        setCreatorError(false);
    };
    const applyCreator = () => {
        const trimmed = creator.trim();
        if (
            trimmed &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                trimmed,
            )
        ) {
            setCreatorError(true);
            return;
        }
        const { creatorId: _previous, ...rest } = value;
        onChange(trimmed ? { ...rest, creatorId: trimmed } : rest);
    };
    const creatorArchivedValue =
        value.creatorArchived === undefined
            ? 'all'
            : String(value.creatorArchived);
    return (
        <div className={styles.filters}>
            <label>
                {t('sentences.relation')}
                <Select
                    disabled={disabled}
                    aria-label={t('sentences.relation')}
                    onChange={changeRelation}
                    options={relationOptions}
                    value={value.relation}
                />
            </label>
            <label>
                {t('sentences.direction')}
                <Select
                    disabled={disabled}
                    aria-label={t('sentences.direction')}
                    onChange={changeDirection}
                    options={directionOptions}
                    value={value.direction ?? 'all'}
                />
            </label>
            <label>
                {t('sentences.personal')}
                <Select
                    disabled={disabled}
                    aria-label={t('sentences.personal')}
                    onChange={changePersonal}
                    options={archiveOptions}
                    value={value.personalArchive}
                />
            </label>
            <label>
                {t('sentences.global')}
                <Select
                    disabled={disabled}
                    aria-label={t('sentences.global')}
                    onChange={changeGlobal}
                    options={archiveOptions}
                    value={value.globalArchive}
                />
            </label>
            <label>
                {t('sentences.contentState')}
                <Select
                    disabled={disabled}
                    aria-label={t('sentences.contentState')}
                    onChange={changeCurrent}
                    options={currentOptions}
                    value={value.contentState}
                />
            </label>
            <label>
                {t('sentences.creatorArchived')}
                <Select
                    disabled={disabled}
                    aria-label={t('sentences.creatorArchived')}
                    onChange={changeCreatorArchived}
                    options={creatorOptions}
                    value={creatorArchivedValue}
                />
            </label>
            <label className={styles.creator}>
                {t('sentences.creatorId')}
                <Input.Search
                    disabled={disabled}
                    aria-label={t('sentences.creatorId')}
                    onChange={changeCreator}
                    onSearch={applyCreator}
                    status={creatorError ? 'error' : ''}
                    value={creator}
                    allowClear
                />
                {creatorError ? (
                    <span role='alert'>{t('sentences.invalidCreator')}</span>
                ) : null}
            </label>
        </div>
    );
}
