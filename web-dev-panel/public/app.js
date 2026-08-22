import {
    CUSTOM_SECTIONS_STORAGE_KEY,
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
} from './custom-sections.js';
import {
    compatibleCommandIds,
    sectionActiveRuns,
    sectionStartSelections,
    selectableCommands,
} from './selection.js';

const activeStatuses = new Set(['running', 'starting', 'stopping']);
const selected = new Set();
const expandedCategories = new Set();
const expandedCustomSections = new Set();
const expandedCommandPlacements = new Set();
let customSectionsDocument = emptyCustomSectionsDocument();
let panelState = null;
let pendingLogFrame = null;
let pendingRemoveSection = null;
let pendingStopSection = null;
let reportedMissingIds = '';
const pendingLogCommands = new Set();

const groupsElement = document.querySelector('#command-groups');
const customSectionsElement = document.querySelector('#custom-sections');
const customSectionsEmptyElement = document.querySelector(
    '#custom-sections-empty',
);
const customSectionLinksElement = document.querySelector(
    '#custom-section-links',
);
const sectionLinksElement = document.querySelector('#section-links');
const selectAllElement = document.querySelector('#select-all');
const selectionCountElement = document.querySelector('#selection-count');
const runSelectedElement = document.querySelector('#run-selected');
const stopAllElement = document.querySelector('#stop-all');
const stopAllDialog = document.querySelector('#stop-all-dialog');
const manageCustomSectionsElement = document.querySelector(
    '#manage-custom-sections',
);
const manageCustomSectionsInlineElement = document.querySelector(
    '#manage-custom-sections-inline',
);
const customSectionsDialog = document.querySelector('#custom-sections-dialog');
const customSectionsDialogNotice = document.querySelector(
    '#custom-sections-dialog-notice',
);
const createCustomSectionForm = document.querySelector(
    '#create-custom-section',
);
const customSectionNameElement = document.querySelector('#custom-section-name');
const customSectionsJsonElement = document.querySelector(
    '#custom-sections-json',
);
const copyCustomJsonElement = document.querySelector('#copy-custom-json');
const importCustomJsonElement = document.querySelector('#import-custom-json');
const removeCustomSectionDialog = document.querySelector(
    '#remove-custom-section-dialog',
);
const removeCustomSectionDescription = document.querySelector(
    '#remove-custom-section-description',
);
const stopCustomSectionDialog = document.querySelector(
    '#stop-custom-section-dialog',
);
const stopCustomSectionDescription = document.querySelector(
    '#stop-custom-section-description',
);
const noticeElement = document.querySelector('#notice');
const catalogIssuesElement = document.querySelector('#catalog-issues');
const preferenceIssuesElement = document.querySelector('#preference-issues');
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
    noticeElement.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}

function showManagerNotice(message, kind = 'status') {
    customSectionsDialogNotice.hidden = !message;
    customSectionsDialogNotice.textContent = message ?? '';
    customSectionsDialogNotice.classList.toggle(
        'notice--warning',
        kind === 'error',
    );
    customSectionsDialogNotice.setAttribute(
        'role',
        kind === 'error' ? 'alert' : 'status',
    );
}

function showPreferenceIssue(message) {
    preferenceIssuesElement.hidden = !message;
    preferenceIssuesElement.textContent = message ?? '';
}

function errorMessage(error) {
    if (!(error instanceof Error)) return String(error);
    const issues = error.issues
        ?.map((issue) => issue.message ?? issue.reason)
        .filter(Boolean);
    return [...new Set([error.message, ...(issues ?? [])])].join(' · ');
}

