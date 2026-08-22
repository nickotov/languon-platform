export const CUSTOM_SECTIONS_SCHEMA = 'languon.web-dev-panel.custom-sections';
export const CUSTOM_SECTIONS_VERSION = 1;
export const CUSTOM_SECTIONS_STORAGE_KEY = CUSTOM_SECTIONS_SCHEMA;

const maximumDocumentBytes = 64 * 1024;
const maximumSections = 32;
const maximumMembersPerSection = 64;
const maximumTotalMembers = 512;
const rootKeys = new Set(['schema', 'sections', 'version']);
const sectionKeys = new Set(['commandIds', 'id', 'name']);
const sectionIdPattern =
    /^section-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const commandIdPattern = /^[a-z0-9](?:[a-z0-9:-]{0,78}[a-z0-9])?$/u;
const textEncoder = new TextEncoder();

export class CustomSectionsError extends Error {
    constructor(code, message, issues) {
        super(message);
        this.name = 'CustomSectionsError';
        this.code = code;
        if (issues !== undefined) this.issues = issues;
    }
}

function fail(code, message, path) {
    const issues = path === undefined ? undefined : [{ code, message, path }];
    throw new CustomSectionsError(code, message, issues);
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expected, path) {
    if (!isPlainObject(value)) {
        fail('invalid-shape', `${path} must be an object.`, path);
    }
    const keys = Object.keys(value);
    if (
        keys.length !== expected.size ||
        keys.some((key) => !expected.has(key))
    ) {
        fail(
            'invalid-shape',
            `${path} must contain exactly the supported fields.`,
            path,
        );
    }
}

function hasControlCharacter(value) {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    });
}

function validateName(value, path) {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value.length > 64 ||
        value.trim() !== value ||
        hasControlCharacter(value)
    ) {
        fail(
            'invalid-section-name',
            'Section names must be trimmed text between 1 and 64 characters without control characters.',
            path,
        );
    }
    return value;
}

function validateSectionId(value, path) {
    if (typeof value !== 'string' || !sectionIdPattern.test(value)) {
        fail(
            'invalid-section-id',
            'Section IDs must use the canonical section UUID format.',
            path,
        );
    }
    return value;
}

function validateCommandId(value, path) {
    if (typeof value !== 'string' || !commandIdPattern.test(value)) {
        fail(
            'invalid-command-id',
            'Command IDs must use the reviewed catalog ID format.',
            path,
        );
    }
    return value;
}

function validateDocument(value) {
    assertExactKeys(value, rootKeys, 'document');
    if (value.schema !== CUSTOM_SECTIONS_SCHEMA) {
        fail(
            'unsupported-schema',
            'The custom-sections schema is not supported.',
            'document.schema',
        );
    }
    if (value.version !== CUSTOM_SECTIONS_VERSION) {
        fail(
            'unsupported-version',
            'The custom-sections version is not supported.',
            'document.version',
        );
    }
    if (!Array.isArray(value.sections)) {
        fail(
            'invalid-shape',
            'Document sections must be an array.',
            'document.sections',
        );
    }
    if (value.sections.length > maximumSections) {
        fail(
            'too-many-sections',
            `A document may contain at most ${maximumSections} sections.`,
            'document.sections',
        );
    }

    const sectionIds = new Set();
    const sectionNames = new Set();
    let totalMembers = 0;
    const sections = value.sections.map((section, sectionIndex) => {
        const path = `document.sections[${sectionIndex}]`;
        assertExactKeys(section, sectionKeys, path);
        const id = validateSectionId(section.id, `${path}.id`);
        if (sectionIds.has(id)) {
            fail(
                'duplicate-section-id',
                'Section IDs must be unique.',
                `${path}.id`,
            );
        }
        sectionIds.add(id);

        const name = validateName(section.name, `${path}.name`);
        const foldedName = name.toLowerCase();
        if (sectionNames.has(foldedName)) {
            fail(
                'duplicate-section-name',
                'Section names must be unique regardless of letter case.',
                `${path}.name`,
            );
        }
        sectionNames.add(foldedName);

        if (!Array.isArray(section.commandIds)) {
            fail(
                'invalid-shape',
                'Section command IDs must be an array.',
                `${path}.commandIds`,
            );
        }
        if (section.commandIds.length > maximumMembersPerSection) {
            fail(
                'too-many-section-members',
                `A section may contain at most ${maximumMembersPerSection} commands.`,
                `${path}.commandIds`,
            );
        }
        totalMembers += section.commandIds.length;
        if (totalMembers > maximumTotalMembers) {
            fail(
                'too-many-total-members',
                `A document may contain at most ${maximumTotalMembers} command memberships.`,
                'document.sections',
            );
        }

        const memberIds = new Set();
        const commandIds = section.commandIds.map((commandId, commandIndex) => {
            const memberPath = `${path}.commandIds[${commandIndex}]`;
            const validated = validateCommandId(commandId, memberPath);
            if (memberIds.has(validated)) {
                fail(
                    'duplicate-section-member',
                    'A command may appear only once within a section.',
                    memberPath,
                );
            }
            memberIds.add(validated);
            return validated;
        });
        return { id, name, commandIds };
    });

    return {
        schema: CUSTOM_SECTIONS_SCHEMA,
        version: CUSTOM_SECTIONS_VERSION,
        sections,
    };
}

