import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

type SearchableCardColumns = {
    source: AnyPgColumn;
    translation: AnyPgColumn;
    definition: AnyPgColumn;
    example: AnyPgColumn;
    exampleTranslation: AnyPgColumn;
};

// Index definition and runtime predicate must use the same document expression.
export function dictionaryCardSearchDocument(columns: SearchableCardColumns) {
    return sql`to_tsvector('simple', coalesce(${columns.source}, '') || ' ' || coalesce(${columns.translation}, '') || ' ' || coalesce(${columns.definition}, '') || ' ' || coalesce(${columns.example}, '') || ' ' || coalesce(${columns.exampleTranslation}, ''))`;
}

export function dictionaryCardPrefixQuery(search: string) {
    // Parse and quote literal lexemes rather than accepting tsquery operators.
    // Keep this subquery uncorrelated so its value is built once per search.
    return sql`(
        select to_tsquery('simple', string_agg(quote_literal(words.lexeme) || ':*', ' & '))
        from unnest(tsvector_to_array(to_tsvector('simple', ${search}))) as words(lexeme)
    )`;
}
