import type { ExerciseLearningBlock } from '@languon/contracts';

const en = {
    prepared: 'Instant check',
    hybrid: 'Instant check; AI review for other answers',
    ai: 'AI feedback on request',
    partial: 'Partially correct',
    unchecked: 'Unchecked',
    unassessed: 'Unable to assess',
    alternatives:
        'This answer is not in the prepared key. You can check it with AI.',
    corrections: 'Try these corrections',
    suggested: 'Suggested answer',
    task: 'Task completion',
    meaning: 'Meaning and content',
    target: 'Target language use',
    evidence: 'Supporting evidence',
    met: 'Met',
    partlyMet: 'Partly met',
    notMet: 'Not met',
    truthTrue: 'True',
    truthFalse: 'False',
    truthNotStated: 'Not stated',
};

const messages: Record<string, typeof en> = {
    en,
    ru: {
        prepared: 'Мгновенная проверка',
        hybrid: 'Мгновенная проверка; другие ответы — с ИИ',
        ai: 'ИИ-проверка по запросу',
        partial: 'Частично верно',
        unchecked: 'Не проверено',
        unassessed: 'Не удалось оценить',
        alternatives:
            'Такого ответа нет в готовом ключе. Его можно проверить с ИИ.',
        corrections: 'Попробуйте эти исправления',
        suggested: 'Вариант ответа',
        task: 'Выполнение задания',
        meaning: 'Смысл и содержание',
        target: 'Использование изучаемого языка',
        evidence: 'Опора на материал',
        met: 'Выполнено',
        partlyMet: 'Частично выполнено',
        notMet: 'Не выполнено',
        truthTrue: 'Верно',
        truthFalse: 'Неверно',
        truthNotStated: 'Не сказано',
    },
    fr: {
        prepared: 'Vérification immédiate',
        hybrid: 'Vérification immédiate ; IA pour les autres réponses',
        ai: 'Retour IA sur demande',
        partial: 'Partiellement correct',
        unchecked: 'Non évalué',
        unassessed: 'Impossible à évaluer',
        alternatives:
            'Cette réponse ne figure pas dans le corrigé. Vous pouvez la faire vérifier par l’IA.',
        corrections: 'Essayez ces corrections',
        suggested: 'Réponse suggérée',
        task: 'Réalisation de la tâche',
        meaning: 'Sens et contenu',
        target: 'Utilisation de la langue cible',
        evidence: 'Éléments du texte',
        met: 'Réussi',
        partlyMet: 'Partiellement réussi',
        notMet: 'Non réussi',
        truthTrue: 'Vrai',
        truthFalse: 'Faux',
        truthNotStated: 'Non indiqué',
    },
    es: {
        prepared: 'Comprobación inmediata',
        hybrid: 'Comprobación inmediata; IA para otras respuestas',
        ai: 'Comentarios de IA a petición',
        partial: 'Parcialmente correcto',
        unchecked: 'Sin evaluar',
        unassessed: 'No se puede evaluar',
        alternatives:
            'Esta respuesta no figura en la clave preparada. Puedes revisarla con IA.',
        corrections: 'Prueba estas correcciones',
        suggested: 'Respuesta sugerida',
        task: 'Cumplimiento de la tarea',
        meaning: 'Significado y contenido',
        target: 'Uso de la lengua objetivo',
        evidence: 'Pruebas del texto',
        met: 'Cumplido',
        partlyMet: 'Parcialmente cumplido',
        notMet: 'No cumplido',
        truthTrue: 'Verdadero',
        truthFalse: 'Falso',
        truthNotStated: 'No se indica',
    },
};

export function namedExerciseLabels(locale = 'en') {
    return messages[locale] ?? en;
}

export function exerciseCheckingLabel(policy: string, locale = 'en') {
    const labels = namedExerciseLabels(locale);
    if (policy === 'prepared-key') {
        return labels.prepared;
    }

    return policy === 'hybrid' ? labels.hybrid : labels.ai;
}

function classificationLabel(
    block: ExerciseLearningBlock,
    choiceId: string,
    locale: string,
) {
    const semantics = block.semantics;
    if (semantics?.activity.id !== 'R03' || !('key' in semantics.checking)) {
        return undefined;
    }

    const key = semantics.checking.key;
    if (key.kind !== 'choice') {
        return undefined;
    }

    const role = key.classification?.roles.find(
        (item) => item.choiceId === choiceId,
    )?.role;
    const labels = namedExerciseLabels(locale);
    if (role === 'true') {
        return labels.truthTrue;
    }

    if (role === 'false') {
        return labels.truthFalse;
    }

    return role === 'not-stated' ? labels.truthNotStated : undefined;
}

/** Classification roles are UI controls; other choice text remains authored content. */
export function exerciseChoiceText(
    block: ExerciseLearningBlock,
    choice: { id: string; text: string },
    locale = 'en',
) {
    return classificationLabel(block, choice.id, locale) ?? choice.text;
}

export function exerciseReferenceText(
    block: ExerciseLearningBlock,
    locale = 'en',
) {
    if (block.format === 'multiple-choice') {
        return (
            classificationLabel(block, block.correctChoiceId, locale) ??
            block.referenceAnswer
        );
    }

    return block.referenceAnswer;
}
