# Source and evidence review

The independent reviewer examined the full feature against main, including contracts, financial admission, source lookup, worker continuation, user interface and integration coverage.

- **RV074-001.** The previous three-format scenario still depended on the removed composer toggle. It now uses the canonical typed request. Both Knowledge journeys passed together, including insertion, save and reload.
- **RV074-002.** The requested time limit initially reached the model only as prose. The plan now carries a typed duration. Script validation runs before synthesis and final assembly enforces the measured limit across all voices and pauses. Oversized recordings stay unpublished, and the card explains how to revise the plan. Real audio regressions verified the boundary.
- **RV074-003.** An expired root authority initially left a recording unable to continue. The plan now survives expiry and accepts a fresh, explicitly confirmed bounded quote. PostgreSQL, Redis and HTTP verification covered renewal and concurrent/stale commands.
- **Security review.** The actor-owned scheduler, prior-source reader, confirmation receipt and worker spending path were reviewed. Consent-only rows have zero spending authority and can transfer once under the matching owner, conversation, note and branch. Original ceiling and expiry apply. Unused consent-only rows may remain until the underlying turn is deleted. This retention is a data-minimization consideration; they cannot dispatch work. Existing worker checkpoint permissions remain an inherited trust boundary.
- **Design review.** Desktop and 360px reviews found the disclosed amount and one primary action readable. Copy was adjusted to show the credit upper bound directly. Recovery tests cover duplicate clicks and stale errors across tabs.

Final remediation review approved the feature for local merge with no remaining material findings.