function catalogIds(catalog) {
    let entries;
    if (catalog instanceof Set || Array.isArray(catalog)) {
        entries = catalog;
    } else if (isPlainObject(catalog) && Array.isArray(catalog.commands)) {
        entries = catalog.commands;
    } else {
        fail(
            'invalid-catalog',
            'The current command catalog is unavailable.',
            'catalog',
        );
    }

    const ids = new Set();
    let index = 0;
    for (const entry of entries) {
        const id = typeof entry === 'string' ? entry : entry?.id;
        if (typeof id !== 'string' || !commandIdPattern.test(id)) {
            fail(
                'invalid-catalog',
                'The current command catalog is unavailable.',
                `catalog[${index}]`,
            );
        }
        ids.add(id);
        index += 1;
    }
    return ids;
}

export function emptyCustomSectionsDocument() {
    return {
        schema: CUSTOM_SECTIONS_SCHEMA,
        version: CUSTOM_SECTIONS_VERSION,
        sections: [],
    };
}

export function createSectionId(randomUuid = () => crypto.randomUUID()) {
    let uuid;
    try {
        uuid = randomUuid();
    } catch {
        fail(
            'section-id-generation-failed',
            'A new section ID could not be generated.',
        );
    }
    const id = `section-${uuid}`;
    validateSectionId(id, 'section.id');
    return id;
}

export function parseCustomSections(text) {
    if (typeof text !== 'string') {
        fail('invalid-json', 'Custom-sections data must be JSON text.');
    }
    if (textEncoder.encode(text).byteLength > maximumDocumentBytes) {
        fail(
            'document-too-large',
            `Custom-sections JSON must not exceed ${maximumDocumentBytes} bytes.`,
        );
    }
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        fail('invalid-json', 'Custom-sections data is not valid JSON.');
    }
    return validateDocument(value);
}

export function serializeCustomSections(document) {
    const canonical = validateDocument(document);
    const serialized = `${JSON.stringify(canonical, null, 2)}\n`;
    if (textEncoder.encode(serialized).byteLength > maximumDocumentBytes) {
        fail(
            'document-too-large',
            `Custom-sections JSON must not exceed ${maximumDocumentBytes} bytes.`,
        );
    }
    return serialized;
}

export function missingCatalogCommandIds(document, catalog) {
    const canonical = validateDocument(document);
    const currentIds = catalogIds(catalog);
    const missing = new Set();
    for (const section of canonical.sections) {
        for (const commandId of section.commandIds) {
            if (!currentIds.has(commandId)) missing.add(commandId);
        }
    }
    return [...missing];
}

export function parseImportedCustomSections(text, catalog) {
    const document = parseCustomSections(text);
    const missing = missingCatalogCommandIds(document, catalog);
    if (missing.length > 0) {
        fail(
            'unknown-command-ids',
            `The imported layout references ${missing.length} command ${missing.length === 1 ? 'ID' : 'IDs'} missing from the current catalog.`,
            'document.sections',
        );
    }
    return document;
}

export function createSection(document, name, id = createSectionId()) {
    const canonical = validateDocument(document);
    return validateDocument({
        ...canonical,
        sections: [...canonical.sections, { id, name, commandIds: [] }],
    });
}

export function deleteSection(document, sectionId) {
    const canonical = validateDocument(document);
    validateSectionId(sectionId, 'section.id');
    const sections = canonical.sections.filter(({ id }) => id !== sectionId);
    if (sections.length === canonical.sections.length) {
        fail('section-not-found', 'The requested section does not exist.');
    }
    return { ...canonical, sections };
}

export function setSectionMembership(document, sectionId, commandId, included) {
    const canonical = validateDocument(document);
    validateSectionId(sectionId, 'section.id');
    validateCommandId(commandId, 'command.id');
    if (typeof included !== 'boolean') {
        fail(
            'invalid-membership-state',
            'Section membership state must be boolean.',
        );
    }

    let found = false;
    const sections = canonical.sections.map((section) => {
        if (section.id !== sectionId) return section;
        found = true;
        const currentlyIncluded = section.commandIds.includes(commandId);
        if (currentlyIncluded === included) return section;
        return {
            ...section,
            commandIds: included
                ? [...section.commandIds, commandId]
                : section.commandIds.filter((id) => id !== commandId),
        };
    });
    if (!found) {
        fail('section-not-found', 'The requested section does not exist.');
    }
    return validateDocument({ ...canonical, sections });
}

export function toggleSectionMembership(document, sectionId, commandId) {
    const canonical = validateDocument(document);
    const section = canonical.sections.find(({ id }) => id === sectionId);
    if (!section) {
        fail('section-not-found', 'The requested section does not exist.');
    }
    return setSectionMembership(
        canonical,
        sectionId,
        commandId,
        !section.commandIds.includes(commandId),
    );
}

export function loadCustomSections(storage) {
    let serialized;
    try {
        serialized = storage.getItem(CUSTOM_SECTIONS_STORAGE_KEY);
    } catch {
        fail(
            'storage-read-failed',
            'Custom sections could not be read from browser storage.',
        );
    }
    if (serialized === null) return emptyCustomSectionsDocument();
    if (typeof serialized !== 'string') {
        fail(
            'storage-read-failed',
            'Custom sections could not be read from browser storage.',
        );
    }
    return parseCustomSections(serialized);
}

export function saveCustomSections(storage, document) {
    const serialized = serializeCustomSections(document);
    try {
        storage.setItem(CUSTOM_SECTIONS_STORAGE_KEY, serialized);
    } catch {
        fail(
            'storage-write-failed',
            'Custom sections could not be saved to browser storage.',
        );
    }
    return serialized;
}
