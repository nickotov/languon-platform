import type { MessageKey, Messages } from './messages/en';

export type TranslationValues = Record<string, number | string>;
export type Translate = (key: MessageKey, values?: TranslationValues) => string;

export function createTranslator(messages: Messages): Translate {
    return (key, values) => {
        const message = messages[key];
        if (!values) return message;

        return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (token, name) =>
            Object.hasOwn(values, name) ? String(values[name]) : token,
        );
    };
}
