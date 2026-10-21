import type { PortraitInterviewerOutput } from '@languon/contracts';
import type { InterviewContext } from './ports/interview-store';

/** A deterministic opening costs no credits and makes the first answer accessible without a model. */
export function initialInterviewQuestion(
    context: InterviewContext,
): PortraitInterviewerOutput {
    const returning = context.approvedItems !== null;
    const messages = {
        en: returning
            ? 'What would you like to update?'
            : 'Which languages do you know, and which are you learning?',
        ru: returning
            ? 'Что вы хотите обновить?'
            : 'Какие языки вы знаете и какие изучаете?',
        fr: returning
            ? 'Que souhaitez-vous mettre à jour ?'
            : 'Quelles langues connaissez-vous et lesquelles apprenez-vous ?',
        es: returning
            ? '¿Qué te gustaría actualizar?'
            : '¿Qué idiomas conoces y cuáles estás aprendiendo?',
    };
    return {
        message: messages[context.locale],
        topic: returning ? 'update' : 'languages',
        options: returning
            ? []
            : ['en', 'es', 'fr', 'de', 'ru'].map((language) => ({
                  id: language,
                  label:
                      new Intl.DisplayNames([context.locale], {
                          type: 'language',
                      }).of(language) ?? language,
              })),
        multiSelect: true,
    };
}
