import { useState } from 'react';
import type { DictionaryChatSnippet } from '@languon/contracts';
import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog } from '@/fsd/shared/ui';
import { useSnippetApplication } from '../../hooks/use-snippet-application';
import { snippetCopy, snippetCount } from '../../lib/snippet-copy';
import type { DictionarySnippetContext } from '../../types';
import { DictionarySnippetView } from './ui/snippet-view/snippet-view';

export function DictionarySnippetCard({
    snippet,
    context,
    disabled = false,
    onApplying,
    expanded,
    defaultExpanded = false,
    onToggleExpanded,
}: {
    snippet: DictionaryChatSnippet;
    context: DictionarySnippetContext;
    disabled?: boolean;
    onApplying(value: boolean): void;
    expanded?: boolean;
    defaultExpanded?: boolean;
    onToggleExpanded?(id: string): void;
}) {
    const { locale, t } = useI18n();
    const copy = snippetCopy(locale);
    const application = useSnippetApplication(snippet, context, onApplying);
    const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
    const isExpanded = expanded ?? localExpanded;
    const busy = disabled || application.pending;
    const actionsDisabled = busy || application.selected.length === 0;
    const error = application.error
        ? dictionaryErrorMessage(application.error, t)
        : null;
    const replacementDescription = snippetCount(
        copy.replaceDescription,
        application.replacement?.activeCardCount ?? 0,
    );

    function append() {
        application.requestApply('append');
    }

    function prepend() {
        application.requestApply('prepend');
    }

    function replace() {
        application.requestApply('replace');
    }

    function toggleExpanded() {
        if (onToggleExpanded) {
            onToggleExpanded(snippet.id);
        } else {
            setLocalExpanded((current) => !current);
        }
    }

    return (
        <>
            <DictionarySnippetView
                snippet={snippet}
                expanded={isExpanded}
                selected={application.selected}
                disabled={disabled}
                pending={application.pending}
                error={error}
                canRetry={application.canRetry}
                onToggleExpanded={toggleExpanded}
                onToggle={application.toggle}
                onToggleAll={application.toggleAll}
                onAppend={append}
                onPrepend={prepend}
                onReplace={replace}
                onRetry={application.retry}
            />
            <Dialog
                showCloseButton={false}
                open={Boolean(application.replacement)}
                onClose={application.cancelReplace}
                title={copy.replaceTitle}
                description={replacementDescription}
                closeLabel={copy.cancel}
                footer={
                    <>
                        <Button
                            type='button'
                            variant='secondary'
                            onClick={application.cancelReplace}
                        >
                            {copy.cancel}
                        </Button>
                        <Button
                            type='button'
                            variant='danger'
                            onClick={application.confirmReplace}
                            disabled={actionsDisabled}
                        >
                            {copy.replace}
                        </Button>
                    </>
                }
            />
        </>
    );
}
