/** Recognize only a complete additive enum statement from reviewed migration SQL. */
const identifier = String.raw`(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)`;
const literal = String.raw`'(?:[^']|'')*'`;
const enumExpansion = new RegExp(
    String.raw`^\s*(?:(?:--[^\n]*(?:\n|$)|/\*[\s\S]*?\*/)\s*)*ALTER\s+TYPE\s+(${identifier}(?:\.${identifier})?)\s+ADD\s+VALUE(\s+IF\s+NOT\s+EXISTS)?\s+(${literal})(\s+(?:BEFORE|AFTER)\s+${literal})?\s*;?\s*$`,
    'iu',
);

export function parseEnumExpansion(statement: string): {
    typeName: string;
    sql: string;
    label: string;
    ifNotExists: boolean;
    placement?: { direction: 'before' | 'after'; neighbor: string };
} | null {
    const match = enumExpansion.exec(statement);
    if (!match) return null;
    const placement = match[4]
        ?.trim()
        .match(/^(BEFORE|AFTER)\s+('(?:[^']|'')*')$/iu);
    const decode = (value: string): string =>
        value.slice(1, -1).replaceAll("''", "'");
    return {
        label: decode(match[3]!),
        ifNotExists: Boolean(match[2]),
        ...(placement
            ? {
                  placement: {
                      direction: placement[1]!.toLowerCase() as
                          'before' | 'after',
                      neighbor: decode(placement[2]!),
                  },
              }
            : {}),
        typeName: match[1]!,
        sql: `ALTER TYPE ${match[1]} ADD VALUE IF NOT EXISTS ${match[3]}${match[4] ?? ''};`,
    };
}