function updateToolbar() {
    if (!panelState) return;
    const selectable = selectableCommands(panelState.commands);
    const compatibleIds = new Set(compatibleCommandIds(panelState.commands));
    for (const id of [...selected]) {
        if (!selectable.some((command) => command.id === id)) {
            selected.delete(id);
        }
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

function statusText(command) {
    const status = command.missing
        ? 'missing'
        : (command.run?.status ?? (command.available ? 'idle' : 'disabled'));
    return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
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
            for (const card of document.querySelectorAll('[data-command-id]')) {
                if (card.dataset.commandId !== id) continue;
                const terminal = card.querySelector('.terminal');
                if (terminal && command?.run) {
                    terminal.textContent = logText(command.run);
                }
            }
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

function commitCustomSections(nextDocument, message) {
    try {
        saveCustomSections(localStorage, nextDocument);
        customSectionsDocument = nextDocument;
        showPreferenceIssue('');
        if (customSectionsDialog.open) {
            customSectionsJsonElement.value =
                serializeCustomSections(nextDocument);
        }
        render();
        showNotice(message);
        return true;
    } catch (error) {
        render();
        showPreferenceIssue(errorMessage(error));
        if (customSectionsDialog.open) {
            showManagerNotice(errorMessage(error), 'error');
        }
        return false;
    }
}

function updateMembership(sectionId, commandId, included) {
    try {
        const nextDocument = setSectionMembership(
            customSectionsDocument,
            sectionId,
            commandId,
            included,
        );
        const section = nextDocument.sections.find(
            ({ id }) => id === sectionId,
        );
        commitCustomSections(
            nextDocument,
            `${commandId} ${included ? 'added to' : 'removed from'} ${section.name}.`,
        );
    } catch (error) {
        showNotice(errorMessage(error), 'error');
    }
}

function createMembershipControls(command) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'quick-membership';
    const legend = document.createElement('legend');
    legend.textContent = 'Quick-access sections';
    fieldset.append(legend);

    if (customSectionsDocument.sections.length === 0) {
        const copy = document.createElement('p');
        copy.textContent =
            'Create a section to add this command to quick access.';
        const manageButton = document.createElement('button');
        manageButton.className = 'button';
        manageButton.type = 'button';
        manageButton.textContent = 'Create section';
        manageButton.addEventListener('click', openCustomSectionsManager);
        fieldset.append(copy, manageButton);
        return fieldset;
    }

    const options = document.createElement('div');
    options.className = 'quick-membership__options';
    for (const section of customSectionsDocument.sections) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = section.commandIds.includes(command.id);
        checkbox.addEventListener('change', () =>
            updateMembership(section.id, command.id, checkbox.checked),
        );
        const name = document.createElement('span');
        name.textContent = section.name;
        label.append(checkbox, name);
        options.append(label);
    }
    fieldset.append(options);
    return fieldset;
}

function createCommandCard(command, placementId) {
    const card = document.createElement('details');
    card.className = 'command-card';
    card.dataset.commandId = command.id;
    card.dataset.active = String(commandActive(command));
    card.open = expandedCommandPlacements.has(placementId);
    card.addEventListener('toggle', () => {
        if (card.open) expandedCommandPlacements.add(placementId);
        else expandedCommandPlacements.delete(placementId);
    });

    const summary = document.createElement('summary');
    const summaryCopy = document.createElement('div');
    summaryCopy.className = 'command-card__summary-copy';
    const title = document.createElement('h3');
    title.textContent = command.title;
    const description = document.createElement('p');
    description.textContent = command.description;
    summaryCopy.append(title, description);
    const status = document.createElement('span');
    status.className = 'status';
    status.dataset.status = command.missing
        ? 'missing'
        : (command.run?.status ?? (command.available ? 'idle' : 'disabled'));
    status.textContent = statusText(command);
    summary.append(summaryCopy, status);

    const body = document.createElement('div');
    body.className = 'command-card__body';
    const source = document.createElement('div');
    source.className = 'command-source';
    source.textContent = command.sourcePath;
    const code = document.createElement('code');
    code.className = 'command-code';
    code.textContent = command.displayCommand;
    body.append(source, code);

    let unavailableReasonId;
    if (!command.available) {
        unavailableReasonId = `unavailable-${placementId.replace(/[^a-z0-9]+/giu, '-')}`;
        const reason = document.createElement('div');
        reason.className = 'disabled-reason';
        reason.id = unavailableReasonId;
        const reasonLabel = document.createElement('strong');
        reasonLabel.textContent = command.missing
            ? 'Why missing'
            : 'Why unavailable';
        const reasonText = document.createElement('span');
        reasonText.textContent =
            command.runtimeReason ??
            'This command has not been approved for browser execution.';
        reason.append(reasonLabel, reasonText);
        body.append(reason);
    }

    if (command.run) {
        const runMeta = document.createElement('p');
        runMeta.className = 'run-meta';
        runMeta.textContent = `Started ${formatTime(command.run.startedAt)} · Ended ${formatTime(command.run.endedAt)} · Exit ${command.run.exitCode ?? '—'}`;
        body.append(runMeta);
        if (command.run.agent)
            body.append(createAgentMetadata(command.run.agent));
    }

    const actions = document.createElement('div');
    actions.className = 'command-actions';
    const selectionLabel = document.createElement('label');
    selectionLabel.className = 'command-select';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(command.id);
    checkbox.disabled =
        command.missing ||
        !command.available ||
        !command.batchEligible ||
        commandActive(command);
    if (unavailableReasonId) {
        checkbox.setAttribute('aria-describedby', unavailableReasonId);
    }
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(command.id);
        else selected.delete(command.id);
        render();
    });
    const selectionText = document.createElement('span');
    selectionText.textContent = 'Select';
    selectionLabel.append(checkbox, selectionText);

    const actionButton = document.createElement('button');
    actionButton.className = commandActive(command)
        ? 'button button--danger'
        : 'button';
    actionButton.textContent = commandActive(command) ? 'Stop' : 'Start';
    actionButton.disabled =
        command.missing || (!command.available && !commandActive(command));
    if (unavailableReasonId) {
        actionButton.setAttribute('aria-describedby', unavailableReasonId);
    }
    actionButton.addEventListener('click', () =>
        commandActive(command)
            ? mutate('/api/stop', {
                  commandId: command.id,
                  runId: command.run.id,
              })
            : mutate(
                  '/api/start',
                  {
                      selections: [
                          {
                              id: command.id,
                              sourceRevision: command.actualRevision,
                          },
                      ],
                  },
                  { clearSelection: true },
              ),
    );
    actions.append(selectionLabel, actionButton);
    body.append(actions, createMembershipControls(command));

    const logDetails = document.createElement('details');
    logDetails.className = 'log-panel';
    const logSummary = document.createElement('summary');
    logSummary.textContent = 'Command log';
    const terminal = document.createElement('pre');
    terminal.className = 'terminal';
    terminal.tabIndex = 0;
    terminal.setAttribute('aria-label', `${command.title} log`);
    terminal.textContent = logText(command.run);
    logDetails.append(logSummary, terminal);
    body.append(logDetails);

    card.append(summary, body);
    return card;
}

