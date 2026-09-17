import { en, type MessageKey, type Messages } from './messages/en';

export type TranslationValues = Record<string, number | string>;
export type Translate = (key: MessageKey, values?: TranslationValues) => string;

export function createTranslator(messages: Messages): Translate {
    return (key, values) => {
        // A live client can receive an older or incomplete serialized catalog
        // during development. Never turn a missing key into blank safety copy
        // or a render-time exception while the page bundle updates.
        const message = typeof messages[key] === 'string' ? messages[key] : en[key];
        if (!values) return message;

        return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (token, name) =>
            Object.hasOwn(values, name) ? String(values[name]) : token,
        );
    };
}
