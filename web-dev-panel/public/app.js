import { compatibleCommandIds, selectableCommands } from './selection.js';

const activeStatuses = new Set(['running', 'starting', 'stopping']);
const selected = new Set();
let panelState = null;
let pendingLogFrame = null;
const pendingLogCommands = new Set();

const groupsElement = document.querySelector('#command-groups');
const selectAllElement = document.querySelector('#select-all');
const selectionCountElement = document.querySelector('#selection-count');
const runSelectedElement = document.querySelector('#run-selected');
const stopAllElement = document.querySelector('#stop-all');
const stopAllDialog = document.querySelector('#stop-all-dialog');
const noticeElement = document.querySelector('#notice');
const catalogIssuesElement = document.querySelector('#catalog-issues');
const connectionStatusElement = document.querySelector('#connection-status');
const connectionDotElement = document.querySelector('#connection-dot');

function commandActive(command) {
    return command.run && activeStatuses.has(command.run.status);
}

function setConnection(state, label) {
    connectionDotElement.dataset.state = state;
    connectionStatusElement.textContent = label;
}

function showNotice(message, kind = 'status') {
    noticeElement.hidden = !message;
    noticeElement.textContent = message ?? '';
    noticeElement.classList.toggle('notice--warning', kind === 'error');
}

function updateToolbar() {
    if (!panelState) return;
    const selectable = selectableCommands(panelState.commands);
    const compatibleIds = new Set(compatibleCommandIds(panelState.commands));
    for (const id of [...selected]) {
        if (!selectable.some((command) => command.id === id))
            selected.delete(id);
    }
    selectionCountElement.textContent = `${selected.size} selected`;
    runSelectedElement.disabled = selected.size === 0;
    stopAllElement.disabled = !panelState.commands.some(commandActive);
    selectAllElement.checked =
        compatibleIds.size > 0 &&
        compatibleIds.size === selected.size &&
        [...compatibleIds].every((id) => selected.has(id));
    selectAllElement.indeterminate =
        selected.size > 0 && !selectAllElement.checked;
    selectAllElement.disabled = selectable.length === 0;
}

function formatTime(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(new Date(value));
}

function logText(run) {
    if (!run) return 'No run in this server session.';
    const prefix = run.logs.truncated
        ? '[Earlier log entries were discarded]\n'
        : '';
    if (run.logs.entries.length === 0) return `${prefix}Waiting for output…`;
    return (
        prefix +
        run.logs.entries
            .map((entry) => {
                const stream =
                    entry.stream === 'stderr'
                        ? 'ERR'
                        : entry.stream === 'agent'
                          ? 'AGENT'
                          : 'OUT';
                return `${entry.timestamp} [${stream}] ${entry.text}`;
            })
            .join('\n')
    );
}

function trimClientLog(run) {
    const maximumBytes = 64 * 1024;
    const maximumEntries = 256;
    run.logs.clientBytes ??= run.logs.entries.reduce(
        (total, entry) => total + JSON.stringify(entry).length,
        0,
    );
    while (
        run.logs.entries.length > maximumEntries ||
        run.logs.clientBytes > maximumBytes
    ) {
        const removed = run.logs.entries.shift();
        run.logs.clientBytes -= JSON.stringify(removed).length;
        run.logs.truncated = true;
    }
}

function scheduleLogRender(commandId) {
    pendingLogCommands.add(commandId);
    if (pendingLogFrame !== null) return;
    pendingLogFrame = requestAnimationFrame(() => {
        for (const id of pendingLogCommands) {
            const command = panelState?.commands.find((item) => item.id === id);
            const card = [
                ...groupsElement.querySelectorAll('[data-command-id]'),
            ].find((element) => element.dataset.commandId === id);
            const terminal = card?.querySelector('.terminal');
            if (terminal && command?.run)
                terminal.textContent = logText(command.run);
        }
        pendingLogCommands.clear();
        pendingLogFrame = null;
    });
}

function createAgentMetadata(agent) {
    const list = document.createElement('dl');
    list.className = 'agent-meta';
    const values = [
        ['Agent', agent.agent],
        ['Status', agent.status],
        ['Activity', agent.activity],
        ['Thread', agent.threadId ?? 'Not reported'],
        ['Skill', agent.skill],
    ];
    for (const [term, description] of values) {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = description;
        list.append(dt, dd);
    }
    return list;
}