function missingCommand(commandId) {
    return {
        available: false,
        batchEligible: false,
        description:
            'This saved command ID is not present in the current reviewed catalog.',
        displayCommand: commandId,
        id: commandId,
        missing: true,
        run: null,
        runtimeReason:
            'The saved layout cannot be fully reproduced with this catalog. Remove this membership or import a compatible layout.',
        sourcePath: 'Missing from current catalog',
        title: commandId,
    };
}

function createNavigationItem({ count, id, label, onOpen }) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.textContent = label;
    const countElement = document.createElement('span');
    countElement.textContent = String(count);
    link.append(countElement);
    link.addEventListener('click', onOpen);
    item.append(link);
    return item;
}

function startCustomSection(section) {
    const { missingIds, nonBatchIds, selections, unavailable } =
        sectionStartSelections(panelState.commands, section.commandIds);
    if (missingIds.length > 0) {
        showNotice(
            `Cannot start ${section.name}: missing command IDs ${missingIds.join(', ')}.`,
            'error',
        );
        return;
    }
    if (unavailable.length > 0) {
        showNotice(
            `Cannot start ${section.name}: ${unavailable
                .map(({ id, reason }) => `${id}: ${reason}`)
                .join(' · ')}.`,
            'error',
        );
        return;
    }
    if (nonBatchIds.length > 0) {
        showNotice(
            `Cannot start ${section.name}: not eligible for section batch ${nonBatchIds.join(', ')}.`,
            'error',
        );
        return;
    }
    if (selections.length === 0) {
        showNotice(`${section.name} has no commands to start.`, 'error');
        return;
    }
    mutate('/api/start', { selections }, { clearSelection: true });
}

function requestStopCustomSection(section) {
    const runs = sectionActiveRuns(panelState.commands, section.commandIds);
    if (runs.length === 0) {
        showNotice(`${section.name} has no active commands.`, 'error');
        return;
    }
    pendingStopSection = {
        commandIds: [...section.commandIds],
        id: section.id,
        name: section.name,
        runs,
    };
    stopCustomSectionDescription.textContent = `Stop ${runs.length} active command${runs.length === 1 ? '' : 's'} in “${section.name}”? Other running commands are not affected.`;
    stopCustomSectionDialog.returnValue = '';
    stopCustomSectionDialog.showModal();
}

