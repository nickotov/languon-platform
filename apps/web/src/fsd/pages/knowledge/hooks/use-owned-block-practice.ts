import type { LearningBlock, KnowledgeNote } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { useWorkbookLearning } from '@/fsd/features/workbook-learning';
import { useI18n } from '@/fsd/shared/i18n';
import { hasSavedExerciseMaterial } from '../lib/saved-exercise-material';

/** Owner study stays private and binds only to saved exercise material. */
export function useOwnedBlockPractice(
    noteId: string,
    note: KnowledgeNote | null | undefined,
    working: LearningBlock[],
) {
    const actorId = useSessionStore((state) => state.user?.id);
    const { requestWithSession } = useAuth();
    const { locale } = useI18n();
    const model = useWorkbookLearning({
        noteId,
        noteVersion: note?.version ?? 0,
        body: note?.body,
        actorId: note ? actorId : undefined,
        locale,
        requestWithSession,
    });
    const saved =
        note?.body.document.content?.flatMap((node) =>
            node.attrs?.block ? [node.attrs.block] : [],
        ) ?? [];
    function options(block: LearningBlock) {
        if (!hasSavedExerciseMaterial(block, working, saved)) {
            if (block.type !== 'exercise') return {};
            return {
                evaluationUnavailableReason: {
                    en: 'Save this sheet before requesting AI feedback on the changed exercise.',
                    ru: 'Сохраните лист перед ИИ-проверкой изменённого упражнения.',
                    es: 'Guarda la hoja antes de solicitar una revisión con IA del ejercicio modificado.',
                    fr: 'Enregistrez la fiche avant de demander un retour IA sur cet exercice modifié.',
                }[locale],
            };
        }
        return model.options(block);
    }
    return { options, consent: model.evaluationConsent };
}
