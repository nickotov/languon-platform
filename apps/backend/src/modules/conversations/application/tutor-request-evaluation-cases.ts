/** Synthetic opt-in evaluation inputs. Scripted transports do not establish model intent quality. */
export const tutorRequestEvaluationCases = [
    {
        id: 'help-en',
        message: 'What can you do?',
        expected: 'answer',
        documentUse: false,
    },
    {
        id: 'help-ru',
        message: 'Что ты умеешь?',
        expected: 'answer',
        documentUse: false,
    },
    {
        id: 'explanation-en',
        message: 'Explain the French compound past.',
        expected: 'answer',
        documentUse: true,
    },
    {
        id: 'explanation-ru',
        message: 'Объясни разницу между passé composé и imparfait.',
        expected: 'answer',
        documentUse: true,
    },
    {
        id: 'vocabulary-en',
        message:
            'Make French vocabulary with English translations for chat, chien, maison.',
        expected: 'generate',
        kinds: ['vocabulary'],
        words: ['chat', 'chien', 'maison'],
    },
    {
        id: 'vocabulary-ru',
        message:
            'Сделай словарный блок: chat, chien, maison. Французский, перевод на русский.',
        expected: 'generate',
        kinds: ['vocabulary'],
        words: ['chat', 'chien', 'maison'],
    },
    {
        id: 'mixed-en',
        message:
            'Create French vocabulary with English translations for travel, a grammar block on polite questions, and five multiple-choice exercises.',
        expected: 'generate',
        kinds: ['vocabulary', 'grammar', 'exercises'],
    },
    {
        id: 'mixed-ru',
        message:
            'Подготовь французскую лексику о путешествиях с переводом на русский, грамматику вежливых вопросов и пять упражнений с выбором ответа.',
        expected: 'generate',
        kinds: ['vocabulary', 'grammar', 'exercises'],
    },
    {
        id: 'large-vocabulary-after-capacity-refusal',
        message:
            'Generate all 50 French shopping terms with Russian translations.',
        pending:
            'One vocabulary task: 50 shopping terms, French, Russian translations.',
        history: [
            {
                role: 'assistant',
                content:
                    'The 50-entry vocabulary block exceeded the generation limit. Would you prefer fewer entries?',
            },
        ],
        expected: 'generate',
        kinds: ['vocabulary'],
        count: 50,
    },
    {
        id: 'missing-language',
        message: 'Make vocabulary for gift and pain.',
        expected: 'clarify',
        missing: ['language', 'translationLanguage'],
    },
    {
        id: 'clarification-continuation',
        message: 'Французский, перевод на русский.',
        pending: 'vocabulary request for chat and chien with languages missing',
        expected: 'generate',
        kinds: ['vocabulary'],
        words: ['chat', 'chien'],
    },
    {
        id: 'unsupported-format',
        message:
            'Make a French pronunciation scoring exercise that grades my microphone recording.',
        expected: 'unsupported',
    },
    {
        id: 'ambiguous-proposal',
        message: 'Теперь сделай упражнения на эти слова.',
        proposalCatalog: [
            'first distinct vocabulary proposal',
            'second distinct vocabulary proposal',
        ],
        expected: 'clarify',
    },
    {
        id: 'prose-only',
        message:
            'Explain these five French words in prose only; no vocabulary block or exercises.',
        expected: 'answer',
        documentUse: true,
    },
    {
        id: 'typo',
        message:
            'Make a French vocablary blok for chat and chien with English translations.',
        expected: 'generate',
        kinds: ['vocabulary'],
        words: ['chat', 'chien'],
    },
] as const;

/** Predeclared rubric for a separately authorized model run, never a CI transport-stub score. */
export const tutorRequestEvaluationRubric = {
    minimumCases: tutorRequestEvaluationCases.length,
    requiredIntentAccuracy: 1,
    requiredRequestedComponentCoverage: 1,
    requiredExplicitWordCoverage: 1,
    maximumFalseDocumentActions: 0,
    maximumUnauthorizedReferences: 0,
    record: [
        'caseId',
        'modelRevision',
        'promptRevision',
        'intent',
        'componentCoverage',
        'wordCoverage',
        'clarificationQuality',
    ],
} as const;