function requestRemoveCustomSection(section) {
    pendingRemoveSection = section;
    removeCustomSectionDescription.textContent = `Remove “${section.name}” and its ${section.commandIds.length} saved membership${section.commandIds.length === 1 ? '' : 's'}? Commands and running processes are not removed.`;
    removeCustomSectionDialog.returnValue = '';
    removeCustomSectionDialog.showModal();
}

function renderCustomSections(commandsById) {
    customSectionsElement.replaceChildren();
    customSectionLinksElement.replaceChildren();
    customSectionsEmptyElement.hidden =
        customSectionsDocument.sections.length > 0;

    for (const section of customSectionsDocument.sections) {
        const sectionId = `custom-${section.id}`;
        const group = document.createElement('section');
        group.className = 'command-group custom-command-group';
        group.id = sectionId;

        const header = document.createElement('div');
        header.className = 'custom-section-header';
        const toggle = document.createElement('button');
        toggle.className = 'custom-section-toggle';
        toggle.type = 'button';
        toggle.setAttribute(
            'aria-expanded',
            String(expandedCustomSections.has(section.id)),
        );
        const toggleTitle = document.createElement('strong');
        toggleTitle.textContent = section.name;
        const toggleCount = document.createElement('span');
        toggleCount.textContent = `${section.commandIds.length} command${section.commandIds.length === 1 ? '' : 's'}`;
        toggle.append(toggleTitle, toggleCount);

        const actions = document.createElement('div');
        actions.className = 'custom-section-actions';
        const startButton = document.createElement('button');
        startButton.className = 'button button--primary';
        startButton.type = 'button';
        startButton.textContent = 'Start all';
        startButton.disabled = section.commandIds.length === 0;
        startButton.addEventListener('click', () =>
            startCustomSection(section),
        );
        const activeRuns = sectionActiveRuns(
            panelState.commands,
            section.commandIds,
        );
        const stopButton = document.createElement('button');
        stopButton.className = 'button button--danger';
        stopButton.type = 'button';
        stopButton.textContent = 'Stop all';
        stopButton.disabled = activeRuns.length === 0;
        stopButton.addEventListener('click', () =>
            requestStopCustomSection(section),
        );
        const removeButton = document.createElement('button');
        removeButton.className = 'button';
        removeButton.type = 'button';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', () =>
            requestRemoveCustomSection(section),
        );
        actions.append(startButton, stopButton, removeButton);
        header.append(toggle, actions);

        const grid = document.createElement('div');
        grid.className = 'command-grid';
        grid.hidden = !expandedCustomSections.has(section.id);
        if (section.commandIds.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent =
                'No commands yet. Expand a catalog command and select this section.';
            grid.append(empty);
        } else {
            for (const commandId of section.commandIds) {
                const command =
                    commandsById.get(commandId) ?? missingCommand(commandId);
                grid.append(
                    createCommandCard(
                        command,
                        `custom:${section.id}:${commandId}`,
                    ),
                );
            }
        }

        toggle.addEventListener('click', () => {
            const expanded = !expandedCustomSections.has(section.id);
            if (expanded) expandedCustomSections.add(section.id);
            else expandedCustomSections.delete(section.id);
            toggle.setAttribute('aria-expanded', String(expanded));
            grid.hidden = !expanded;
        });
        group.append(header, grid);
        customSectionsElement.append(group);
        customSectionLinksElement.append(
            createNavigationItem({
                count: section.commandIds.length,
                id: sectionId,
                label: section.name,
                onOpen: () => {
                    expandedCustomSections.add(section.id);
                    toggle.setAttribute('aria-expanded', 'true');
                    grid.hidden = false;
                },
            }),
        );
    }
}

function reportStoredCatalogDrift() {
    const missing = missingCatalogCommandIds(
        customSectionsDocument,
        panelState.commands,
    );
    const signature = missing.join('\n');
    if (signature === reportedMissingIds) return;
    reportedMissingIds = signature;
    if (missing.length > 0) {
        showNotice(
            `Quick access cannot be fully reproduced: missing command IDs ${missing.join(', ')}. The saved layout was preserved.`,
            'error',
        );
    }
}

