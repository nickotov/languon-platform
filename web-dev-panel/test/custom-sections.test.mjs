import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CUSTOM_SECTIONS_SCHEMA,
    CUSTOM_SECTIONS_STORAGE_KEY,
    CUSTOM_SECTIONS_VERSION,
    CustomSectionsError,
    createSection,
    createSectionId,
    deleteSection,
    emptyCustomSectionsDocument,
    loadCustomSections,
    missingCatalogCommandIds,
    parseCustomSections,
    parseImportedCustomSections,
    saveCustomSections,
    serializeCustomSections,
    setSectionMembership,
    toggleSectionMembership,
} from '../public/custom-sections.js';

const ids = [
    'section-123e4567-e89b-12d3-a456-426614174000',
    'section-223e4567-e89b-12d3-a456-426614174001',
];

function documentWith(sections) {
    return {
        schema: CUSTOM_SECTIONS_SCHEMA,
        version: CUSTOM_SECTIONS_VERSION,
        sections,
    };
}

function section(overrides = {}) {
    return {
        id: ids[0],
        name: 'Daily work',
        commandIds: ['lint', 'dev:web'],
        ...overrides,
    };
}

function expectCustomError(action, code) {
    try {
        action();
    } catch (error) {
        assert.ok(error instanceof CustomSectionsError);
        assert.equal(error.code, code);
        assert.ok(error.message.length > 0 && error.message.length < 256);
        return error;
    }
    assert.fail(`Expected CustomSectionsError with code ${code}`);
}

test('canonical serialization is stable, pretty, closed, and newline-terminated', () => {
    const source = {
        sections: [
            {
                name: 'Daily work',
                commandIds: ['lint', 'dev:web'],
                id: ids[0],
            },
        ],
        version: 1,
        schema: CUSTOM_SECTIONS_SCHEMA,
    };
    const serialized = serializeCustomSections(source);
    assert.equal(
        serialized,
        `{
  "schema": "languon.web-dev-panel.custom-sections",
  "version": 1,
  "sections": [
    {
      "id": "section-123e4567-e89b-12d3-a456-426614174000",
      "name": "Daily work",
      "commandIds": [
        "lint",
        "dev:web"
      ]
    }
  ]
}
`,
    );
    assert.deepEqual(parseCustomSections(serialized), source);
    assert.equal(
        serializeCustomSections(parseCustomSections(serialized)),
        serialized,
    );
});

test('rejects malformed and oversized JSON without echoing untrusted input', () => {
    const secret = 'do-not-echo-this-input';
    const malformed = expectCustomError(
        () => parseCustomSections(`{"schema":"${secret}"`),
        'invalid-json',
    );
    assert.equal(malformed.message.includes(secret), false);
    assert.equal(
        malformed.issues?.some((issue) => issue.message.includes(secret)) ??
            false,
        false,
    );
    expectCustomError(
        () => parseCustomSections(' '.repeat(64 * 1024 + 1)),
        'document-too-large',
    );
});

test('rejects unsupported schema, version, and extra or missing keys', () => {
    const empty = emptyCustomSectionsDocument();
    expectCustomError(
        () =>
            parseCustomSections(JSON.stringify({ ...empty, schema: 'other' })),
        'unsupported-schema',
    );
    expectCustomError(
        () => parseCustomSections(JSON.stringify({ ...empty, version: 2 })),
        'unsupported-version',
    );
    expectCustomError(
        () =>
            parseCustomSections(JSON.stringify({ ...empty, executable: 'sh' })),
        'invalid-shape',
    );
    expectCustomError(
        () =>
            parseCustomSections(
                JSON.stringify({ schema: empty.schema, version: 1 }),
            ),
        'invalid-shape',
    );
    expectCustomError(
        () =>
            parseCustomSections(
                JSON.stringify(
                    documentWith([section({ sourceRevision: 'sha256:bad' })]),
                ),
            ),
        'invalid-shape',
    );
});

test('enforces canonical section IDs and bounded unique section names', () => {
    for (const id of [
        '123e4567-e89b-12d3-a456-426614174000',
        'section-123E4567-E89B-12D3-A456-426614174000',
        'section-not-a-uuid',
    ]) {
        expectCustomError(
            () => serializeCustomSections(documentWith([section({ id })])),
            'invalid-section-id',
        );
    }
    for (const name of [
        '',
        ' padded',
        'padded ',
        'x'.repeat(65),
        'bad\u0000name',
        'bad\u0085name',
    ]) {
        expectCustomError(
            () => serializeCustomSections(documentWith([section({ name })])),
            'invalid-section-name',
        );
    }
    expectCustomError(
        () =>
            serializeCustomSections(
                documentWith([
                    section(),
                    section({ id: ids[1], name: 'DAILY WORK' }),
                ]),
            ),
        'duplicate-section-name',
    );
    expectCustomError(
        () =>
            serializeCustomSections(
                documentWith([section(), section({ name: 'Other' })]),
            ),
        'duplicate-section-id',
    );
});

