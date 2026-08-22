const safeIdentifierPattern = /^[a-zA-Z0-9_.:/-]{1,128}$/;
const safeItemTypes = new Set([
    'agent_message',
    'command_execution',
    'file_change',
    'mcp_tool_call',
    'reasoning',
    'subagent',
    'todo_list',
    'web_search',
]);
const safeItemStatuses = new Set([
    'completed',
    'failed',
    'in_progress',
    'pending',
    'running',
]);

function safeIdentifier(value) {
    return typeof value === 'string' && safeIdentifierPattern.test(value)
        ? value
        : null;
}

function safeCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function activityForItem(type, status) {
    const names = new Map([
        ['agent_message', 'Agent response'],
        ['command_execution', 'Command execution'],
        ['file_change', 'File change'],
        ['mcp_tool_call', 'MCP tool call'],
        ['reasoning', 'Reasoning'],
        ['subagent', 'Subagent activity'],
        ['todo_list', 'Plan update'],
        ['web_search', 'Web search'],
    ]);
    const name = names.get(type) ?? 'Agent activity';
    return status ? `${name} · ${status}` : name;
}

export function initialAgentMetadata() {
    return {
        activity: 'Waiting for structured events',
        agent: 'Codex',
        itemType: null,
        skill: 'Not reported by Codex CLI',
        status: 'starting',
        threadId: null,
        tokens: null,
    };
}

export function projectCodexEvent(line, previous = initialAgentMetadata()) {
    let event;
    try {
        event = JSON.parse(line);
    } catch {
        return { kind: 'ignored', metadata: previous };
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        return { kind: 'ignored', metadata: previous };
    }
    const type = safeIdentifier(event.type);
    if (!type) return { kind: 'ignored', metadata: previous };
    const metadata = { ...previous };

    if (type === 'thread.started') {
        metadata.threadId = safeIdentifier(event.thread_id);
        metadata.activity = 'Thread started';
        metadata.status = 'running';
    } else if (type === 'turn.started') {
        metadata.activity = 'Turn running';
        metadata.status = 'running';
    } else if (
        ['item.started', 'item.updated', 'item.completed'].includes(type)
    ) {
        const item =
            event.item &&
            typeof event.item === 'object' &&
            !Array.isArray(event.item)
                ? event.item
                : {};
        const candidateType = safeIdentifier(item.type);
        const candidateStatus = safeIdentifier(item.status);
        const itemType = safeItemTypes.has(candidateType)
            ? candidateType
            : null;
        const status = safeItemStatuses.has(candidateStatus)
            ? candidateStatus
            : null;
        metadata.itemType = itemType;
        metadata.activity = activityForItem(itemType, status);
        metadata.status = type === 'item.completed' ? 'running' : 'running';
    } else if (type === 'turn.completed') {
        const usage =
            event.usage && typeof event.usage === 'object' ? event.usage : {};
        metadata.activity = 'Turn completed';
        metadata.status = 'completed';
        metadata.tokens = {
            cachedInput: safeCount(usage.cached_input_tokens),
            input: safeCount(usage.input_tokens),
            output: safeCount(usage.output_tokens),
        };
    } else if (type === 'turn.failed' || type === 'error') {
        metadata.activity = 'Agent run failed';
        metadata.status = 'failed';
    } else {
        return { kind: 'ignored', metadata: previous };
    }
    return {
        kind: 'metadata',
        logText: `[codex] ${metadata.activity}`,
        metadata,
    };
}