function render() {
    if (!panelState) return;
    groupsElement.replaceChildren();
    sectionLinksElement.replaceChildren();
    const commandsById = new Map(
        panelState.commands.map((command) => [command.id, command]),
    );
    renderCustomSections(commandsById);

    const categories = new Map();
    for (const command of panelState.commands) {
        if (!categories.has(command.category))
            categories.set(command.category, []);
        categories.get(command.category).push(command);
    }
    const usedSectionIds = new Set();
    for (const [category, commands] of categories) {
        const baseId = `command-section-${category
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-|-$/gu, '')}`;
        let sectionId = baseId || 'command-section-other';
        let suffix = 2;
        while (usedSectionIds.has(sectionId)) {
            sectionId = `${baseId}-${suffix}`;
            suffix += 1;
        }
        usedSectionIds.add(sectionId);

        const section = document.createElement('details');
        section.className = 'command-group';
        section.id = sectionId;
        section.open = expandedCategories.has(category);
        section.addEventListener('toggle', () => {
            if (section.open) expandedCategories.add(category);
            else expandedCategories.delete(category);
        });
        const summary = document.createElement('summary');
        const title = document.createElement('h2');
        title.textContent = category;
        const count = document.createElement('span');
        count.className = 'command-group__count';
        count.textContent = `${commands.length} command${commands.length === 1 ? '' : 's'}`;
        summary.append(title, count);
        const grid = document.createElement('div');
        grid.className = 'command-grid';
        for (const command of commands) {
            grid.append(
                createCommandCard(command, `catalog:${category}:${command.id}`),
            );
        }
        section.append(summary, grid);
        groupsElement.append(section);
        sectionLinksElement.append(
            createNavigationItem({
                count: commands.length,
                id: sectionId,
                label: category,
                onOpen: () => {
                    expandedCategories.add(category);
                    section.open = true;
                },
            }),
        );
    }
    groupsElement.setAttribute('aria-busy', 'false');
    catalogIssuesElement.hidden = panelState.catalogIssues.length === 0;
    catalogIssuesElement.textContent = panelState.catalogIssues.length
        ? `Catalog review required: ${panelState.catalogIssues.join(' · ')}`
        : '';
    updateToolbar();
    reportStoredCatalogDrift();
}

async function mutate(path, body, { clearSelection = false } = {}) {
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
                [result.message, issueText?.join(' · ')]
                    .filter(Boolean)
                    .join(' ') || result.code,
            );
        }
        if (clearSelection) {
            selected.clear();
            render();
        }
        showNotice('Command state updated.');
    } catch (error) {
        showNotice(errorMessage(error), 'error');
    }
}

function openCustomSectionsManager() {
    showManagerNotice('');
    customSectionsJsonElement.value = serializeCustomSections(
        customSectionsDocument,
    );
    customSectionsDialog.showModal();
}

selectAllElement.addEventListener('change', () => {
    if (!panelState) return;
    const compatibleIds = compatibleCommandIds(panelState.commands);
    for (const command of selectableCommands(panelState.commands)) {
        selected.delete(command.id);
    }
    if (selectAllElement.checked) {
        for (const id of compatibleIds) selected.add(id);
    }
    render();
});

runSelectedElement.addEventListener('click', () =>
    mutate(
        '/api/start',
        {
            selections: panelState.commands
                .filter(({ id }) => selected.has(id))
                .map(({ actualRevision, id }) => ({
                    id,
                    sourceRevision: actualRevision,
                })),
        },
        { clearSelection: true },
    ),
);

stopAllElement.addEventListener('click', () => {
    stopAllDialog.returnValue = '';
    stopAllDialog.showModal();
});
stopAllDialog.addEventListener('close', () => {
    if (stopAllDialog.returnValue === 'confirm') mutate('/api/stop-all', {});
});

manageCustomSectionsElement.addEventListener(
    'click',
    openCustomSectionsManager,
);
manageCustomSectionsInlineElement.addEventListener(
    'click',
    openCustomSectionsManager,
);

createCustomSectionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
        const nextDocument = createSection(
            customSectionsDocument,
            customSectionNameElement.value.trim(),
            createSectionId(),
        );
        const created = nextDocument.sections.at(-1);
        if (commitCustomSections(nextDocument, `Created ${created.name}.`)) {
            expandedCustomSections.add(created.id);
            customSectionNameElement.value = '';
            render();
            showManagerNotice(`Created ${created.name}.`);
        }
    } catch (error) {
        showManagerNotice(errorMessage(error), 'error');
    }
});

