import { Cpu, ChevronDown } from 'lucide-react';
import type { TextAiModelSummary } from '@languon/contracts';
import {
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import {
    useModelPreference,
    preferenceCopy,
} from '@/fsd/features/text-ai-preferences';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    ButtonLink,
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverItem,
    PopoverSeparator,
    PopoverTrigger,
} from '@/fsd/shared/ui';
import { composerCopy } from './composer-copy';
import styles from './composer.module.css';

export function ConversationModel({
    request,
    embedded = false,
}: {
    actorId: string;
    request: ConversationSessionRequest;
    embedded?: boolean;
}) {
    const { locale, href } = useI18n();
    const copy = conversationCopy(locale);
    const preference = preferenceCopy(locale);
    const text = composerCopy(locale);
    const controller = useModelPreference(request);
    const { base, draft, catalog, pref, saveState } = controller;
    let label = copy.loading;
    if (pref.isError) label = copy.error;
    if (base?.mode === 'auto') label = text.auto;
    if (base?.mode === 'explicit')
        label = base.selectedModel?.label ?? base.modelId ?? copy.error;
    const accessible = `${copy.model}: ${label}`;
    const models = catalog.data?.models ?? [];
    const saving = saveState === 'saving';
    const failed = ['error', 'rejected'].includes(saveState);
    const profileLink = href('/profile');
    function selectAuto() {
        void controller.save(false, 'auto');
    }
    function save() {
        void controller.save();
    }
    function selectModel(value: string) {
        void controller.save(false, value);
    }
    function retry() {
        void pref.refetch();
        void catalog.refetch();
    }
    function useLatest() {
        controller.useLatest();
    }
    const content = (
        <>
            <PopoverHeader>{copy.model}</PopoverHeader>
            {base && (
                <PopoverItem
                    selected={draft === 'auto'}
                    onClick={selectAuto}
                    disabled={saving}
                >
                    {copy.automatic} · DeepSeek Flash
                </PopoverItem>
            )}
            {models.map((model) => (
                <ModelOption
                    key={model.id}
                    model={model}
                    selected={draft === model.id}
                    disabled={saving}
                    onSelect={selectModel}
                />
            ))}
            {(pref.isError || catalog.isError) && (
                <>
                    <p role='alert'>{copy.error}</p>
                    <Button type='button' variant='quiet' onClick={retry}>
                        {preference.retry}
                    </Button>
                </>
            )}
            {failed && (
                <div role='alert' className={styles.hint}>
                    <p>{preference.saveError}</p>
                    <Button
                        type='button'
                        variant='quiet'
                        size='compact'
                        onClick={save}
                    >
                        {preference.retry}
                    </Button>
                </div>
            )}
            {saveState === 'conflict' && (
                <>
                    <p role='alert' className={styles.hint}>
                        {preference.conflict}
                    </p>
                    <Button
                        type='button'
                        size='compact'
                        variant='quiet'
                        onClick={useLatest}
                        disabled={!controller.latest}
                    >
                        {preference.useLatest}
                    </Button>
                </>
            )}
            <PopoverSeparator />
            <ButtonLink href={profileLink} size='compact' variant='quiet'>
                {copy.viewCredits}
            </ButtonLink>
        </>
    );
    if (embedded)
        return <section className={styles.modelSettings}>{content}</section>;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type='button'
                    className={styles.chip}
                    aria-label={accessible}
                >
                    <Cpu size={14} aria-hidden='true' />
                    <strong>{label}</strong>
                    <ChevronDown size={12} aria-hidden='true' />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side='top'
                align='end'
                className={styles.preferencePopover}
            >
                {content}
            </PopoverContent>
        </Popover>
    );
}
function ModelOption({
    model,
    selected,
    disabled,
    onSelect,
}: {
    model: TextAiModelSummary;
    selected: boolean;
    disabled: boolean;
    onSelect(value: string): void;
}) {
    const { locale } = useI18n();
    const copy = preferenceCopy(locale);
    const unavailable =
        model.id !== 'deepseek-flash' || model.availability !== 'available';
    const cannotSelect = disabled || unavailable;
    function select() {
        onSelect(model.id);
    }
    return (
        <PopoverItem
            selected={selected}
            disabled={cannotSelect}
            onClick={select}
        >
            <span>
                {model.label}
                {unavailable && (
                    <small className={styles.hint}>{copy.unavailable}</small>
                )}
            </span>
        </PopoverItem>
    );
}
