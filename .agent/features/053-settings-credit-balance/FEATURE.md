# Settings credit balance and focused AI interfaces

Status: Complete
Owner: Root
Created: 2026-10-25

## Problem and desired behavior

Passive credit maxima, charges, reservations and usage panels clutter dictionary,
texts, Knowledge, chat, practice and interview screens. Remove these displays and
show the actual available learner balance in Settings → Credits. That tab was only
a placeholder, so the user explicitly authorized the small balance API feature.

## Acceptance criteria

- AC-1: Learning surfaces contain no passive budget, credit balance, spending or
  usage panels, including inline chat model/turn displays. Remove obsolete slots.
- AC-2: Settings Credits reads the authenticated learner's actual available credits,
  formats exact fractional amounts without showing a nonzero value as zero, supports
  limited zero and unlimited accounts, and has clear loading/error/retry states.
- AC-3: Balance reads cannot select another owner or mutate financial state. Reuse
  canonical wallet rules for holds/expiry. No provider currency/cost data is exposed.
- AC-4: Explicit paid/reduced-allowance confirmations, financial admission/settlement,
  insufficient-credit errors, Stop/reconnect/retry and user content remain functional.
- AC-5: Relevant real deterministic browser journeys, scoped checks, guide mappings,
  independent completion review and security review pass with honest limitations.

## Scope and constraints

Web UI removal, one read-only authenticated endpoint, shared response schema and
Settings Credits panel. No new purchases, transaction history, grants, schema changes,
provider calls or accounting policy. Existing Settings budget controls remain.
The user's newer presentation request overrides ADR-0045 passive in-chat disclosures;
its financial invariants remain. Reuse existing authentication/DDD/FSD and wallet seams.

## User-flow documentation

Update magic-profile-page plus seven existing accounting/generation guides and their
mapped tests. Reuse critical registry journeys and guarded sentence/speech fixtures.
Existing profile scenario also verifies actual balance. No new design artifact needed.

## Open decisions

None. Display available balance only; history placeholders do not claim real history.
