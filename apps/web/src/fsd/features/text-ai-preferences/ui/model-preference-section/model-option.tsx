import type { TextAiModelSummary } from '@languon/contracts';
import { Badge } from '@/fsd/shared/ui';
import type { preferenceCopy } from '../../lib/copy';
import styles from './model-preference-section.module.css';

type Copy = ReturnType<typeof preferenceCopy>;
export function modelLabel(
    value: string | null,
    models: TextAiModelSummary[],
    copy: Copy,
): string {
    if (value === 'auto') return copy.auto;
    return (
        models.find((model) => model.id === value)?.label ??
        value ??
        copy.unknown
    );
}
export function ModelOption({
    value,
    group,
    model,
    checked,
    saved,
    disabled,
    unknown = false,
    context,
    copy,
    onSelect,
}: {
    value: string;
    group: string;
    model?: TextAiModelSummary | undefined;
    checked: boolean;
    saved: boolean;
    disabled: boolean;
    unknown?: boolean;
    context?: string | undefined;
    copy: Copy;
    onSelect(value: string): void;
}) {
    const unavailable =
        model !== undefined && model.availability !== 'available';
    const label = model?.label ?? copy.auto;
    const inputId = `${group}-${encodeURIComponent(value)}`;
    const detailId = `${inputId}-details`;
    let className = styles.option!;
    if (checked) className += ` ${styles.selected}`;
    if (unavailable) className += ` ${styles.unavailable}`;
    const tasks = model?.capabilities
        .map((capability) => {
            if (capability === 'structured-text') return copy.structured;
            if (capability === 'dictionary_generation') return copy.dictionary;
            if (capability === 'sentence_generation') return copy.sentences;
            if (capability === 'translation_check') return copy.checks;
            return capability;
        })
        .join(' · ');
    function select() {
        onSelect(value);
    }
    return (
        <label className={className} htmlFor={inputId}>
            <input
                aria-label={label}
                aria-describedby={detailId}
                checked={checked}
                disabled={disabled}
                id={inputId}
                name={group}
                onChange={select}
                type='radio'
                value={value}
            />
            <span className={styles.optionBody}>
                <span className={styles.optionHeading}>
                    <span>{label}</span>
                    {checked && !unavailable ? (
                        <Badge size='sm' tone='info'>
                            {copy.selected}
                        </Badge>
                    ) : null}
                    {saved ? <Badge size='sm'>{copy.saved}</Badge> : null}
                    {unavailable ? (
                        <Badge size='sm' tone='warning'>
                            {copy.unavailable}
                        </Badge>
                    ) : null}
                    {unknown ? <Badge size='sm'>{copy.unknown}</Badge> : null}
                </span>
                <span className={styles.details} id={detailId}>
                    {context ? <span>{context}</span> : null}
                    {!model ? <span>{copy.autoHelp}</span> : null}
                    {model ? (
                        <>
                            <span className={styles.capabilities}>
                                {copy.capabilities}:{' '}
                                {tasks || copy.noCapabilities}
                            </span>
                            <span className={styles.capabilities}>
                                {copy.inputRate}:{' '}
                                {model.creditRates.inputCreditsPerMillionTokens.toLocaleString()}{' '}
                                · {copy.outputRate}:{' '}
                                {model.creditRates.outputCreditsPerMillionTokens.toLocaleString()}
                            </span>
                        </>
                    ) : null}
                    {unavailable ? (
                        <span>
                            {model?.unavailableReason ?? copy.unavailable}
                        </span>
                    ) : null}
                </span>
            </span>
        </label>
    );
}
