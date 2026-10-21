import type { Locale } from '@/fsd/shared/i18n';
import { copy } from './copy';

export function listCopy(
    field: 'goals' | 'accommodations' | 'hobbies',
    locale: Locale,
) {
    const definitions = {
        goals: {
            legend: copy(
                locale,
                'What you’re learning for',
                'Для чего вы учитесь',
                'Pourquoi vous apprenez',
                'Para qué aprendes',
            ),
            label: copy(
                locale,
                'Your own goal',
                'Своя цель',
                'Votre propre objectif',
                'Tu propio objetivo',
            ),
            placeholder: copy(
                locale,
                'e.g., Workplace conversation',
                'Например, общение на работе',
                'Ex. : conversations au travail',
                'P. ej., conversaciones en el trabajo',
            ),
        },
        accommodations: {
            legend: copy(
                locale,
                'Helpful approaches',
                'Полезные подходы',
                'Approches utiles',
                'Enfoques útiles',
            ),
            label: copy(
                locale,
                'Something else that helps',
                'Что ещё помогает',
                'Autre chose qui aide',
                'Algo más que te ayuda',
            ),
            placeholder: copy(
                locale,
                'e.g., A quick check question after each new rule',
                'Например, короткий проверочный вопрос после каждого нового правила',
                'Ex. : une question de vérification après chaque nouvelle règle',
                'P. ej., una pregunta de repaso tras cada regla nueva',
            ),
        },
        hobbies: {
            legend: copy(
                locale,
                'Interests for examples',
                'Интересы для примеров',
                'Centres d’intérêt pour les exemples',
                'Intereses para los ejemplos',
            ),
            label: copy(
                locale,
                'Another interest',
                'Другой интерес',
                'Un autre centre d’intérêt',
                'Otro interés',
            ),
            placeholder: copy(
                locale,
                'e.g., Board games',
                'Например, настольные игры',
                'Ex. : jeux de société',
                'P. ej., juegos de mesa',
            ),
        },
    };
    return definitions[field];
}
