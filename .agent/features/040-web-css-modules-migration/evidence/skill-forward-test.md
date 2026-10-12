# Skill forward test

Fresh-context shared-checkout read-only decision probe; not a comparison.

The supported account/passkey presentation is a focused improvement. ExampleID is an unresolved capability decision and cannot be included as working behavior or silently omitted while claiming complete fidelity. This is a decision-only assessment; no implementation or verification ran.

| ID | `account-v3` requirement | Local coverage / intended owner | Disposition and planned proof |
|---|---|---|---|
| UI-01 | Account and Security tabs | Shared accessible tabs composed by the account page; local coverage unspecified | Required. Verify switching, keyboard navigation, active styling and panel visibility. |
| UI-02 | Account heading, explanation, labeled name/email grid, Save | Grid and Save exist; heading, explanation and label fidelity unestablished | Required. Preserve real account updates; compare content, labels, geometry and Save states. |
| UI-03 | Security empty: shield, heading, paragraph, first-passkey CTA | Only empty CTA is established locally | Required. Complete the illustration and copy using owned presentation; exercise supported creation. |
| UI-04 | Populated security: device name, created date, last-used date, Revoke | Contracts support listing; populated UI is missing | Required. Render real contract data, preserve date semantics and verify populated/long-name fixtures. |
| UI-05 | Revoke dialog: selected device, loss-of-access explanation, Cancel, Revoke | Shared accessible dialog exists; account-specific composition is missing | Required. Verify selected-device identity, cancel without mutation, actual revoke, focus management and resulting list state. |
| UI-06 | ExampleID card: Connect label, icon, explanatory copy | No integration or approved placeholder | Unresolved. Needs an explicit product disposition; no simulated connection or self-approved omission. |
| UI-07 | Single column at 390px; two-column account details at 1280px | Existing fidelity unspecified | Required. Compare both widths, spacing, alignment, wrapping and overflow. |
| UI-08 | Continue button: approved narrow width, rounding, padding, hover and responsive full width | Supported action; supplied raw utility bundle | Required. Translate into owned CSS and exact tokens; verify action, geometry and responsive/state transitions. |

For ExampleID, the decision needed is whether to authorize a new integration feature, explicitly approve an unavailable presentation with specified copy and interaction, or approve removing the card from the delivery scope. A disabled placeholder has no current authority. Supported work can proceed independently, but UI-06 remains unresolved until that decision is made. Implementing the integration would require explicit feature authorization, including its authentication and failure semantics.

Implementation would reuse the account operations, passkey contracts, shared tabs, dialog and button primitive. Page composition stays in its owning FSD slice; shared components remain free of account business logic. It would preserve required runtime loading, validation, failure and disabled states even where the export provides no reference, identifying them as app-required additions. No backend contract, authorization policy, production dependency or prototype scaffolding change is warranted by the supplied facts.

For the button, I would inventory the whole utility bundle and resolve its actual source configuration and cascade before translating it. In particular, `md`, `rounded-xl` and `primary-hover` must not be guessed from familiar Tailwind defaults. ADR-0029 supersedes the earlier Tailwind styling requirement: the delivered component uses a meaningful class such as `styles.continueButton` in its colocated CSS Module.

The approved 347px reference width must remain exact. Reuse `--size-347` if present; otherwise define a justified exact token, `--size-347: 21.6875rem`, following ADR-0029 rather than rounding to a nearby size. Map resolved padding to exact `--space-*` tokens and rounding to the matching `--radius-*` token. Preserve `width: 100%` at the source’s resolved `md` threshold and use the accepted semantic hover color. Keep the primitive’s accessible focus and disabled behavior and wire the existing Continue action through a named handler. Do not copy the utility string, add global utilities or install Tailwind. Check primitive defaults and stylesheet ordering so they do not override the approved dimensions.

The evidence plan would:

- Identify and retain the offline `account-v3` export and supplied snippet with content identity, then associate the inventory with that selected revision. Inspect all nested/conditional source content and actual token/config declarations.
- Obtain reference rendering from the offline source through an approved local process. Compare matched reference/local states at 390px and 1280px, including Account, Security empty, Security populated and the open revoke dialog. Source text alone cannot establish visual fidelity.
- Capture populated and dialog evidence explicitly—the current facts establish neither. Compare device identity, dates, illustration, labels, control placement, widths, spacing, typography, wrapping, colors, borders, radii and relevant state transitions. Test the Continue button on both sides of the resolved breakpoint.
- Run focused existing component/interaction tests for Save, tabs, passkey creation, list updates, cancel and revoke, including relevant pending/failure behavior. Use fake local fixtures and preserve the real supported contract paths.
- Run the web styling guard, affected lint/typecheck and applicable web/catalog builds. Resolve exact commands from the repository command index before execution.
- Inspect relevant user-flow mappings; synchronize changed observable guide content and mapped tests, then run the applicable traceability checks and scoped journeys.
- Use valid real-app browser evidence, supplementing missing observations through the project’s safe browser wrapper. Record viewport, theme, locale, data state, keyboard/focus observations, console errors and unexpected failed requests.
- Record each inventory row’s final implementation, evidence and discrepancies in the improvement record. Assess independent review by the actual passkey transition and security impact; existing contracts do not excuse unsafe cancellation or revoke behavior.

Complete faithful delivery requires every required row to be implemented and evidenced, with ExampleID explicitly resolved by an authorized decision. A green build or a screenshot of the default Account tab would not establish completion.
