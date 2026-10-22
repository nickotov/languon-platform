# Streaming contention regression

Feature052 AC5, AC6, AC8, AC9. Base d441863, uncommitted feature patch.

The first completed load run reported777.568ms loaded admission p95, failing
AC9. Its raw JSON was subsequently overwritten by an invalid saturated run;
these historical console metrics are not reusable acceptance evidence. The
independent performance record documents that evidence loss explicitly.
Independent architecture inspection identified the global capacity lock around
all text appends and heartbeats, alongside full source authorization for SSE.
The harness also needed production5000ms heartbeat cadence and9running/91queued
streams to leave admission headroom under the normal10active provider limit.
Those fixture corrections preserve100 live subscriptions and10admissions/sec.

A real PostgreSQL regression first FAILED (12.41s run; focused test timed out
at5354ms): append could not proceed while an unrelated transaction held global
capacity plus a shared actor lifecycle fence. It did not call a provider.

The implementation now shares the existing live source/chat/turn/lease/Stop
validation in a private helper. Only append and heartbeat enter a private progress
transaction without global capacity, using actor SHARE. Public arbitrary
withOperation retains global capacity and actor UPDATE. Keeping actor UPDATE in
the private path would permit crossed shared-source deadlocks, so this option
was rejected after independent trigger/authorization audit. No financial,
publication, admission or terminal mutation uses the private path.

Heartbeat changes only lease_until/updated_at: lifecycle and overlap triggers
skip global acquisition; the capacity job projection locks its own row then
returns without changing totals; running authority checks are plain reads.
Append changes message content and writes an event, without accounting triggers.

Final command:

```sh
set -a
source /private/tmp/languon-accounting-test.env
set +a
pnpm --filter @languon/backend exec vitest run tests/integration/modules/conversations/conversation-store.test.ts --hookTimeout 120000 --testTimeout 30000
```

Passed37/37 in46.23s (test execution43.19s), session89321 exit0. Dedicated
loopback55481/languon_auth_accounting_test, current migrations through0099.
Includes crossed shared sources, Stop rejection for late append/heartbeat,
lease-expiry recovery, source archive/key/version races, account deletion/purge,
shared reads, global/actor running limits and worker persistence behavior.

The first full run exposed stale test projections after TRUNCATE (row delta
triggers do not run for TRUNCATE), causing false global capacity exhaustion.
The disposable fixture now truncates the related projections with their source
tables. Synthetic shared dictionary timestamps were also aligned to fixture time.
Production guards and limits were not changed.

This proves the concurrency regression surface, not AC9 latency. A fresh valid
quiet load run remains required. No application database was modified.
