import { describe, expect, it } from 'vitest';
import { parseEnumExpansion } from '../src/migrations/enum-expansion';

describe('additive enum migration recognition', () => {
    it('preserves identifiers, labels and ordering while making retries idempotent', () => {
        expect(
            parseEnumExpansion(
                `ALTER TYPE "public"."measurement" ADD VALUE 'speech_success';`,
            ),
        ).toEqual({
            label: 'speech_success',
            ifNotExists: false,
            typeName: '"public"."measurement"',
            sql: `ALTER TYPE "public"."measurement" ADD VALUE IF NOT EXISTS 'speech_success';`,
        });
        expect(
            parseEnumExpansion(
                `-- reviewed expansion\nALTER TYPE "audit" ADD VALUE IF NOT EXISTS 'it''s valid' BEFORE 'previous';`,
            ),
        ).toEqual({
            label: "it's valid",
            ifNotExists: true,
            placement: { direction: 'before', neighbor: 'previous' },
            typeName: '"audit"',
            sql: `ALTER TYPE "audit" ADD VALUE IF NOT EXISTS 'it''s valid' BEFORE 'previous';`,
        });
    });

    it('does not transform ordinary DDL, function bodies or multiple statements', () => {
        for (const sql of [
            `ALTER TABLE sample ADD CHECK (measurement = 'speech_success');`,
            `CREATE TYPE sample AS ENUM ('first');`,
            `ALTER TYPE sample RENAME VALUE 'first' TO 'other';`,
            `ALTER TYPE sample ADD VALUE 'second'; DROP TABLE sample;`,
            `CREATE FUNCTION example() RETURNS void AS $$ BEGIN ALTER TYPE sample ADD VALUE 'second'; END $$ LANGUAGE plpgsql;`,
        ])
            expect(parseEnumExpansion(sql)).toBeNull();
    });
});
