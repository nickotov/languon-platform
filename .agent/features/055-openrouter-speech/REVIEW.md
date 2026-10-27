# Review: OpenRouter speech generation and local activation

Reviewed: 2026-10-27
Verdict: Approved; all acceptance criteria verified

## Review boundary

Independent initial correctness review by speech_completion_review against
base29d5e0f, tracked patch8c68c8a81f404f42fa11a8c6aef18611cbe2b34a
(excluding transient generated next-env.d.ts), plus untracked feature files.
Independent security review by speech_security_review covers provider egress,
credentials, saved/shared source trust, audio integrity and financial boundaries.
Separate speech_evidence_audit tester assesses production composition and guide
coverage; it does not claim to have rerun tests. Final remediation scope follows.

## Findings and disposition

- R-1 High: original60sec worker lease cannot safely cover45sec synthesis plus
  existing20sec S3 storage. Renew the fenced lease on entering storing; verify
  slow success across original expiry, concurrent reclaim and stale-owner denial.
  Fixed with fresh60sec lease under unchanged token/unexpired guards. RealPG
  suite8/8 includes blocked real storage across original expiry, concurrent claim
  denial and expired/replaced owner rejection. Independent narrow remediation
  review passed with no material findings.
- R-2 Low: critical browser runner temporarily changes generated next-env.d.ts.
  Fixed: restored checked-in declaration after all runners finished; file absent
  from final diff.
- ORS-SEC-1 Medium: Eleven v4 interprets bracketed source text as audio tags.
  Fixed: reject every paired square-bracket form before provider dispatch, including
  unknown/multiline/nested tags. Adapter73unitcases pass; independent focused
  security re-review closed finding. Shared-source normalization cannot bypass
  adapter guard. No unrelated source/API contract change.
- T-1 High evidence gap: circuit writes are not implemented for existing speech.
  Explicitly N/A for this additive adapter: speech has no circuit, so this work
  does not invent one or claim circuit coverage. Existing failure persistence,
  operator/Free quota/capacity limits and no automatic retry remain; dictionary
  circuit tests stay mandatory and unchanged.
- T-2 Medium: missing Free failure case. Fixed with realPG Free ambiguous transport
  failure, no customer hold/charge, unknown provider expense and no resubmission.
- T-3 Mapped browser command covers ten guide scenarios, while new critical speech
  entry covers only four. Fixed: all10 mapped cases pass across7web+3admin,
  helper-only delta and evidence reuse independently approved (E-14).
- T-4 Fixed: final18-file source manifest E-14; only unreachable admin fixture
  helper changed after the full-critical freeze. Exact delta and reuse reviewed.

## Residual activation constraints

Provider routing flags do not establish account-wide OpenRouter input/output
logging, caching or observability settings. Operations guide explicitly requires
operator verification before learner content. Synthetic smoke proves connectivity,
not account privacy or pronunciation quality. Published calculated provider cost
is not an invoice reconciliation. Executable adapter receives a worker-only key;
this does not imply process-level key isolation from existing text-AI API code.

## Final remediation verdict

Lease/security/test remediation independently approved. Full critical, all mapped
cases, final source checks/build and generated-file hygiene pass. Local restart and live learner API proof subsequently completed (E-17).

Final bounded test-only remediation review: PASS. Exact dictionary suite setup
hook now30sec for full schema reset,110 migrations and legacy routing fixture;
all14 test bodies, product deadlines and assertions unchanged. Focused14/14pass.
Both browser helper locators target exact New dictionary under main; downstream
assertions unchanged. Independent reviewer found no material issues. Final
backend stage and mapped-case evidence subsequently passed (E-12/E-14).

Final helper-only remediation review: PASS, no material findings. Test target
guards unchanged; missing fixture provider price/operator budgets only; no grants
or customer tariffs/policy. Admin3/3pass. Separate tester approved reuse of E-12
and7web cases because helper is reachable only from3mapped admin cases. Aggregate
map10/10, full critical416backend+20browser pass. Final source hash E-14.
Implementation findings resolved; final build passes (E-16). User restart and live learner-API proof subsequently passed (E-17).

R-3 Low startup initialization risk: fixed with120sec initializer deadline,
finally-cleared timer and existing owned-tree cleanup. Native15/15 and independent
focused timeout regression pass; remediation review approved with no material
findings. Ordering, failure handling, redaction and infrastructure preservation
confirmed. Complete critical remains valid because dev-all is not invoked there.
User restart and live learner API now prove actual provider profile, persisted
private playable audio, Free settlement, estimated expense and cache reuse.
Final verdict: Approved. All material findings resolved; account-wide privacy
settings/listening quality/invoice reconciliation remain explicitly outside the
synthetic local proof, not claimed as verified production properties.
