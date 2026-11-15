import type { ExerciseActivityId } from '@languon/contracts';

export type ExampleSpec = {
    question: string;
    answer: string;
    choices?: string[];
    correctIndex?: number;
    gap?: [string, string];
    partial?: string;
    reason: [string, string, string, string];
};

/** Each item is authored against the shared library visit, rather than generated at runtime. */
export const exampleSpecs: Record<ExerciseActivityId, ExampleSpec> = {
    V01: {
        question:
            'Which word means “take something for a short time and give it back”?',
        answer: 'borrow',
        reason: [
            'Borrow means taking something temporarily.',
            'Borrow означает взять что-то на время.',
            'Borrow signifie prendre quelque chose temporairement.',
            'Borrow significa tomar algo prestado temporalmente.',
        ],
    },
    V02: {
        question: 'What does “return” mean in “Maya returns two books”?',
        answer: 'Give something back',
        choices: [
            'Give something back',
            'Buy something new',
            'Read something quickly',
        ],
        reason: [
            'Return means give back, not buy or read.',
            'Return означает вернуть, а не купить или прочитать.',
            'Return signifie rendre, et non acheter ou lire.',
            'Return significa devolver, no comprar ni leer.',
        ],
    },
    V03: {
        question: 'Complete the sentence with a word from the vocabulary.',
        answer: 'borrow',
        gap: ['I want to ', ' a book from the library.'],
        reason: [
            'You borrow a library book and return it later.',
            'Книгу в библиотеке берут на время (borrow), а позже возвращают.',
            'On emprunte (borrow) un livre puis on le rend.',
            'Se toma prestado (borrow) un libro y se devuelve después.',
        ],
    },
    V05: {
        question: 'Complete the natural word pair using the vocabulary.',
        answer: 'take',
        gap: ['Maya usually wants to ', ' the bus to the library.'],
        reason: [
            'The natural expression is “take the bus”.',
            'Устойчивое сочетание — take the bus.',
            'L’expression naturelle est « take the bus ».',
            'La expresión natural es « take the bus ».',
        ],
    },
    V06: {
        question: 'Use the adjective form of “help” from the vocabulary.',
        answer: 'helpful',
        gap: ['The librarian is very ', '.'],
        reason: [
            'Add -ful to help to make the adjective helpful.',
            'Добавьте -ful к help, чтобы получить прилагательное helpful.',
            'Ajoutez -ful à help pour former l’adjectif helpful.',
            'Añade -ful a help para formar el adjetivo helpful.',
        ],
    },
    V07: {
        question:
            'Write two sentences about a library visit. Use “borrow” and “return”.',
        answer: 'I borrow a book from the library. I return it next week.',
        partial: 'I borrow a book.',
        reason: [
            'Use both target words with their library meanings.',
            'Используйте оба слова в контексте библиотеки.',
            'Utilisez les deux mots dans leur sens lié à la bibliothèque.',
            'Usa ambas palabras con su significado en la biblioteca.',
        ],
    },
    G01: {
        question:
            'Choose the form for a regular habit: “Maya usually ___ the bus.”',
        answer: 'takes',
        choices: ['takes', 'is taking', 'take'],
        reason: [
            'Usually signals a habit: use present simple with -s for Maya.',
            'Usually указывает на привычку: Present Simple с -s для Maya.',
            'Usually indique une habitude : présent simple avec -s pour Maya.',
            'Usually indica un hábito: presente simple con -s para Maya.',
        ],
    },
    G02: {
        question:
            'Complete the present continuous form for an action happening now.',
        answer: 'is walking',
        gap: ['Look! Maya ', ' to the library now.'],
        reason: [
            'Present continuous uses is + walking for Maya.',
            'Present Continuous для Maya: is + walking.',
            'Le présent continu pour Maya est is + walking.',
            'El presente continuo para Maya es is + walking.',
        ],
    },
    G03: {
        question:
            'Rewrite for an action happening now. Start with “Maya”: “Maya walks to the library.”',
        answer: 'Maya is walking to the library now.',
        reason: [
            'Replace walks with is walking to describe now.',
            'Замените walks на is walking, чтобы описать действие сейчас.',
            'Remplacez walks par is walking pour décrire le moment présent.',
            'Cambia walks por is walking para describir lo que ocurre ahora.',
        ],
    },
    G04: {
        question: 'Correct the grammar: “Maya usually is taking the bus.”',
        answer: 'Maya usually takes the bus.',
        reason: [
            'A usual habit takes present simple, not present continuous.',
            'Обычная привычка требует Present Simple.',
            'Une habitude régulière demande le présent simple.',
            'Un hábito habitual requiere el presente simple.',
        ],
    },
    G06: {
        question: 'What does “Maya is walking to the library” tell us?',
        answer: 'She is on her way on foot now.',
        choices: [
            'She is on her way on foot now.',
            'She always walks there.',
            'She walked there yesterday.',
        ],
        reason: [
            'Is walking describes an action in progress now.',
            'Is walking описывает действие, происходящее сейчас.',
            'Is walking décrit une action en cours maintenant.',
            'Is walking describe una acción en curso ahora.',
        ],
    },
    G07: {
        question:
            'Tell a friend about Maya: mention her usual transport and what she is doing today. Use present simple and present continuous.',
        answer: 'Maya usually takes the bus, but today she is walking to the library.',
        partial: 'Maya usually takes the bus.',
        reason: [
            'Use present simple for the habit and present continuous for today’s action.',
            'Используйте Present Simple для привычки и Present Continuous для действия сегодня.',
            'Utilisez le présent simple pour l’habitude et le présent continu pour aujourd’hui.',
            'Usa el presente simple para el hábito y el continuo para la acción de hoy.',
        ],
    },
    R01: {
        question: 'What is the passage mainly about?',
        answer: 'Maya’s visit to the library today',
        choices: [
            'Maya’s visit to the library today',
            'How to drive a bus',
            'A new bookshop opening',
        ],
        reason: [
            'The passage follows Maya’s journey and library activities.',
            'Текст рассказывает о дороге Майи и её делах в библиотеке.',
            'Le passage suit le trajet de Maya et ses activités à la bibliothèque.',
            'El texto sigue el trayecto de Maya y sus actividades en la biblioteca.',
        ],
    },
    R02: {
        question: 'Why is Maya walking today?',
        answer: 'The bus is late.',
        choices: [
            'The bus is late.',
            'The library is closed.',
            'She has lost her books.',
        ],
        reason: [
            'The passage explicitly says the bus is late.',
            'В тексте прямо сказано, что автобус опаздывает.',
            'Le passage indique explicitement que le bus est en retard.',
            'El texto dice explícitamente que el autobús llega tarde.',
        ],
    },
    R03: {
        question:
            'Maya’s sister works at the library. Is this true, false or not stated?',
        answer: 'Not stated',
        choices: ['True', 'False', 'Not stated'],
        correctIndex: 2,
        reason: [
            'The passage gives no information about Maya’s sister or her job.',
            'В тексте нет сведений о сестре Майи или её работе.',
            'Le passage ne donne aucune information sur la sœur de Maya ou son travail.',
            'El texto no da información sobre la hermana de Maya ni su trabajo.',
        ],
    },
    R04: {
        question:
            'In your own words, explain why Maya goes to the library and how she gets there today.',
        answer: 'She goes to return two books and borrow a story book. She walks because the bus is late.',
        partial: 'She walks to the library.',
        reason: [
            'Mention both the purpose of the visit and the reason she walks.',
            'Укажите цель визита и причину, по которой она идёт пешком.',
            'Mentionnez le but de la visite et la raison de sa marche.',
            'Menciona el propósito de la visita y la razón de ir andando.',
        ],
    },
    R08: {
        question: 'Complete the summary with a word from the passage.',
        answer: 'late',
        gap: ['Maya walks to the library because the bus is ', '.'],
        reason: [
            'Late is the stated reason for the change of transport.',
            'Late — указанная в тексте причина смены транспорта.',
            'Late est la raison donnée pour le changement de transport.',
            'Late es la razón indicada para el cambio de transporte.',
        ],
    },
    R09: {
        question:
            'Summarize the passage in two sentences. Include the journey and the library visit.',
        answer: 'Maya usually takes the bus, but today she walks because it is late. She returns two books and borrows a story book at the library.',
        partial: 'Maya goes to the library.',
        reason: [
            'Keep the central facts about the journey and the visit.',
            'Сохраните основные факты о дороге и визите.',
            'Gardez les faits essentiels du trajet et de la visite.',
            'Conserva los datos principales del trayecto y la visita.',
        ],
    },
    W01: {
        question:
            'Translate this sentence into French, preserving the meaning: “Today Maya is walking to the library because the bus is late.”',
        answer: 'Aujourd’hui, Maya va à pied à la bibliothèque parce que le bus est en retard.',
        partial: 'Maya va à la bibliothèque.',
        reason: [
            'Preserve today, walking, the library and the reason involving the late bus.',
            'Сохраните значения «сегодня», «пешком», «библиотека» и причину — опоздание автобуса.',
            'Conservez aujourd’hui, le déplacement à pied, la bibliothèque et la raison du retard du bus.',
            'Conserva hoy, ir andando, la biblioteca y la razón del retraso del autobús.',
        ],
    },
};