test('enforces command ID syntax, unique membership, and every count limit', () => {
    for (const commandId of [
        'UPPER',
        '-leading',
        'trailing-',
        'x'.repeat(81),
    ]) {
        expectCustomError(
            () =>
                serializeCustomSections(
                    documentWith([section({ commandIds: [commandId] })]),
                ),
            'invalid-command-id',
        );
    }
    expectCustomError(
        () =>
            serializeCustomSections(
                documentWith([section({ commandIds: ['lint', 'lint'] })]),
            ),
        'duplicate-section-member',
    );

    const manySections = Array.from({ length: 33 }, (_, index) =>
        section({
            id: `section-${String(index).padStart(8, '0')}-0000-0000-0000-000000000000`,
            name: `Section ${index}`,
            commandIds: [],
        }),
    );
    expectCustomError(
        () => serializeCustomSections(documentWith(manySections)),
        'too-many-sections',
    );
    expectCustomError(
        () =>
            serializeCustomSections(
                documentWith([
                    section({
                        commandIds: Array.from(
                            { length: 65 },
                            (_, index) => `command:${index}`,
                        ),
                    }),
                ]),
            ),
        'too-many-section-members',
    );
    const totalLimit = Array.from({ length: 9 }, (_, sectionIndex) =>
        section({
            id: `section-${String(sectionIndex).padStart(8, '0')}-0000-0000-0000-000000000000`,
            name: `Section ${sectionIndex}`,
            commandIds: Array.from(
                { length: sectionIndex === 8 ? 1 : 64 },
                (_, memberIndex) => `command:${sectionIndex}:${memberIndex}`,
            ),
        }),
    );
    expectCustomError(
        () => serializeCustomSections(documentWith(totalLimit)),
        'too-many-total-members',
    );
});

test('ordinary parse preserves missing IDs while import rejects them atomically', () => {
    const source = documentWith([section({ commandIds: ['lint', 'removed'] })]);
    const serialized = serializeCustomSections(source);
    assert.deepEqual(parseCustomSections(serialized), source);
    assert.deepEqual(missingCatalogCommandIds(source, new Set(['lint'])), [
        'removed',
    ]);
    const current = documentWith([section({ commandIds: ['lint'] })]);
    expectCustomError(
        () => parseImportedCustomSections(serialized, new Set(['lint'])),
        'unknown-command-ids',
    );
    assert.deepEqual(
        current,
        documentWith([section({ commandIds: ['lint'] })]),
    );
});

test('import validates IDs only and accepts disabled current commands', () => {
    const source = documentWith([section({ commandIds: ['disabled-task'] })]);
    const serialized = serializeCustomSections(source);
    assert.deepEqual(
        parseImportedCustomSections(serialized, [
            { id: 'disabled-task', available: false, disabledReason: 'unsafe' },
        ]),
        source,
    );
    assert.deepEqual(
        parseImportedCustomSections(serialized, {
            commands: [{ id: 'disabled-task', enabled: false }],
        }),
        source,
    );
});

test('creation, deletion, and membership mutations are immutable', () => {
    const empty = Object.freeze(emptyCustomSectionsDocument());
    const created = createSection(empty, ' Daily '.trim(), ids[0]);
    assert.deepEqual(empty.sections, []);
    assert.deepEqual(created.sections, [
        { id: ids[0], name: 'Daily', commandIds: [] },
    ]);

    const frozen = Object.freeze({
        ...created,
        sections: Object.freeze(
            created.sections.map((value) =>
                Object.freeze({
                    ...value,
                    commandIds: Object.freeze(value.commandIds),
                }),
            ),
        ),
    });
    const added = setSectionMembership(frozen, ids[0], 'lint', true);
    const unchanged = setSectionMembership(added, ids[0], 'lint', true);
    const toggled = toggleSectionMembership(unchanged, ids[0], 'lint');
    assert.deepEqual(frozen.sections[0].commandIds, []);
    assert.deepEqual(added.sections[0].commandIds, ['lint']);
    assert.deepEqual(unchanged, added);
    assert.notStrictEqual(unchanged, added);
    assert.deepEqual(toggled.sections[0].commandIds, []);
    assert.deepEqual(
        deleteSection(added, ids[0]),
        emptyCustomSectionsDocument(),
    );
    expectCustomError(
        () => deleteSection(emptyCustomSectionsDocument(), ids[0]),
        'section-not-found',
    );
});

test('section ID creation prefixes a canonical caller-provided UUID', () => {
    assert.equal(
        createSectionId(() => '123e4567-e89b-12d3-a456-426614174000'),
        ids[0],
    );
    expectCustomError(
        () => createSectionId(() => 'NOT-A-UUID'),
        'invalid-section-id',
    );
    expectCustomError(
        () =>
            createSectionId(() => {
                throw new Error('sensitive entropy failure');
            }),
        'section-id-generation-failed',
    );
});

test('storage adapter loads, saves, and translates read/write failures safely', () => {
    const values = new Map();
    const storage = {
        getItem(key) {
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            values.set(key, value);
        },
    };
    assert.deepEqual(
        loadCustomSections(storage),
        emptyCustomSectionsDocument(),
    );

    const source = documentWith([section()]);
    const serialized = saveCustomSections(storage, source);
    assert.equal(values.get(CUSTOM_SECTIONS_STORAGE_KEY), serialized);
    assert.deepEqual(loadCustomSections(storage), source);

    const readError = expectCustomError(
        () =>
            loadCustomSections({
                getItem() {
                    throw new Error('secret read detail');
                },
            }),
        'storage-read-failed',
    );
    assert.equal(readError.message.includes('secret'), false);
    const writeError = expectCustomError(
        () =>
            saveCustomSections(
                {
                    setItem() {
                        throw new Error('secret quota detail');
                    },
                },
                source,
            ),
        'storage-write-failed',
    );
    assert.equal(writeError.message.includes('secret'), false);
});
