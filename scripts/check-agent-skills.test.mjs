import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateSkillPackage } from './check-agent-skills.mjs';

function skillContent(name, extraFrontmatter = '') {
    return `---\nname: ${name}\ndescription: Validate a realistic repository skill package.${extraFrontmatter}\n---\n\n# Test\n`;
}

function metadataContent(name, policy = '') {
    return `interface:\n    display_name: 'Test skill'\n    short_description: 'Validate a realistic skill package'\n    default_prompt: 'Use $${name} to validate this package.'${policy}\n`;
}

function validate(name, overrides = {}) {
    return validateSkillPackage({
        directoryName: name,
        metadataContent: metadataContent(name),
        metadataPath: `${name}/agents/openai.yaml`,
        skillContent: skillContent(name),
        skillPath: `${name}/SKILL.md`,
        ...overrides,
    });
}

test('accepts a complete implicitly invoked skill package', () => {
    assert.equal(validate('example-skill'), 'example-skill');
});

test('requires the frontmatter name to match the directory', () => {
    assert.throws(
        () =>
            validate('example-skill', {
                skillContent: skillContent('different-skill'),
            }),
        /must match directory/,
    );
});

test('requires the default prompt to mention the skill', () => {
    assert.throws(
        () =>
            validate('example-skill', {
                metadataContent: metadataContent('different-skill'),
            }),
        /default_prompt must mention/,
    );
});

test('requires explicit-only policy for exploratory skills', () => {
    assert.throws(() => validate('prototype'), /disable implicit invocation/);

    assert.equal(
        validate('prototype', {
            metadataContent: metadataContent(
                'prototype',
                '\n\npolicy:\n    allow_implicit_invocation: false',
            ),
        }),
        'prototype',
    );

    assert.throws(
        () => validate('web-dev-panel'),
        /disable implicit invocation/,
    );

    assert.throws(
        () => validate('feature-development'),
        /disable implicit invocation/,
    );
});

test('rejects unsupported interface metadata', () => {
    assert.throws(
        () =>
            validate('example-skill', {
                metadataContent: metadataContent('example-skill').replace(
                    "    display_name: 'Test skill'\n",
                    "    display_name: 'Test skill'\n    icon: 'unsafe'\n",
                ),
            }),
        /unsupported interface key/,
    );
});

test('enforces short-description boundaries', () => {
    for (const length of [24, 65]) {
        assert.throws(
            () =>
                validate('example-skill', {
                    metadataContent: metadataContent('example-skill').replace(
                        'Validate a realistic skill package',
                        'x'.repeat(length),
                    ),
                }),
            /short_description must contain 25-64 characters/,
        );
    }
});

test('requires every UI metadata field', () => {
    for (const key of ['default_prompt', 'display_name', 'short_description']) {
        const withoutField = metadataContent('example-skill')
            .split('\n')
            .filter((line) => !line.includes(`${key}:`))
            .join('\n');
        assert.throws(
            () =>
                validate('example-skill', {
                    metadataContent: withoutField,
                }),
            new RegExp(`missing interface\\.${key}`),
        );
    }
});

test('rejects additional SKILL frontmatter keys', () => {
    assert.throws(
        () =>
            validate('example-skill', {
                skillContent: skillContent('example-skill', '\nlicense: MIT'),
            }),
        /frontmatter must contain only name and description/,
    );
});

test('enforces SKILL name, description, and line bounds', () => {
    const longName = 'a'.repeat(65);
    assert.throws(
        () =>
            validate(longName, {
                skillContent: skillContent(longName),
            }),
        /name must be at most 64 characters/,
    );

    assert.throws(
        () =>
            validate('example-skill', {
                skillContent: skillContent('example-skill').replace(
                    'Validate a realistic repository skill package.',
                    'x'.repeat(1025),
                ),
            }),
        /description must be at most 1024 characters/,
    );

    assert.throws(
        () =>
            validate('example-skill', {
                skillContent: `${skillContent('example-skill')}${'\n'.repeat(500)}`,
            }),
        /SKILL\.md must not exceed 500 lines/,
    );
});
