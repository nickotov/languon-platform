import assert from 'node:assert/strict';
import test from 'node:test';

import {
    initialAgentMetadata,
    projectCodexEvent,
} from '../src/codex-events.mjs';

test('projects only allowlisted Codex metadata and drops content', () => {
    const projected = projectCodexEvent(
        JSON.stringify({
            item: {
                content: 'private prompt',
                status: 'in_progress',
                type: 'command_execution',
            },
            type: 'item.started',
        }),
        initialAgentMetadata(),
    );
    assert.equal(projected.kind, 'metadata');
    assert.equal(projected.metadata.itemType, 'command_execution');
    assert.equal(
        JSON.stringify(projected),
        JSON.stringify(projected).replace('private prompt', ''),
    );
    assert.equal(projected.metadata.skill, 'Not reported by Codex CLI');
});

test('ignores unknown and malformed events', () => {
    assert.equal(projectCodexEvent('not json').kind, 'ignored');
    assert.equal(
        projectCodexEvent('{"type":"future.secret_event"}').kind,
        'ignored',
    );
});
