import { createHash } from 'node:crypto';
import { cpus, freemem, platform, totalmem } from 'node:os';

export const PROFILE_SCHEMA_VERSION = 1;
export const DEFAULT_THRESHOLDS = Object.freeze({
    cpuPercent: 70,
    memoryPercent: 70,
    diskPercent: 70,
    errorRatePercent: 0.1,
    latencyP95Ms: 1_000,
});

export function unavailableBuildPeak() {
    return {
        buildPeakCpuPercent: null,
        buildPeakMemoryBytes: null,
        buildPeakAvailable: false,
        buildPeakUnavailableReason:
            'Docker BuildKit does not expose build-scoped CPU/RSS portably; unrelated containers are not sampled.',
    };
}

const round = (value, digits = 2) =>
    Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

export function percentile(values, percentileRank) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
    return round(sorted[Math.max(0, index)]);
}

export function parseByteSize(value) {
    if (typeof value === 'number') return value;
    const match = String(value)
        .trim()
        .match(/^([0-9.]+)\s*([kmgt]?i?b)$/i);
    if (!match) return null;
    const unit = match[2].toLowerCase();
    const powers = {
        b: 0,
        kb: 1,
        kib: 1,
        mb: 2,
        mib: 2,
        gb: 3,
        gib: 3,
        tb: 4,
        tib: 4,
    };
    const base = unit.includes('i') ? 1024 : 1000;
    return Math.round(Number(match[1]) * base ** powers[unit]);
}

