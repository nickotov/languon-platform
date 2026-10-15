import { ArrowRight, Check, RefreshCw, ScanSearch, X } from 'lucide-react';
import { Button, Select, Switch } from '@/fsd/shared/ui';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';
export function WorkspaceLanguages({
    ws,
    match,
    onMatch,
}: {
    ws: TextWorkspace;
    match: boolean;
    onMatch(value: boolean): void;
}) {
    const { copy, locale } = useWorkspaceCopy();
    const options =
        ws.languages.data?.languages.map((language) => ({
            value: language.tag,
            label: language.displayNames[locale],
        })) ?? [];
    const sourceName =
        options.find((option) => option.value === ws.input.sourceLanguage)
            ?.label ?? ws.input.sourceLanguage;
    const targetName =
        options.find((option) => option.value === ws.input.targetLanguage)
            ?.label ?? ws.input.targetLanguage;
    function source(event: React.ChangeEvent<HTMLSelectElement>) {
        ws.setInput({ ...ws.input, sourceLanguage: event.target.value });
    }
    function target(event: React.ChangeEvent<HTMLSelectElement>) {
        ws.setInput({ ...ws.input, targetLanguage: event.target.value });
    }
    function detect() {
        void ws.detect();
    }
    function dismiss() {
        ws.setSuggestionDismissed(true);
    }
    function accept() {
        if (ws.detectionResult?.language)
            ws.setInput({
                ...ws.input,
                sourceLanguage: ws.detectionResult.language,
            });
    }
    const editable =
        ws.mode === 'compose' && !ws.proposal && !ws.translation.active;
    if (!editable)
        return (
            <div className={styles.languageSummary}>
                <span>
                    {sourceName} <ArrowRight aria-hidden /> {targetName}
                </span>
                {ws.mode !== 'edit' && (
                    <Switch
                        size='sm'
                        label={copy('match')}
                        checked={match}
                        onCheckedChange={onMatch}
                    />
                )}
            </div>
        );
    const suggestion = ws.detectionResult;
    const detectionFailed = Boolean(
        ws.detection.error || ws.detection.job?.state === 'failed',
    );
    return (
        <div className={styles.languages}>
            <div className={styles.languageFields}>
                <Select
                    disabled={ws.saving}
                    label={copy('sourceLanguage')}
                    placeholder={copy('choose')}
                    options={options}
                    value={ws.input.sourceLanguage}
                    onChange={source}
                />
                <div className={styles.detect}>
                    <Button
                        variant='secondary'
                        onClick={detect}
                        disabled={ws.saving || !ws.input.sourceText.trim()}
                        loading={ws.detection.active}
                        leadingIcon={<ScanSearch />}
                    >
                        {ws.detection.active
                            ? copy('detecting')
                            : copy('detect')}
                    </Button>
                </div>
                <ArrowRight className={styles.arrow} aria-hidden />
                <Select
                    disabled={ws.saving}
                    label={copy('targetLanguage')}
                    placeholder={copy('choose')}
                    options={options}
                    value={ws.input.targetLanguage}
                    onChange={target}
                />
            </div>
            {suggestion && (
                <div className={styles.suggestion} role='status'>
                    <span>
                        {copy('suggestion')}:{' '}
                        {
                            options.find(
                                (option) =>
                                    option.value === suggestion.language,
                            )?.label
                        }{' '}
                        {suggestion.confidence !== 'high' && copy('low')}
                    </span>
                    {suggestion.language && (
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={accept}
                            disabled={ws.saving}
                            leadingIcon={<Check />}
                        >
                            {copy('useLanguage')}
                        </Button>
                    )}
                    <Button
                        variant='ghost'
                        onClick={dismiss}
                        aria-label={copy('dismiss')}
                    >
                        <X />
                    </Button>
                </div>
            )}
            {detectionFailed && (
                <div role='alert'>
                    {copy('detectFailed')}
                    <Button
                        variant='ghost'
                        onClick={detect}
                        leadingIcon={<RefreshCw />}
                    >
                        {copy('retry')}
                    </Button>
                </div>
            )}
            <p className={styles.hint}>{copy('detectHint')}</p>
        </div>
    );
}
