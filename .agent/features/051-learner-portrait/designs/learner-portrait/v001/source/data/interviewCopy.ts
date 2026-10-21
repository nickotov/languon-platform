import type { LangCode, TopicId } from '../types/portrait';

export const CORE_TOPICS: TopicId[] = ['languages', 'explanation', 'goals', 'style', 'needs'];
export const OPTIONAL_TOPICS: TopicId[] = ['interests', 'age'];

export const TOPIC_LABELS: Record<TopicId, string> = {
  languages: 'Languages',
  explanation: 'Explanations',
  goals: 'Goals',
  style: 'Style',
  needs: 'Learning needs',
  interests: 'Interests',
  age: 'Age range',
};

interface Copy {
  greeting: string;
  updateGreeting: string;
  questions: Record<TopicId, { title: string; help: string }>;
  acks: string[];
  skipAck: string;
  deeperOffer: string;
  done: string;
  clarifyExamples: string;
  clarifyGeneric: string;
  proposalIntro: string;
  diagnosisIntro: string;
  redirect: string;
  switched: string;
}

export const INTERVIEW_COPY: Record<LangCode, Copy> = {
  en: {
    greeting:
      'Hi! I’ll ask a few short questions about your languages, goals, and how you like things explained. Skip anything you like — you can review your portrait at any time.',
    updateGreeting:
      'What would you like to update? For this update I can read your saved portrait. Nothing changes until you review and save.',
    questions: {
      languages: { title: 'Which languages do you know, and which are you learning now?', help: 'Describe each in your own words — this isn’t a test.' },
      explanation: { title: 'Which languages feel comfortable for explanations?', help: 'This can differ from the languages you’re learning and from the app’s interface language.' },
      goals: { title: 'What are you learning for?', help: 'Pick any that fit, or add your own.' },
      style: { title: 'How would you like explanations to feel?', help: 'Each choice is separate — friendly doesn’t have to mean simple, and academic doesn’t have to mean long.' },
      needs: { title: 'Is there anything that makes learning easier for you?', help: 'Share practical preferences. You don’t need to explain why.' },
      interests: { title: 'Any hobbies or interests we could use for examples?', help: 'Optional. Helps examples feel relevant.' },
      age: { title: 'Would you like to share a broad age range?', help: 'Optional. It only helps choose relevant examples and life context — never difficulty, maturity, or tone.' },
    },
    acks: ['Thanks — that’s in your draft.', 'Got it. You’ll be able to review that.', 'Thanks, noted in your draft.'],
    skipAck: 'No problem — we’ll skip that one.',
    deeperOffer:
      'That covers the core topics. Want to go a little deeper with interests and an age range, for more relevant examples? Both are optional.',
    done: 'That’s everything I’d ask. Review your portrait draft whenever you’re ready — nothing is saved until you approve it.',
    clarifyExamples: 'We start with a practical sentence, then explain the rule behind it.',
    clarifyGeneric:
      'I’m asking so explanations can match how you like to learn. Pick what fits, write your own answer, or skip — all are fine.',
    proposalIntro: 'Here’s how I’d note that. You can edit it, add it to your draft, or dismiss it.',
    diagnosisIntro:
      'Thanks for telling me. I’ll only suggest saving the practical need — not a diagnosis. You can edit this before adding it:',
    redirect:
      'That’s outside this interview, which is only about how you like to learn. For language questions, the Knowledge library is a good place to start. Would you like to continue or pause?',
    switched: 'Sure — we’ll continue in English. Your explanation-language preferences haven’t changed.',
  },
  es: {
    greeting:
      '¡Hola! Te haré unas preguntas breves sobre tus idiomas, tus objetivos y cómo prefieres las explicaciones. Puedes saltar lo que quieras y revisar tu retrato en cualquier momento.',
    updateGreeting:
      '¿Qué te gustaría actualizar? Para esta actualización puedo leer tu retrato guardado. Nada cambia hasta que lo revises y guardes.',
    questions: {
      languages: { title: '¿Qué idiomas conoces y cuáles estás aprendiendo ahora?', help: 'Descríbelos con tus palabras: no es un examen.' },
      explanation: { title: '¿En qué idiomas te resultan cómodas las explicaciones?', help: 'Puede ser distinto de los idiomas que aprendes y del idioma de la app.' },
      goals: { title: '¿Para qué estás aprendiendo?', help: 'Elige los que encajen o añade el tuyo.' },
      style: { title: '¿Cómo te gustaría que fueran las explicaciones?', help: 'Cada opción es independiente: cercano no significa sencillo.' },
      needs: { title: '¿Hay algo que te facilite aprender?', help: 'Comparte preferencias prácticas. No hace falta explicar por qué.' },
      interests: { title: '¿Algún pasatiempo o interés para usar en los ejemplos?', help: 'Opcional.' },
      age: { title: '¿Quieres compartir un rango de edad aproximado?', help: 'Opcional. Solo ayuda a elegir ejemplos relevantes, nunca la dificultad ni el tono.' },
    },
    acks: ['Gracias, ya está en tu borrador.', 'Entendido. Podrás revisarlo.', 'Gracias, anotado en tu borrador.'],
    skipAck: 'Sin problema, la saltamos.',
    deeperOffer:
      'Ya cubrimos los temas principales. ¿Quieres profundizar con intereses y rango de edad para ejemplos más relevantes? Ambos son opcionales.',
    done: 'Eso es todo lo que preguntaría. Revisa tu borrador cuando quieras: nada se guarda hasta que lo apruebes.',
    clarifyExamples: 'Empezamos con una frase práctica y luego explicamos la regla que hay detrás.',
    clarifyGeneric:
      'Lo pregunto para que las explicaciones se adapten a cómo aprendes. Elige lo que encaje, escribe tu respuesta o sáltala.',
    proposalIntro: 'Así lo anotaría. Puedes editarlo, añadirlo a tu borrador o descartarlo.',
    diagnosisIntro: 'Gracias por contármelo. Solo propondré guardar la necesidad práctica, no un diagnóstico. Puedes editarlo:',
    redirect:
      'Eso queda fuera de esta entrevista, que trata solo de cómo prefieres aprender. Para preguntas de idiomas, la biblioteca Knowledge es un buen lugar. ¿Quieres continuar o pausar?',
    switched: 'Claro, seguimos en español. Tus preferencias de idioma para las explicaciones no han cambiado.',
  },
  fr: {
    greeting:
      'Bonjour ! Je vais vous poser quelques questions sur vos langues, vos objectifs et la façon dont vous aimez qu’on vous explique. Passez ce que vous voulez et relisez votre portrait à tout moment.',
    updateGreeting:
      'Que souhaitez-vous mettre à jour ? Pour cette mise à jour, je peux lire votre portrait enregistré. Rien ne change avant votre validation.',
    questions: {
      languages: { title: 'Quelles langues connaissez-vous, et lesquelles apprenez-vous en ce moment ?', help: 'Décrivez-les avec vos mots — ce n’est pas un test.' },
      explanation: { title: 'Dans quelles langues les explications vous conviennent-elles ?', help: 'Elles peuvent différer des langues étudiées et de la langue de l’application.' },
      goals: { title: 'Pourquoi apprenez-vous ?', help: 'Choisissez ce qui convient ou ajoutez le vôtre.' },
      style: { title: 'Comment aimeriez-vous que les explications soient ?', help: 'Chaque choix est indépendant : amical ne veut pas dire simple.' },
      needs: { title: 'Qu’est-ce qui vous facilite l’apprentissage ?', help: 'Partagez des préférences pratiques, sans avoir à vous justifier.' },
      interests: { title: 'Des loisirs ou centres d’intérêt pour les exemples ?', help: 'Facultatif.' },
      age: { title: 'Souhaitez-vous indiquer une tranche d’âge ?', help: 'Facultatif. Sert uniquement à choisir des exemples pertinents, jamais la difficulté ni le ton.' },
    },
    acks: ['Merci, c’est dans votre brouillon.', 'Compris. Vous pourrez le relire.', 'Merci, noté dans votre brouillon.'],
    skipAck: 'Pas de souci, on passe.',
    deeperOffer:
      'Nous avons couvert l’essentiel. Voulez-vous approfondir avec vos centres d’intérêt et une tranche d’âge ? Les deux sont facultatifs.',
    done: 'C’est tout pour moi. Relisez votre brouillon quand vous voulez — rien n’est enregistré sans votre accord.',
    clarifyExamples: 'On commence par une phrase concrète, puis on explique la règle qui se cache derrière.',
    clarifyGeneric:
      'Je pose la question pour adapter les explications à votre façon d’apprendre. Choisissez, écrivez votre réponse ou passez.',
    proposalIntro: 'Voici comment je le noterais. Vous pouvez le modifier, l’ajouter à votre brouillon ou l’ignorer.',
    diagnosisIntro: 'Merci de me le dire. Je proposerai seulement le besoin pratique, pas de diagnostic. Vous pouvez le modifier :',
    redirect:
      'Cela sort du cadre de cet entretien, consacré à votre façon d’apprendre. Pour les questions de langue, la bibliothèque Knowledge est idéale. Continuer ou faire une pause ?',
    switched: 'Bien sûr, continuons en français. Vos préférences de langue d’explication n’ont pas changé.',
  },
  ru: {
    greeting:
      'Здравствуйте! Я задам несколько коротких вопросов о ваших языках, целях и о том, как вам удобнее получать объяснения. Любой вопрос можно пропустить, а портрет — просмотреть в любой момент.',
    updateGreeting:
      'Что бы вы хотели обновить? Для этого обновления я могу прочитать ваш сохранённый портрет. Ничего не изменится, пока вы не проверите и не сохраните.',
    questions: {
      languages: { title: 'Какие языки вы знаете и какие изучаете сейчас?', help: 'Опишите своими словами — это не тест.' },
      explanation: { title: 'На каких языках вам удобно получать объяснения?', help: 'Они могут отличаться от изучаемых языков и языка интерфейса.' },
      goals: { title: 'Для чего вы изучаете язык?', help: 'Выберите подходящее или добавьте своё.' },
      style: { title: 'Какими должны быть объяснения?', help: 'Каждый выбор отдельный: дружелюбно не значит упрощённо.' },
      needs: { title: 'Что облегчает вам учёбу?', help: 'Поделитесь практичными предпочтениями. Объяснять причины не нужно.' },
      interests: { title: 'Есть ли хобби или интересы для примеров?', help: 'Необязательно.' },
      age: { title: 'Хотите указать примерный возраст?', help: 'Необязательно. Помогает только подбирать уместные примеры — не сложность и не тон.' },
    },
    acks: ['Спасибо, это в вашем черновике.', 'Понятно. Вы сможете это проверить.', 'Спасибо, записано в черновик.'],
    skipAck: 'Хорошо, пропустим.',
    deeperOffer:
      'Основные темы пройдены. Хотите добавить интересы и возрастной диапазон для более уместных примеров? Оба пункта необязательны.',
    done: 'Это всё, о чём я хотел спросить. Просмотрите черновик, когда будете готовы — без вашего одобрения ничего не сохранится.',
    clarifyExamples: 'Сначала даём практическое предложение, затем объясняем правило, которое за ним стоит.',
    clarifyGeneric:
      'Я спрашиваю, чтобы объяснения подходили вашему стилю обучения. Выберите вариант, напишите свой ответ или пропустите.',
    proposalIntro: 'Вот как я бы это записал. Можно отредактировать, добавить в черновик или отклонить.',
    diagnosisIntro: 'Спасибо, что поделились. Я предложу сохранить только практическую потребность, без диагноза. Можно отредактировать:',
    redirect:
      'Это выходит за рамки интервью — оно только о том, как вам удобнее учиться. С вопросами о языке лучше обратиться в библиотеку Knowledge. Продолжим или сделаем паузу?',
    switched: 'Конечно, продолжим на русском. Ваши предпочтения по языку объяснений не изменились.',
  },
};

