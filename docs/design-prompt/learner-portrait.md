---
type: design-prompt
title: Learner portrait and AI interview
status: ready-for-design
summary: Copyable Magic Patterns brief for the learner portrait, interview, manual editing, and chat controls.
source_paths:
  - .agent/features/051-learner-portrait/FEATURE.md
  - docs/learner-portrait-design.md
---

# Learner portrait and AI interview

Copy the entire portable block below into Magic Patterns. Return the generated editor URL and preferably its code export so the selected design can become the UI implementation reference.

Requirements: [feature and acceptance criteria](../../.agent/features/051-learner-portrait/FEATURE.md), [confirmed LP-01–LP-30 decisions](../learner-portrait-design.md), and [ADR-0044](../adr/0044-learner-portrait-approval-and-use-boundaries.md).

Versioned provenance and generated-design URL: [feature DESIGN.md](../../.agent/features/051-learner-portrait/DESIGN.md). The brief is v001; generated design and implementation target are awaiting the user's returned design. The backend checkpoint and its limitations are recorded in the feature evidence, separately from future UI/browser evidence.

## Portable prompt

```text
Create a polished, interactive web-app prototype for Languon’s new “Learner portrait” feature. It will become the design reference for implementation in an existing language-learning app.

Design the whole journey: entry points, introduction, guided AI interview, manual form, draft review, saved portrait management, and integration with existing learning-chat settings. Use realistic fictional content and working local state transitions. Rare states may be accessible through a separate prototype-only scenario selector outside the simulated customer interface.

PRODUCT PURPOSE

Help learners describe what they know, what they want to achieve, and how they prefer to receive explanations. Their approved portrait can personalize language-learning chats.

The central promise is: “Help us explain things in a way that works for you.”

Participation is optional. This is a learning-preference tool, with no psychological diagnosis, personality scoring, or proficiency examination. Users can create a useful partial portrait, review everything, correct it, and choose separately whether to use it in chats.

VISUAL FOUNDATION

Create a calm, thoughtful learning workspace with clear hierarchy, readable prose, restrained accents, comfortable spacing, and precise friendly copy. Reuse the existing Languon design if this project already contains it. Otherwise use:
- Inter typography.
- Light canvas #F8F9FB, white surfaces #FFFFFF, subtle surfaces #F1F3F6.
- Main text #1B1E24, secondary text #5B6472, subtle borders #E4E7EC.
- Primary action #4F46E5, hover #4338CA, soft selected background #EEF2FF.
- Dark canvas #121417, surfaces #1B1E24, raised surfaces #23262D.
- Dark main text #F8F9FB, secondary text #D0D5DD, primary accent #818CF8.
- Restrained green success, amber caution, and red destructive states.
- Spacing based on 4, 8, 12, 16, 20, 24, 32, and 48 pixels.
- Comfortable 44-pixel minimum targets, rounded controls, softly rounded cards, subtle borders, and limited shadows.

The existing app shell has Dictionaries, Texts, and Knowledge sections; an account/settings area near the bottom; a desktop sidebar approximately 240 pixels expanded or 64 pixels collapsed; and a compact mobile header with a navigation drawer. Preserve that recognizable shell. Global language and appearance preferences belong in the account/settings area.

The home/dashboard addition is a single portrait entry card. Keep the broader dashboard outside this task.

Use a focused page for the interview. On a wide desktop screen, a conversation column can sit beside a secondary draft preview. Mobile must preserve the same actions and task order, with an obvious Review portrait action rather than a cramped two-column layout.

LP-UI-01 — ENTRY POINTS AND STATUS

Show a compact home/dashboard entry card and a portrait section in profile/settings.

Represent:
1. No portrait: “Make learning feel more like you,” a short benefit description, “Start interview,” and “Fill it in myself.”
2. An unfinished interview: “Your interview is ready to continue,” Resume interview, and its actual expiry date.
3. A saved portrait with use disabled: “Saved · Not used in chats,” view/edit actions, and explicit enablement.
4. A saved portrait in use: “In use,” view/edit actions, and Update through interview.

Use clear text labels as well as color. Saved information, a pending draft, and enabled personalization are separate states.

LP-UI-02 — INTRODUCTION AND DATA EXPLANATION

Before starting the AI interview, present this content baseline:

“Let’s discover what helps you learn. This optional interview takes about 3–5 minutes. You can skip questions, pause, or review your portrait early.

We’ll ask about your languages, goals, and learning preferences—not diagnose conditions or test your ability. You’ll review everything before saving, and choose separately whether chats use your portrait.”

Display the applicable cost message:
- Paid: “AI responses use credits under your current settings.”
- Free: “This interview is currently free; it won’t use your credits.”

Also explain: “Unfinished interviews expire after 14 days of inactivity. Approving your portrait or discarding the interview removes its transcript.”

Actions: Start interview, Fill it in myself, and Back.

Include an expandable “How your information is used” section explaining:
- The interviewer uses the current interview, manual edits, and any previously approved portrait.
- It does not inspect other chats, documents, or learning activity.
- The learner reviews and saves proposed information.
- Saving and enabling use are separate actions.
- Reusable portrait information describes practical learning preferences and excludes diagnostic labels.
- Interview transcripts and working drafts are removed on approval or discard, or expire after inactivity.
- Disabling or deleting the portrait does not erase information already present in ordinary chat history.
- Manual editing, reviewing, and saving do not require an AI response.

Use understandable product language. Do not expose internal configuration, database terminology, prompts, or provider credentials.

LP-UI-03 — GUIDED INTERVIEW AND TWO INPUT TYPES

Follow a guided core with adaptive wording and useful follow-ups. Show one current question at a time.

Questions offer suggested answers, multi-select choices where appropriate, a custom-answer field, Continue/Submit, Skip, Pause, and Review portrait. Changing a selection or focusing a field should not itself send a paid AI request.

The user can also ask clarification questions or answer conversationally through the interview chat composer.

Clearly distinguish:
- Custom text for the current suggested answer: maximum 200 characters.
- Interview chat message, including clarification questions: maximum 1,000 characters.

Count user-perceived characters, including spaces and punctuation. Display live counters and clear validation. Preserve input on failure and never silently truncate text.

When the learner answers through chat, show the interviewer’s proposed compact answer of at most 200 characters as editable, reviewable information. It does not become an approved portrait fact automatically.

Example clarification:
User: “What does examples first mean?”
Interviewer: “We start with a practical sentence, then explain the rule behind it.”

Use a light topic-progress indication if useful. Topics are skippable; do not imply that every question must be answered or show a personality/completeness score. Review portrait is available early.

LP-UI-04 — CORE AND OPTIONAL INTERVIEW CONTENT

All core topics are skippable:

A. Language repertoire
- List languages the learner knows.
- Mark which languages they are currently learning.
- Give each an optional self-description: Just starting, Basic, Intermediate, Advanced, Fluent, Native, or Unsure.
- Allow a short clarification such as “I read comfortably but struggle to speak.”
- Present these as self-reported descriptions, never assessed proficiency.

B. Explanation languages
- Which languages feel comfortable for explanations?
- Are mixed-language explanations helpful?
- Example: “Mostly English, with short Spanish examples.”
- Keep interface language, languages being studied, and explanation languages distinct.

C. Goals and situations
Suggested options: Travel, Work, Exams, Everyday conversation, Personal interest, and a custom answer.

D. Communication and explanation style
Separate choices for friendly/balanced/formal tone; concise/detailed explanations; simple/balanced/academic wording; examples first/theory first/a balance. Do not assume that friendly means simple or academic means lengthy.

E. Practical learning needs
Suggested preferences include short steps, frequent recaps, clear structure, one concept at a time, and a custom answer.

Users can request useful accommodations without disclosing a condition. If someone volunteers a diagnosis, the reusable proposal should capture the confirmed practical need without the diagnostic label. A validation state can ask: “Describe what helps you learn or a concrete learning preference. Remove diagnostic labels and diagnosis statements.”

Optional deeper exploration includes hobbies/interests for relevant examples and a broad age range: Under 18, 18–34, 35–54, 55+, Prefer not to say.

Age can inform relevant examples and life context. It must not determine ability, maturity, complexity, or tone. Do not ask for a birth date or introduce age-verification/eligibility flows.

LP-UI-05 — LANGUAGE SWITCHING AND INTERVIEWER BOUNDARIES

Start in the interface language. V1 supports English, Russian, French, and Spanish interview/summary languages. Let the learner explicitly switch or ask the interviewer to switch among them.

The portrait summary uses the chosen interview language. This must not automatically alter the learner’s explanation-language preferences. Labels and controls must accommodate longer translations and multilingual language entries.

The interviewer can explain its questions, give examples of learning approaches, and help users articulate preferences. Ordinary conversation must not silently become portrait facts.

For unrelated requests, show a friendly brief redirect and offer to continue or pause. By default provide “Go to Knowledge,” linking to /knowledge for language-learning discussion. Visiting Knowledge opens the library; the learner can then start a new document with AI chat. Do not automatically create a document or transfer interview text.

LP-UI-06 — MANUAL CREATION AND EDITING

“Fill it in myself” opens a real manual alternative with the same grouped portrait items: languages and levels, explanation languages/mixing, goals, tone/style, accommodations, and optional interests/age.

Users can add, correct, or remove items. Short custom-answer fields use the 200-character limit. Do not add an unlimited system-instructions or personal-biography box.

Show a readable summary that updates immediately when items change. Manual editing and Save work without an AI call. Confirmed items are authoritative: summary corrections happen through those items, avoiding an independent editable prose version that can contradict them.

Require at least one meaningful item to save. Skipping everything produces an honest “Nothing to save yet” state, rather than an invented generic portrait.

Include validation for overly large collections or interview context, with preserved edits and clear ways to shorten answers, review the draft, or start a new interview. Such resource limits must not silently remove saved facts.

LP-UI-07 — DRAFT REVIEW, SAVE, AND ENABLEMENT

Label the review screen “Portrait draft.” Show a readable description, editable grouped items, and proposed interpretations needing review. Provide edit/remove, Continue interview, optional deeper exploration, and Save portrait.

With sufficient information, the description should be approximately 100–180 words. Sparse portraits should be shorter. Use friendly second-person wording, specific confirmed facts, and no personality judgments or filler. Large portraits can use a concise selection of complete facts while all details remain visible in the editable groups.

For an update, make additions, changes, and removals clear. The previously approved portrait remains active until Save approves the new version.

Approval and enablement are separate:
- First Save approves the portrait.
- Show the resulting saved state.
- Offer a separate explicit Use my portrait action or switch.
- Initial use stays off until enabled.
- Saving later updates preserves the existing use choice.
- Updating a disabled portrait never enables it silently.

Include saving, success, retryable failure with retained edits, sparse portrait, and nothing-meaningful-to-save states.

LP-UI-08 — SAVED PORTRAIT MANAGEMENT

The management screen contains the readable summary, grouped editable information, last-updated details, global Use my portrait switch, Edit details, Update through interview, and Delete portrait.

Returning to the interviewer begins with “What would you like to update?” Opening this update explicitly permits the interviewer to read the approved portrait even when ordinary personalization is off. It cannot approve or enable use on the learner’s behalf.

Represent both Saved · Not used in chats and In use. Keep the portrait private; do not add sharing or public publication controls.

LP-UI-09 — EXISTING LEARNING-CHAT SETTINGS

Show portrait integration in a representative dictionary/text/Knowledge chat’s settings:
- A per-chat control can exclude the portrait.
- Global off always wins. The chat cannot silently re-enable it.
- If global use is off, explain the disabled state and link to settings.
- Per-field origins read From portrait or Manual.
- Explicit requests and manual overrides take precedence.
- Existing chats preserve language, tone, and explanation settings until the learner explicitly chooses Use portrait preferences.
- New chats inherit enabled portrait preferences.
- Missing portrait preferences or disabled use fall back to manual defaults while preserving explicit chat overrides.
- Auto / Explain / Correct / Practice mode is independent.

Use short help text: “Changes apply to your next message. A response already underway keeps the settings it started with.”

When disabling use, explain: “Your portrait won’t be added to future requests. Earlier messages may still contain personal information.” Offer an easy way to start a fresh chat.

The ordinary learning-chat composer keeps its existing limits. The 1,000-character cap belongs only to the interviewer.

LP-UI-10 — PAUSE, RESUME, EXPIRY, AND CONFLICTS

One unfinished interview per account can resume across devices. Show Resume interview, Review draft, Discard interview, and the expiry date.

After 14 days without learner activity, the unfinished interview and working draft expire. Any approved portrait remains. Explain what expired and offer to start again.

Approving the portrait or discarding the interview removes its transcript and working draft. Future interviews start from the approved portrait.

Conflict scenario: the learner changes their portrait on one device, then returns to an older interview draft on another. Show “Your portrait changed elsewhere,” the latest saved information and conflicting proposals, and a review/reconcile action. Preserve the draft until resolution or expiry. Never overwrite newer approved information silently. Keep technical version numbers and raw JSON out of the UI.

LP-UI-11 — DELETION, COST, AND FAILURE STATES

Delete portrait requires destructive confirmation. Explain that it removes saved portrait information and unfinished interview/draft, disables use, and leaves ordinary chat history intact. Keep deletion distinct from disabling use.

Cover initial loading, retryable load errors, response generation with Stop, interruption, model unavailability, connection loss, invalid answer length, generic resource limits, save failure, deletion pending/success/failure, and expired-interview recovery. Preserve user edits and submitted answers when retrying is possible. Avoid retries that silently duplicate AI requests.

Paid mode can show insufficient credits and a route to the app’s existing credit settings. Free mode permits the interview without user credits. A switch from free to paid needs a new clear notice before the next paid request. Already-started responses retain the cost policy they began with.

Manual editing, review, Save, enable/disable, and Delete remain available without an AI call. Do not add a customer-visible free-interview configuration switch; the app supplies the applicable cost state.

LP-UI-12 — RESPONSIVENESS, ACCESSIBILITY, AND DEMO COVERAGE

Deliver desktop, tablet, and narrow-mobile layouts in light and dark themes. Keep all important actions reachable on mobile, including with the keyboard open. Avoid nested scrolling traps and horizontal overflow.

Use visible labels, accessible multi-select/radio groups, logical keyboard order, visible focus, error associations, non-color status indicators, sensible dialog focus restoration, comfortable touch targets, and reduced-motion-friendly transitions.

Use consistent fictional example data:
- English: native.
- Spanish: intermediate and currently learning.
- French: just starting and currently learning.
- Explanations: mainly English with short target-language examples.
- Goals: travel and workplace conversation.
- Tone/style: friendly, concise, examples first.
- Accommodations: short steps and frequent recaps.
- Interests: cooking and music.
- Optional age range: 18–34.

The description may contain only these facts and additional information explicitly entered in the prototype.

Make these scenarios demonstrable: first interview and early review; custom answer and clarification chat; chat answer becoming a compact proposal; manual creation; Save while use remains off; explicit enablement; updates preserving the use switch; per-chat exclusion and manual overrides; pause/resume/expiry; stale-draft conflict; free/paid/unavailable AI; and confirmed portrait deletion.

Build the interactive React prototype using local fictional data. No real API calls or credentials are necessary. Keep native-mobile implementation, lesson/course generation, teacher/student profiles, proficiency testing, and automatic analysis of historical chats outside this design.
```

## Design review checklist

| Brief IDs | Required coverage |
| --- | --- |
| LP-UI-01–02 | Entry states, optional introduction, truthful free/paid notice and expandable data explanation |
| LP-UI-03–05 | Guided one-question flow, options/custom answers, 200/1000 character counters, reviewable proposals, supported locales and bounded redirects |
| LP-UI-06–08 | Manual editing, consistent summary, approval/use separation and returning-user management |
| LP-UI-09 | Existing/new chat behavior, visible overrides, global/per-chat controls and history limitation |
| LP-UI-10–11 | Recovery, expiry, conflicts, deletion, charging changes and failure preservation |
| LP-UI-12 | All major interactions on desktop/mobile, keyboard accessibility and both themes |

The returned design becomes a review candidate. Its selected revision must be preserved before implementation. Prototype code is design input; production integration uses the existing shared UI and CSS Modules/token contracts. Backend checkpoint evidence does not establish UI completion or rendered fidelity.