export function parsePercent(value) {
    const parsed = Number.parseFloat(String(value).replace('%', ''));
    return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeContainerStats(rows) {
    return rows
        .map((row) => {
            const memory = String(row.MemUsage ?? row.memUsage ?? '').split(
                '/',
            )[0];
            return {
                service: String(
                    row.Name ?? row.name ?? row.Container ?? 'unknown',
                ),
                cpuPercent: round(parsePercent(row.CPUPerc ?? row.cpuPercent)),
                memoryBytes: parseByteSize(memory),
                memoryPercent: round(
                    parsePercent(row.MemPerc ?? row.memoryPercent),
                ),
            };
        })
        .sort((a, b) => a.service.localeCompare(b.service));
}

export function summarizeSamples(samples) {
    const services = new Map();
    for (const sample of samples) {
        for (const container of sample.containers ?? []) {
            const current = services.get(container.service) ?? {
                service: container.service,
                cpu: [],
                memory: [],
                memoryPercent: [],
            };
            if (container.cpuPercent !== null)
                current.cpu.push(container.cpuPercent);
            if (container.memoryBytes !== null)
                current.memory.push(container.memoryBytes);
            if (container.memoryPercent !== null)
                current.memoryPercent.push(container.memoryPercent);
            services.set(container.service, current);
        }
    }
    const containers = [...services.values()]
        .map((service) => ({
            service: service.service,
            cpuPeakPercent: round(Math.max(0, ...service.cpu)),
            memoryPeakBytes: Math.max(0, ...service.memory),
            memoryPeakPercent: round(Math.max(0, ...service.memoryPercent)),
        }))
        .sort((a, b) => a.service.localeCompare(b.service));
    return {
        containers,
        cpuPeakPercent: round(
            containers.reduce((sum, row) => sum + (row.cpuPeakPercent ?? 0), 0),
        ),
        memoryPeakBytes: containers.reduce(
            (sum, row) => sum + (row.memoryPeakBytes ?? 0),
            0,
        ),
        memoryPeakPercent: round(
            containers.reduce(
                (sum, row) => sum + (row.memoryPeakPercent ?? 0),
                0,
            ),
        ),
    };
}

export function summarizeLoad(samples, elapsedMs) {
    const latency = samples.map((sample) => sample.latencyMs);
    const errors = samples.filter((sample) => !sample.ok).length;
    return {
        requests: samples.length,
        errors,
        errorRatePercent: round(
            samples.length === 0 ? 100 : (errors / samples.length) * 100,
        ),
        requestsPerSecond: round(
            elapsedMs > 0 ? samples.length / (elapsedMs / 1_000) : 0,
        ),
        latencyMs: {
            p50: percentile(latency, 50),
            p95: percentile(latency, 95),
            p99: percentile(latency, 99),
            max: latency.length ? round(Math.max(...latency)) : null,
        },
    };
}

export function thresholdFlags(observation, thresholds = DEFAULT_THRESHOLDS) {
    const flags = [];
    for (const phaseName of ['idle', 'load', 'overlap']) {
        const phase = observation.runtime?.[phaseName];
        if (!phase) continue;
        if ((phase.resources?.cpuPeakPercent ?? 0) > thresholds.cpuPercent)
            flags.push(`${phaseName}.cpu`);
        if (
            (phase.resources?.memoryPeakPercent ?? 0) > thresholds.memoryPercent
        )
            flags.push(`${phaseName}.memory`);
        if ((phase.load?.errorRatePercent ?? 0) > thresholds.errorRatePercent)
            flags.push(`${phaseName}.errors`);
        if ((phase.load?.latencyMs?.p95 ?? 0) > thresholds.latencyP95Ms)
            flags.push(`${phaseName}.latency-p95`);
    }
    if ((observation.host?.diskUsedPercent ?? 0) > thresholds.diskPercent)
        flags.push('host.disk');
    return flags;
}

export function createHostFingerprint({
    dockerVersion = 'unknown',
    diskUsedPercent = null,
} = {}) {
    const cpuList = cpus();
    const memoryBucketGiB = Math.max(1, Math.round(totalmem() / 1024 ** 3));
    const comparable = {
        platform: platform(),
        architecture: process.arch,
        logicalCpuCount: cpuList.length,
        cpuModel: cpuList[0]?.model ?? 'unknown',
        memoryGiB: memoryBucketGiB,
        dockerVersion,
    };
    return {
        ...comparable,
        id: createHash('sha256')
            .update(JSON.stringify(comparable))
            .digest('hex')
            .slice(0, 16),
        memoryFreeBytesAtStart: freemem(),
        diskUsedPercent,
    };
}

export function configFingerprint(config) {
    return createHash('sha256')
        .update(JSON.stringify(config))
        .digest('hex')
        .slice(0, 16);
}

export function comparability(current, previous) {
    if (current.dirty) return { comparable: false, reason: 'dirty-worktree' };
    if (!previous)
        return { comparable: false, reason: 'no-previous-observation' };
    if (current.profileVersion !== previous.profileVersion)
        return { comparable: false, reason: 'profile-version-changed' };
    if (current.configFingerprint !== previous.configFingerprint)
        return { comparable: false, reason: 'profile-config-changed' };
    if (current.host.id !== previous.host?.id)
        return { comparable: false, reason: 'host-fingerprint-changed' };
    return { comparable: true, reason: 'same-profile-and-host' };
}

export function validateObservation(value) {
    if (!value || typeof value !== 'object')
        throw new Error('Observation must be an object');
    if (value.schemaVersion !== PROFILE_SCHEMA_VERSION)
        throw new Error(
            `Unsupported resource profile schemaVersion: ${value.schemaVersion}`,
        );
    for (const key of [
        'recordedAt',
        'revision',
        'profileVersion',
        'configFingerprint',
    ]) {
        if (typeof value[key] !== 'string' || value[key].length === 0)
            throw new Error(`Observation.${key} must be a non-empty string`);
    }
    if (!value.host?.id || typeof value.host.id !== 'string')
        throw new Error('Observation.host.id must be a string');
    if (!Array.isArray(value.builds))
        throw new Error('Observation.builds must be an array');
    if (!Array.isArray(value.flags))
        throw new Error('Observation.flags must be an array');
    return value;
}

export function appendJsonLine(existingText, observation) {
    validateObservation(observation);
    return `${existingText && !existingText.endsWith('\n') ? `${existingText}\n` : existingText}${JSON.stringify(observation)}\n`;
}
