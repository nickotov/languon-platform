# Review: Settings credit balance and focused AI interfaces

Reviewed: 2026-10-25
Reviewer: settings_credit_ui_review; credit_balance_security
Verdict: Approved after expanded completion and security remediation review

## Review boundary

Initial removal review covered base2437617 through captured tracked patch
115662bf58c050e32e75781314e8d08d3960acd2351b59831a308196e1bb9055 and original
improvement record89cbd8a637799916914d78f8253d6fb913d36bb274c9e382e7f99968ac32263b.
Expanded review adds the explicitly approved self balance endpoint and Settings UI.
No separate tester required: existing harness, focused read-only API, no new distributed
coordination or unresolved financial concurrency behavior. Security review required.

## Findings

- SETTINGS-CREDIT-001 (Medium): Settings Credits was a placeholder; removing balances
  elsewhere leaves no actual balance view. User authorized new endpoint/UI. Implementation
  now exists; closed after API isolation tests and real Settings browser proof.
- Initial removal review found no other material source issues: exact financial
  admission/consent/continuation controls preserved; progress/errors remain.
- Sentence/speech real browser verification requested; passed in the owned four-case proof.

## Completion audit and final verdict

Expanded completion reviewer assessed the full current patch including the new
contract/API/Settings UI and untracked files. No open source findings. All ACs have
scoped evidence. Security reviewer closed SEC-053-1 (Medium): original balance reader
waited on an exclusive owner advisory lock and could amplify connection-pool waits.
Remediation reads canonical readSummary under REPEATABLE READ, READ ONLY, with250ms
lock and2s statement timeouts. Real PostgreSQL regression holds a writer lock and
uncommitted grant while the authenticated read returns prior committed15.125 credits
within1second; rollback leaves the balance unchanged. Final composition hash
cbe95cf5b3668427e7af2dbf6e1be5de86469b2b14ac29de839b3eea9e1434d3; test hash
532f267ab1665872fb128108edcca167024445020874b05650d9b6e4000d2e17.

Security review verified signed self identity plus active session, strict query,
owner-scoped parameterized reads, private/no-store transport, owner-scoped client
cache and signout handling, sanitized errors and no fabricated zero/providerUSD.
No ledger mutation or charging policy change. No required separate tester: existing
harness, no new complex orchestration or unresolved concurrency after targeted DBproof.

Final verdict: no unresolved material findings. Explicit residual limit: one unrelated
unchanged workspace-passage unit failure remains documented; deterministic browser
proof does not establish live provider health. No paid calls or normal development
data changes were performed. Final review boundary is the final implementation commit.

Final expanded completion boundary before local Git integration: base2437617,
tracked patch SHA-256fa8ae9a7bb9ac4110e35248a984bc1494ba02ace6473caa40cdb2b404681319e;
untracked feature-file manifest SHA-2567bef6c11bf36753be60d6bc5e77ccef25ebfe9ac61596eeefda66e588aa270a1.
Reviewer verdict: Approved, no unresolved material findings.
