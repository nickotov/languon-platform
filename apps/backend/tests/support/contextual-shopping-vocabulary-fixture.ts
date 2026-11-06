import type { LearningContentTask } from '../../src/modules/conversations/application/learning-content-contract';

const shoppingVocabulary = [
    ['shop', 'магазин'],
    ['store', 'магазин'],
    ['customer', 'покупатель'],
    ['cashier', 'кассир'],
    ['checkout', 'касса'],
    ['basket', 'корзина'],
    ['cart', 'тележка'],
    ['aisle', 'проход'],
    ['shelf', 'полка'],
    ['price', 'цена'],
    ['discount', 'скидка'],
    ['sale', 'распродажа'],
    ['offer', 'предложение'],
    ['coupon', 'купон'],
    ['receipt', 'чек'],
    ['refund', 'возврат денег'],
    ['return', 'возврат товара'],
    ['exchange', 'обмен'],
    ['payment', 'оплата'],
    ['cash', 'наличные'],
    ['card', 'карта'],
    ['change', 'сдача'],
    ['total', 'итоговая сумма'],
    ['tax', 'налог'],
    ['bag', 'пакет'],
    ['package', 'упаковка'],
    ['brand', 'бренд'],
    ['size', 'размер'],
    ['colour', 'цвет'],
    ['quality', 'качество'],
    ['product', 'товар'],
    ['item', 'предмет'],
    ['stock', 'запас'],
    ['delivery', 'доставка'],
    ['order', 'заказ'],
    ['purchase', 'покупка'],
    ['buy', 'покупать'],
    ['sell', 'продавать'],
    ['pay', 'платить'],
    ['cost', 'стоить'],
    ['cheap', 'дешёвый'],
    ['expensive', 'дорогой'],
    ['affordable', 'доступный по цене'],
    ['available', 'доступный'],
    ['sold out', 'распродано'],
    ['fitting room', 'примерочная'],
    ['opening hours', 'часы работы'],
    ['shopping list', 'список покупок'],
    ['bargain', 'выгодная покупка'],
    ['warranty', 'гарантия'],
] as const;

/** Decode only the host's separate progress frame, never a task instruction. */
export function shoppingVocabularyBatch(
    task: LearningContentTask,
    hostPrompt: string,
) {
    const marker = '\nVocabulary batch progress (host-controlled data): ';
    const start = hostPrompt.indexOf(marker);
    const progress: unknown =
        start < 0
            ? null
            : JSON.parse(
                  hostPrompt.slice(start + marker.length).split('\n')[0]!,
              );
    const part = progress as {
        taskId?: unknown;
        offset?: unknown;
        total?: unknown;
    } | null;
    const offset = part?.offset ?? 0;
    const count = task.count ?? 50;

    if (
        task.id !== 'shopping-vocabulary' ||
        task.language !== 'en' ||
        task.translationLanguage !== 'ru' ||
        typeof offset !== 'number' ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset + count > shoppingVocabulary.length ||
        (part !== null && (part.taskId !== task.id || part.total !== 50))
    ) {
        throw new Error('Shopping fixture requires the exact bounded batch.');
    }

    return shoppingVocabulary
        .slice(offset, offset + count)
        .map(([term, translation]) => ({
            term,
            translation,
            pronunciation: term,
            definition: `A common shopping expression used to discuss ${term} in a store.`,
            example: `When I go shopping, I ask the assistant about ${term} before buying.`,
            exampleTranslation: `Когда я хожу за покупками, я спрашиваю продавца: «${translation}».`,
        }));
}
