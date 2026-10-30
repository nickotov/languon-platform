import { randomUUID } from 'node:crypto';

/** Deterministic browser-fixture payloads, kept independent of server startup. */
export function markdownGrammarProposal() {
    return {
        blocks: [
            {
                id: randomUUID(),
                type: 'grammar' as const,
                title: 'Subjonctif: readable pattern',
                language: 'fr',
                rule: `Use **le subjonctif** after a trigger of doubt or necessity.

- Il faut que tu viennes.
- Je doute qu’il soit prêt.`,
                pattern: `| Personne | être |
| --- | --- |
| je | sois |
| nous | soyons |`,
            },
        ],
    };
}

/** Extract IDs as the deterministic model receives them after SDK serialization. */
export function mentionedBlockIds(prompt: unknown) {
    const match = JSON.stringify(prompt).match(
        /Mentioned learning block IDs[^[]*(\[[^\]]+\])/u,
    );
    if (!match)
        throw new Error('Mention fixture requires frozen reference IDs.');
    const ids = JSON.parse(match[1]!.replaceAll('\\"', '"')) as unknown;
    if (
        !Array.isArray(ids) ||
        ids.length !== 2 ||
        ids.some((id) => typeof id !== 'string')
    )
        throw new Error(
            'Mention fixture requires exactly two referenced blocks.',
        );
    return ids;
}