function createCommandCard(command) {
    const card = document.createElement('article');
    card.className = 'command-card';
    card.dataset.commandId = command.id;
    card.dataset.active = String(commandActive(command));

    const heading = document.createElement('div');
    heading.className = 'command-heading';
    const titleGroup = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = command.title;
    const source = document.createElement('div');
    source.className = 'command-source';
    source.textContent = command.sourcePath;
    titleGroup.append(title, source);
    const status = document.createElement('span');
    status.className = 'status';
    status.dataset.status =
        command.run?.status ?? (command.available ? 'idle' : 'disabled');
    status.textContent =
        command.run?.status ?? (command.available ? 'Idle' : 'Disabled');
    heading.append(titleGroup, status);

    const description = document.createElement('p');
    description.className = 'command-description';
    description.textContent = command.description;
    const code = document.createElement('code');
    code.className = 'command-code';
    code.textContent = command.displayCommand;
    card.append(heading, description, code);

    if (!command.available) {
        const reason = document.createElement('p');
        reason.className = 'disabled-reason';
        reason.textContent = command.runtimeReason;
        card.append(reason);
    }

    if (command.run) {
        const runMeta = document.createElement('p');
        runMeta.className = 'run-meta';
        runMeta.textContent = `Started ${formatTime(command.run.startedAt)} · Ended ${formatTime(command.run.endedAt)} · Exit ${command.run.exitCode ?? '—'}`;
        card.append(runMeta);
        if (command.run.agent)
            card.append(createAgentMetadata(command.run.agent));
    }

    const actions = document.createElement('div');
    actions.className = 'command-actions';
    const selectionLabel = document.createElement('label');
    selectionLabel.className = 'command-select';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(command.id);
    checkbox.disabled =
        !command.available || !command.batchEligible || commandActive(command);
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(command.id);
        else selected.delete(command.id);
        updateToolbar();
    });
    const selectionText = document.createElement('span');
    selectionText.textContent = 'Select';
    selectionLabel.append(checkbox, selectionText);
    const actionButton = document.createElement('button');
    actionButton.className = commandActive(command)
        ? 'button button--danger'
        : 'button';
    actionButton.textContent = commandActive(command) ? 'Stop' : 'Start';
    actionButton.disabled = !command.available && !commandActive(command);
    actionButton.addEventListener('click', () =>
        commandActive(command)
            ? mutate('/api/stop', {
                  commandId: command.id,
                  runId: command.run.id,
              })
            : mutate('/api/start', {
                  selections: [
                      {
                          id: command.id,
                          sourceRevision: command.actualRevision,
                      },
                  ],
              }),
    );
    actions.append(selectionLabel, actionButton);
    card.append(actions);

    const details = document.createElement('details');
    details.className = 'log-panel';
    if (command.run) details.open = commandActive(command);
    const summary = document.createElement('summary');
    summary.textContent = 'Command log';
    const terminal = document.createElement('pre');
    terminal.className = 'terminal';
    terminal.tabIndex = 0;
    terminal.setAttribute('aria-label', `${command.title} log`);
    terminal.textContent = logText(command.run);
    details.append(summary, terminal);
    card.append(details);
    return card;
}

function render() {
    if (!panelState) return;
    groupsElement.replaceChildren();
    const categories = new Map();
    for (const command of panelState.commands) {
        if (!categories.has(command.category))
            categories.set(command.category, []);
        categories.get(command.category).push(command);
    }
    for (const [category, commands] of categories) {
        const section = document.createElement('section');
        section.className = 'command-group';
        const title = document.createElement('h2');
        title.textContent = category;
        const grid = document.createElement('div');
        grid.className = 'command-grid';
        for (const command of commands) grid.append(createCommandCard(command));
        section.append(title, grid);
        groupsElement.append(section);
    }
    groupsElement.setAttribute('aria-busy', 'false');
    catalogIssuesElement.hidden = panelState.catalogIssues.length === 0;
    catalogIssuesElement.textContent = panelState.catalogIssues.length
        ? `Catalog review required: ${panelState.catalogIssues.join(' · ')}`
        : '';
    updateToolbar();
}

async function mutate(path, body) {
    showNotice('Applying command action…');
    try {
        const response = await fetch(path, {
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                'X-Languon-Dev-Panel': '1',
            },
            method: 'POST',
        });
        const result = await response.json();
        if (!response.ok) {
            const issueText = result.issues?.map(({ commandId, reason }) =>
                commandId ? `${commandId}: ${reason}` : reason,
            );
            throw new Error(
                issueText?.join(' · ') || result.message || result.code,
            );
        }
        showNotice('Command state updated.');
    } catch (error) {
        showNotice(
            error instanceof Error ? error.message : String(error),
            'error',
        );
    }
}

selectAllElement.addEventListener('change', () => {
    if (!panelState) return;
    const compatibleIds = compatibleCommandIds(panelState.commands);
    for (const command of selectableCommands(panelState.commands)) {
        selected.delete(command.id);
    }
    if (selectAllElement.checked)
        for (const id of compatibleIds) selected.add(id);
    render();
});

runSelectedElement.addEventListener('click', () =>
    mutate('/api/start', {
        selections: panelState.commands
            .filter(({ id }) => selected.has(id))
            .map(({ actualRevision, id }) => ({
                id,
                sourceRevision: actualRevision,
            })),
    }),
);

stopAllElement.addEventListener('click', () => stopAllDialog.showModal());
stopAllDialog.addEventListener('close', () => {
    if (stopAllDialog.returnValue === 'confirm') mutate('/api/stop-all', {});
});

const eventSource = new EventSource('/api/events');
eventSource.addEventListener('open', () =>
    setConnection('connected', 'Connected'),
);
eventSource.addEventListener('snapshot', (event) => {
    panelState = JSON.parse(event.data);
    render();
});
eventSource.addEventListener('log', (event) => {
    if (!panelState) return;
    const value = JSON.parse(event.data);
    const command = panelState.commands.find(
        ({ id }) => id === value.commandId,
    );
    if (!command?.run || command.run.id !== value.runId) return;
    command.run.logs.clientBytes ??= command.run.logs.entries.reduce(
        (total, entry) => total + JSON.stringify(entry).length,
        0,
    );
    command.run.logs.entries.push(value.entry);
    command.run.logs.clientBytes =
        command.run.logs.clientBytes + JSON.stringify(value.entry).length;
    trimClientLog(command.run);
    scheduleLogRender(command.id);
});
eventSource.addEventListener('agent', (event) => {
    if (!panelState) return;
    const value = JSON.parse(event.data);
    const command = panelState.commands.find(
        ({ id }) => id === value.commandId,
    );
    if (!command?.run || command.run.id !== value.runId) return;
    command.run.agent = value.agent;
    render();
});
eventSource.addEventListener('server-warning', () =>
    showNotice(
        'A catalog source could not be refreshed. Reload or run the catalog check.',
        'error',
    ),
);
eventSource.addEventListener('error', () =>
    setConnection('disconnected', 'Reconnecting…'),
);
