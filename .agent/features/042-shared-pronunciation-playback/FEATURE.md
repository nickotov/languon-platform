# Shared pronunciation playback and model pricing

Status: Complete
Owner: Implementation agent
Created: 2026-10-13

## Desired behavior and approved decisions

Implement the approved conversation plan: web-first on-demand pronunciation for dictionary source/translation/examples, visible flashcard fields, sentence prompts/revealed references, saved-library previews and saved answers after completed AI checks. Authenticated owners and shared readers use the same global normalized-text cache. Kie Turbo 2.5 is the initial live adapter; fixtures avoid paid calls. Existing languages only. MinIO becomes standard local S3; production targets private Selectel.

Normalize NFC, line endings, outer whitespace and repeated horizontal whitespace, preserving case, punctuation, accents and internal line breaks. Reuse approved ready recordings before resolving current defaults. Free generation requires <=10 language-aware words AND <=100 Unicode code points. Longer uncached text requires an exact whole-text quote and confirmation. First admitted confirmed requester pays once; joiners/replays are free. Charge only successfully saved audio. Provisional speech tariff is 100 credits/1000 characters, minimum 1 credit. Admin edits speech and existing text-token rates through immutable revisions; existing text billing behavior stays unchanged.

Successful audio and normalized text persist indefinitely even after content/account deletion. User associations are erased; only audited admin removal deletes successful recordings. Admin supports text/audio previews, filters and linked/unlinked impact-confirmed deletion. Provider/model/voice setup stays code/config-owned; add a repository speech-model-configuration skill.

Already admitted generation can finish after source/account deletion. Account erasure detaches its payer and source associations and releases its outstanding reservation; later successful cache publication cannot debit the erased account. Failed and ambiguous temporary work follows the bounded plaintext-cleanup policy.

Global reuse exposes whether an exact guessed text/language already has a recording through free cached playback. This is an inherent consequence of the approved cross-user cache, including private content. No originating account, dictionary, source or cache directory is exposed to learners; administrator text search remains privileged.

## Acceptance criteria

- AC-1 — All agreed web surfaces offer accessible playback only for visible authorized saved content; references and checked answers enforce learning visibility.
- AC-2 — Normalized equivalent content reuses recordings across actors; language/case/accent/punctuation distinctions stay distinct; changed defaults preserve approved cached audio.
- AC-3 — Single-flight admission produces one provider task and one payer under concurrent actors; idempotent confirmations never double-charge.
- AC-4 — Free thresholds, exact quotes, sufficient balance and success-only settlement are enforced transactionally; timeout/failure releases prevent late debit.
- AC-5 — Kie and fixture adapters retain immutable model/voice configuration; supported-language/voice capabilities control UI; ambiguous submission never blindly retries.
- AC-6 — Private S3/MinIO integrity, durable inventory, recovery and all-version deletion work without public object URLs.
- AC-7 — Successful text/audio retention survives account/content removal while associations and private access are revoked; admin deletion is audited and impact/version checked.
- AC-8 — Admin can publish immutable character/token price revisions; Auto/explicit selection and displayed text prices agree; old work retains admitted prices.
- AC-9 — One clip plays; spinner, stop, autoplay block, errors, navigation/logout and stale selection are correctly fenced on desktop/narrow browser.
- AC-10 — Existing audio migrates without synthesis, known/unknown work preserves identity, old workers fail closed, and new admission can be disabled without breaking recovery.
- AC-11 — Model-configuration skill, metadata, operations, guides and mapped E2E are current and validated.
- AC-12 — Disposable database/storage, real-browser proof, completion/security review and concurrency test review pass; live activation evidence is explicitly separate.

## Scope and constraints

No native screens, anonymous playback, Hungarian addition, draft playback, voice cloning, automatic fallback or pre-generation. No production provisioning or paid calls. Preserve DDD/FSD, integer credit arithmetic, closed typed job accounting, private delivery and release fencing. User approved changed retention and editable pricing; successor ADRs must supersede affected existing rules rather than rewrite them.

## User-flow documentation

Create shared-pronunciation-playback guide; update dictionary-pronunciation-audio, sentence-practice-web/backend, flashcard training, ai-credit-wallet/provider-management, account/content deletion and applicable release/dev infrastructure guides. Map critical journeys to actual tests and retain current metadata only after execution.

## Open decisions

None in product scope. External activation requires configured credentials, reviewed voice/language support, provider access/terms/pricing and Selectel conformance evidence.
