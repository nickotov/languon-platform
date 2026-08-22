const activeStatuses = new Set(['running', 'starting', 'stopping']);

function active(command) {
    return command.run && activeStatuses.has(command.run.status);
}

export function selectableCommands(commands) {
    const activeIds = new Set(
        commands.filter(active).map((command) => command.id),
    );
    return commands.filter(
        (command) =>
            command.available &&
            command.batchEligible &&
            !active(command) &&
            !command.conflictsWith.some((id) => activeIds.has(id)),
    );
}

export function compatibleCommandIds(commands) {
    const selected = [];
    const selectedIds = new Set();
    for (const command of selectableCommands(commands)) {
        if (command.conflictsWith.some((id) => selectedIds.has(id))) continue;
        selected.push(command.id);
        selectedIds.add(command.id);
    }
    return selected;
}
