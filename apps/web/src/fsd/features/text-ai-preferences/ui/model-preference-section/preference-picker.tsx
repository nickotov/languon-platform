import type { TextAiModelSummary } from '@languon/contracts';
import { Button, InlineAlert, Skeleton } from '@/fsd/shared/ui';
import type { ModelPreferenceController } from '../../hooks/use-model-preference';
import type { preferenceCopy } from '../../lib/copy';
import { ModelOption } from './model-option';
import styles from './model-preference-section.module.css';
export function PreferencePicker({
    controller,
    copy,
    group,
    options,
    autoContext,
}: {
    controller: ModelPreferenceController;
    copy: ReturnType<typeof preferenceCopy>;
    group: string;
    options: TextAiModelSummary[];
    autoContext: string;
}) {
    const { base, draft, catalog, dirty, saveState } = controller;
    const disabledPicker = !base || saveState === 'saving';
    const savedChoice =
        base?.mode === 'auto' ? 'auto' : (base?.modelId ?? null);
    const missingSaved =
        base?.mode === 'explicit' &&
        !catalog.data?.models.some((model) => model.id === base.modelId);
    const noModels =
        catalog.isSuccess &&
        !catalog.data.models.some(
            (model) => model.availability === 'available',
        );
    function retryCatalog() {
        void catalog.refetch();
    }
    return (
        <fieldset
            className={styles.picker}
            aria-busy={saveState === 'saving' || catalog.isPending}
        >
            <legend>{copy.legend}</legend>
            <div className={styles.stack}>
                <ModelOption
                    checked={draft === 'auto'}
                    context={autoContext}
                    copy={copy}
                    disabled={disabledPicker}
                    group={group}
                    onSelect={controller.select}
                    saved={dirty && savedChoice === 'auto'}
                    value='auto'
                />
                {catalog.isPending ? (
                    <div aria-label={copy.loadingCatalog}>
                        <Skeleton height={96} variant='rect' />
                    </div>
                ) : null}
                {catalog.isError ? (
                    <InlineAlert
                        tone='error'
                        actions={
                            <Button
                                onClick={retryCatalog}
                                size='compact'
                                variant='secondary'
                            >
                                {copy.retry}
                            </Button>
                        }
                    >
                        {copy.catalogError}
                    </InlineAlert>
                ) : null}
                {missingSaved && !base?.selectedModel ? (
                    <InlineAlert tone='warning'>
                        {base?.modelId}: {copy.missing}
                    </InlineAlert>
                ) : null}
                {options.map((model) => (
                    <ModelOption
                        checked={draft === model.id}
                        copy={copy}
                        disabled={
                            disabledPicker || model.availability !== 'available'
                        }
                        group={group}
                        key={model.id}
                        model={model}
                        onSelect={controller.select}
                        saved={dirty && savedChoice === model.id}
                        unknown={!catalog.isSuccess}
                        value={model.id}
                    />
                ))}
                {noModels ? (
                    <InlineAlert
                        tone='warning'
                        actions={
                            <Button
                                onClick={retryCatalog}
                                size='compact'
                                variant='secondary'
                            >
                                {copy.checkAgain}
                            </Button>
                        }
                    >
                        {copy.noModels}
                    </InlineAlert>
                ) : null}
            </div>
        </fieldset>
    );
}