copyCustomJsonElement.addEventListener('click', async () => {
    const serialized = serializeCustomSections(customSectionsDocument);
    customSectionsJsonElement.value = serialized;
    try {
        await navigator.clipboard.writeText(serialized);
        showManagerNotice('Quick-access JSON copied.');
    } catch {
        customSectionsJsonElement.focus();
        customSectionsJsonElement.select();
        showManagerNotice(
            'Clipboard access was unavailable. Press Ctrl/Cmd+C to copy.',
        );
    }
});

importCustomJsonElement.addEventListener('click', () => {
    if (!panelState) {
        showManagerNotice(
            'Wait for the command catalog before importing.',
            'error',
        );
        return;
    }
    try {
        const imported = parseImportedCustomSections(
            customSectionsJsonElement.value,
            panelState.commands,
        );
        if (
            commitCustomSections(
                imported,
                `Imported ${imported.sections.length} quick-access section${imported.sections.length === 1 ? '' : 's'}.`,
            )
        ) {
            showManagerNotice(
                `Imported ${imported.sections.length} quick-access section${imported.sections.length === 1 ? '' : 's'}.`,
            );
        }
    } catch (error) {
        let detail = '';
        try {
            const parsed = parseCustomSections(customSectionsJsonElement.value);
            const missing = missingCatalogCommandIds(
                parsed,
                panelState.commands,
            );
            if (missing.length > 0)
                detail = ` Missing command IDs: ${missing.join(', ')}.`;
        } catch {
            // The original schema error is the useful failure in this case.
        }
        showManagerNotice(`${errorMessage(error)}${detail}`, 'error');
    }
});

removeCustomSectionDialog.addEventListener('close', () => {
    const section = pendingRemoveSection;
    pendingRemoveSection = null;
    if (!section || removeCustomSectionDialog.returnValue !== 'confirm') return;
    try {
        const nextDocument = deleteSection(customSectionsDocument, section.id);
        expandedCustomSections.delete(section.id);
        for (const placement of [...expandedCommandPlacements]) {
            if (placement.startsWith(`custom:${section.id}:`)) {
                expandedCommandPlacements.delete(placement);
            }
        }
        commitCustomSections(nextDocument, `Removed ${section.name}.`);
    } catch (error) {
        showNotice(errorMessage(error), 'error');
    }
});

stopCustomSectionDialog.addEventListener('close', () => {
    const request = pendingStopSection;
    pendingStopSection = null;
    if (!request || stopCustomSectionDialog.returnValue !== 'confirm') return;
    const section = customSectionsDocument.sections.find(
        ({ id }) => id === request.id,
    );
    const currentRuns = section
        ? sectionActiveRuns(panelState.commands, section.commandIds)
        : [];
    const membershipUnchanged =
        section &&
        section.commandIds.length === request.commandIds.length &&
        section.commandIds.every(
            (id, index) => id === request.commandIds[index],
        );
    const runsUnchanged =
        currentRuns.length === request.runs.length &&
        currentRuns.every(
            (run, index) =>
                run.commandId === request.runs[index].commandId &&
                run.runId === request.runs[index].runId,
        );
    if (!membershipUnchanged || !runsUnchanged) {
        showNotice(
            `${request.name} changed while Stop all was open. Review the current section and confirm again.`,
            'error',
        );
        return;
    }
    mutate('/api/stop-selected', { runs: currentRuns });
});

window.addEventListener('storage', (event) => {
    if (event.key !== CUSTOM_SECTIONS_STORAGE_KEY) return;
    try {
        customSectionsDocument = event.newValue
            ? parseCustomSections(event.newValue)
            : emptyCustomSectionsDocument();
        if (customSectionsDialog.open) {
            customSectionsJsonElement.value = serializeCustomSections(
                customSectionsDocument,
            );
        }
        showPreferenceIssue('');
        render();
        showNotice('Quick-access sections updated from another tab.');
    } catch (error) {
        showPreferenceIssue(
            `A quick-access update from another tab was ignored. ${errorMessage(error)}`,
        );
    }
});

try {
    customSectionsDocument = loadCustomSections(localStorage);
} catch (error) {
    customSectionsDocument = emptyCustomSectionsDocument();
    showPreferenceIssue(
        `Saved quick access could not be loaded. ${errorMessage(error)}`,
    );
}

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
    command.run.logs.clientBytes += JSON.stringify(value.entry).length;
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
