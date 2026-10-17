import { PencilLine } from 'lucide-react';
import { Textarea } from '@/fsd/shared/ui';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
import type { WorkspacePair } from '../../lib/workspace-content';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';

function Pair({
    pair,
    index,
    ws,
}: {
    pair: WorkspacePair;
    index: number;
    ws: TextWorkspace;
}) {
    const { copy } = useWorkspaceCopy();
    const edited =
        ws.touched.has(pair.pairId) ||
        ws.document?.alignment?.editedPairIds.includes(pair.pairId);

    function source(event: React.ChangeEvent<HTMLTextAreaElement>) {
        ws.editPair(pair.pairId, 'source', event.target.value);
    }

    function translation(event: React.ChangeEvent<HTMLTextAreaElement>) {
        ws.editPair(pair.pairId, 'translation', event.target.value);
    }

    const sourceError =
        ws.showErrors && !pair.source.trim() ? copy('emptyPair') : undefined;
    const translationError =
        ws.showErrors && !pair.translation.trim()
            ? copy('emptyPair')
            : undefined;

    return (
        <li className={styles.pair}>
            <div className={styles.pairHeading}>
                <span>
                    {copy('pair')} {index + 1}
                </span>
                {edited && (
                    <span className={styles.edited}>
                        <PencilLine />
                        {copy('edited')}
                    </span>
                )}
            </div>
            <div className={styles.pairColumns}>
                <Textarea
                    disabled={ws.saving}
                    data-workspace-source
                    label={copy('source')}
                    value={pair.source}
                    lang={ws.input.sourceLanguage}
                    rows={3}
                    onChange={source}
                    {...(sourceError ? { error: sourceError } : {})}
                />
                <Textarea
                    disabled={ws.saving}
                    label={copy('translation')}
                    value={pair.translation}
                    lang={ws.input.targetLanguage}
                    rows={3}
                    onChange={translation}
                    {...(translationError ? { error: translationError } : {})}
                />
            </div>
        </li>
    );
}

export function WorkspacePairEditor({ ws }: { ws: TextWorkspace }) {
    const { copy } = useWorkspaceCopy();

    return (
        <div className={styles.scroll}>
            <div className={styles.editor}>
                <p>{copy('editHint')}</p>
                <ol className={styles.pairs}>
                    {ws.pairs.map((pair, index) => (
                        <Pair
                            key={pair.pairId}
                            pair={pair}
                            index={index}
                            ws={ws}
                        />
                    ))}
                </ol>
            </div>
        </div>
    );
}
