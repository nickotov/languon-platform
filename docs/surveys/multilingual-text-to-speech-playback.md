---
type: survey
title: Multilingual text-to-speech playback
research_date: 2026-10-13
summary: Russia-access provider selection, multilingual speech synthesis, shared web/mobile playback, reusable audio, and pronunciation validation.
source_paths:
    - apps/backend/src/modules/dictionaries/application/dictionary-audio-service.ts
    - apps/backend/src/modules/dictionaries/application/ports/speech-synthesis-provider.ts
    - apps/backend/src/modules/dictionaries/infrastructure/audio
    - apps/backend/src/modules/learning
    - apps/web/src/fsd/features/dictionary-audio
    - apps/web/src/fsd/features/sentence-training
    - apps/mobile/package.json
    - packages/languages/src/index.ts
---

# Multilingual text-to-speech playback

## Recommendation and evidence boundary

Use **backend cloud speech synthesis, generated on demand and cached in private
S3-compatible storage**. Web and native mobile should play the same recording.
This meets the user's priority of consistent, natural pronunciation across
platforms. Browser/device synthesis is useful for prototypes or an explicitly
chosen fallback, but should not determine the primary learning voice.

The user's 2026-10-13 update makes **access from Russia a provider-selection
requirement**. Evaluate **Zvukogram first**: it explicitly advertises operation
in Russia without VPN and Russian-card payments, and documents a synthesis API.
This is a relevant vendor commitment, not measured API uptime or a successful
Russian-origin request. Confirm its exact French/Hungarian/Turkish API voices,
their quality, and application caching rights before selection.
[Russia access statement](https://www.zvukogram.com/),
[API documentation](https://zvukogram.com/node/api/).

Keep **APIHOST** as a regional alternative to investigate and the existing
**Kie adapter** as a conditional integration candidate. **SonnaLabs** explicitly
offers Google WaveNet, but Russian-origin API access is unverified. **Eden AI**
offers Google TTS, with exact WaveNet selection and Russia eligibility unverified.
Direct Google/Azure/ElevenLabs are no longer the preferred launch routes under
this requirement. Their voices remain useful quality benchmarks where access is
permitted. Choose a validated voice per language/locale, not one assumed-best voice.

This is desk research and 2026-10-12 read-only source inspection, followed by
documentation changes and a 2026-10-13 regional-access research update.
No requests were tested from a Russian IP. No paid synthesis, listening benchmark, runtime verification, production
activation, account creation, or infrastructure provisioning occurred. Architecture
extensions below are proposals; they do not supersede accepted ADRs.

## Requirements and open decisions

Confirmed in this conversation:

- Play dictionary words/phrases and sentences in multiple learning languages,
  including French, Hungarian, and Turkish.
- Support web and native mobile; prioritize consistent, natural pronunciation.
- Investigate API synthesis, generated recordings, S3, and cross-user reuse.
- The initial brief allowed any provider and possible proxy use. The later
  request specifically prefers a provider that does not block requests from
  Russia. Prioritize a supported direct relationship and Russian-origin backend
  access; proxy availability is not evidence of regional eligibility.

Unknown: complete launch-language list, regional accents, monthly unique synthesis
volume, budget, acceptable first-play delay, offline requirements, retention,
and which private text may enter a shared cache. A proxy's processing and retention
are separate from the underlying model provider's policies.

## Russia access and intermediary comparison — updated 2026-10-13

Separate three checks: **Russian-IP API access**, **Russian-customer/business
eligibility**, and **usable payment methods**. Since synthesis runs on our backend,
its outbound IP is the request origin; a learner in Russia need not call the TTS
vendor directly. Hosting that backend abroad does not establish that a Russian
business is eligible for an account. A Russian-language site, working web editor,
or absence of a published ban does not prove all three checks pass.

| Route                                 | Published regional evidence                                                                                                                         | Suitability and unresolved questions                                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Zvukogram**                         | Explicitly says it works in Russia without VPN and accepts Russian cards. Documents a TTS API and a catalog listing French, Hungarian, and Turkish. | **First evaluation candidate.** Verify selected voices through `/voices`, exact engine identity, API reliability from the intended backend, pricing, retention, and cached cross-user application use. Exact Google WaveNet access is not established. |
| **APIHOST**                           | Documents synthesis API and Robokassa payments in Russia, including cards and SBP.                                                                  | **Regional alternative.** Payment support is relevant evidence, not a no-blocking SLA. The selected Hungarian/French/Turkish API voices and WaveNet engine are unverified here.                                                                        |
| **Kie / existing ElevenLabs adapter** | Existing integration and published TTS endpoint; reviewed terms give no explicit Russia-access assurance.                                           | **Conditional.** Confirm Russian-origin/account/payment support and how the reseller supports this use case; upstream availability cannot be inferred from an adapter or localized site.                                                               |
| **SonnaLabs / Google WaveNet**        | Explicit `google-wavenet` model; own developer API keys require a paid plan or positive PAYG balance.                                               | **Conditional WaveNet route.** Russian-IP access, customer eligibility and payment remain unverified. Its legal page was not fully readable through the research tool.                                                                                 |
| **Eden AI / Google TTS**              | Unified Google TTS access and centralized billing; terms require compliance with third-party terms.                                                 | **Conditional aggregator.** Exact WaveNet voices and all Russia checks remain unverified; intermediary billing is not an established exception to upstream terms.                                                                                      |
| **Direct ElevenLabs**                 | Official access policy explicitly lists Russia among blocked locations.                                                                             | **Does not meet direct Russian-origin access requirement.** Do not infer that a proxy changes account eligibility.                                                                                                                                     |
| **Direct Google Cloud**               | Current billing documentation says new signups for users in Russia are paused.                                                                      | **Not preferred for new Russia-based onboarding.** This statement does not prove a blanket Russian-IP synthesis block on an existing eligible account.                                                                                                 |
| **Direct Azure**                      | Microsoft's official announcement suspends new product/service sales in Russia.                                                                     | **Not preferred without eligibility confirmation.** Sales suspension is not proof of blanket Speech API IP blocking; the announcement is dated 2022 and no reversal was established in this research.                                                  |

Sources: [Zvukogram access](https://www.zvukogram.com/),
[voice catalog](https://www.zvukogram.com/rating/),
[API](https://zvukogram.com/node/api/),
[APIHOST payments](https://apihost.ru/info/faq-po-sintezu-rechi/),
[APIHOST API](https://apihost.ru/info/api-text-to-speech/),
[Kie terms](https://kie.ai/terms-of-use),
[SonnaLabs WaveNet](https://docs.sonnalabs.app/api-reference/tts-models/google-cloud/wavenet),
[SonnaLabs authentication](https://docs.sonnalabs.app/developer/authentication),
[SonnaLabs terms](https://sonnalabs.app/legal/terms-of-service),
[Eden Google integration](https://www.edenai.co/post/how-to-generate-voice-text-to-speech-using-javascript),
[Eden terms](https://www.edenai.co/terms),
[ElevenLabs restrictions](https://elevenlabs.io/docs/help-center/legal/do-you-restrict-access-to-the-service-and-platform-for-any-specific-countries),
[Google signup restriction](https://docs.cloud.google.com/billing/docs/resources/currency),
[Microsoft sales announcement](https://blogs.microsoft.com/on-the-issues/2022/03/04/microsoft-suspends-russia-sales-ukraine-conflict/).

For Zvukogram, the documented short-text method accepts up to 1,000 characters
and returns a JSON file link; the long-text method admits a task and exposes
polling. This could fit the existing immediate/pending provider port, but needs
a new adapter. Download output into our private storage rather than depending
on a vendor link. A credential-free voice-list fetch failed through the research
reader, so the visible language catalog is not claimed as executed API proof.
[Synthesis and voice-list contract](https://zvukogram.com/node/api/).

The site's commercial-use claim is promising, but does not explicitly settle
all private-text retention and cross-user cache semantics. Exact voice-family
mapping matters: names or labels such as “PRO”/“HD” do not prove WaveNet.
For SonnaLabs, API-generated files expire after 24 hours and the selected voice
determines the upstream provider; setting `ttsModel` alone is insufficient.
[SonnaLabs synthesis contract](https://docs.sonnalabs.app/api-reference/tts-models/speech-api).

Yandex SpeechKit is worth revisiting if its language catalog expands, but the
current published voices do not list French, Hungarian or Turkish. It cannot
be assumed to cover this launch-language set simply because it is a regional
cloud option. [Published voices](https://aistudio.yandex.ru/en/docs/speechkit/tts/voices).

No candidate has been verified by a live Russian-origin synthesis test here.
Zvukogram has the strongest explicit public fit among the researched options;
that supports prioritizing evaluation rather than a guarantee of permanent access.

## Existing Languon context

[Dictionary audio feature 027](../../.agent/features/027-dictionary-pronunciation-audio/FEATURE.md)
and [ADR-0020](../adr/0020-dictionary-pronunciation-audio.md) already establish
on-demand owner playback, durable synthesis jobs, replaceable provider/storage
ports, private S3 production storage, and PostgreSQL bytes in development.
Live-provider quality, terms, pricing, and Selectel compatibility remain activation
gates; local fixture tones do not pronounce arbitrary text.

Source inspection confirms:

- The provider port accepts either immediate audio or an asynchronous task.
  Existing implementations are a fixture and Kie's
  `elevenlabs/text-to-speech-turbo-2-5`; the environment schema pins that model.
  Choosing direct ElevenLabs Flash or Google/Azure requires an adapter/configuration
  change, not merely substituting a model string.
- The content fingerprint includes owner ID, card ID, field, text, and language.
  Repeat plays reuse the same saved field; **cross-card/cross-user reuse is absent**
  and explicitly excluded by ADR-0020.
- The web player already fetches authorized bytes and plays a temporary Blob URL,
  fences stale selections, and handles delayed autoplay rejection.
- No sentence speech playback was found in the inspected sentence-training,
  learning-module, and sentence-contract paths. Sentence access also includes
  shared exercises and private learner content, so dictionary owner authorization
  cannot simply be reused unchanged.
- Mobile uses Expo 57 and has neither `expo-audio` nor `expo-speech` installed.
  Existing dictionary feature records explicitly defer native dictionary playback.
- The language catalog includes `fr` and `tr`, but **does not include Hungarian
  `hu`**. Provider support alone will not make Hungarian selectable in the app.

Scoped text searches answered these literal questions; no semantic reference
exhaustiveness or running-application coverage is claimed. Adding sentence/native
playback, Hungarian catalog support, or shared asset semantics needs separately
authorized feature delivery. This survey changes no guides, APIs, or ADRs.

## Approach comparison

| Approach                           | Advantages                                                                                                      | Limitations for this app                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Browser Web Speech API             | Fast prototype; no application cloud-TTS generation bill                                                        | Available voices depend on the device. A voice may use a remote service. No common recording pipeline.              |
| Native OS speech via `expo-speech` | Simple device integration; installed local voices may allow offline speech                                      | Voice availability and quality vary; offline behavior needs device validation. iOS silent mode can suppress output. |
| Cloud TTS with cached files        | Same selected voice/audio on every platform; repeat playback avoids synthesis; centrally testable pronunciation | First miss waits for synthesis; needs spend controls, storage, authorization, and cleanup.                          |
| Self-hosted TTS                    | Control over hosting and inference; possible savings at sustained volume                                        | Model/voice/language licensing, quality, coverage, serving capacity, and operations become your responsibility.     |

Browser voice enumeration describes the current device's voices, and
`localService` distinguishes local from remote synthesis. Do not assume all
browser speech is offline or stays on-device.
[MDN voice enumeration](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices),
[local versus remote voices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService).
Expo documents voice enumeration and the physical-iOS silent-mode limitation.
[Expo speech](https://docs.expo.dev/versions/latest/sdk/speech/).

Self-hosting is a later option rather than the recommended first step. For example,
Kokoro has Apache-licensed weights, but this survey does not establish Hungarian/
Turkish production coverage or native-speaker quality. Do not equate an open
license with sufficient language support or free operating cost.
[Author's model card](https://huggingface.co/hexgrad/Kokoro-82M).

## Speech-engine comparison and conditional routes

This technical comparison retains the original engine research. It is not the
current Russia-access shortlist; apply the regional comparison above first.
OpenAI is retained only as engine background from the initial survey. No
Russia-access route through it was established in this update.

| Candidate                           | Evidence for requested languages                                                                                       | Decision-relevant qualification                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google WaveNet / Chirp 3 HD         | Catalog lists French, Hungarian, and Turkish locale-specific voices                                                    | Compare WaveNet as a cost baseline against HD naturalness; controls differ by family and locale.                                                     |
| Azure established neural TTS        | French `DeniseNeural`/`HenriNeural`, Hungarian `NoemiNeural`/`TamasNeural`, Turkish `EmelNeural`/`AhmetNeural`         | Strong documented SSML/phoneme/lexicon controls; inspect the exact voice rather than assuming all newer HD models behave the same.                   |
| ElevenLabs directly                 | Flash v2.5 and newer v3/v4 families list all three languages; Multilingual v2 lists French/Turkish but omits Hungarian | Explicit language and an appropriate accent matter. Published expressiveness/latency are vendor claims, not pronunciation scores.                    |
| Existing Kie / ElevenLabs Turbo 2.5 | Existing adapter's underlying Turbo 2.5 family lists all three; Kie exposes language enforcement                       | Lowest integration change. Task queue, actual model availability, end-to-end delay, exact pricing, and reseller rights/retention require validation. |
| OpenAI TTS                          | TTS guide lists French, Hungarian, and Turkish                                                                         | Benchmark alternative; built-in voices are optimized for English, so broad language support is insufficient proof of learning-quality pronunciation. |

Sources: [Google voice catalog](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types?hl=en),
[Azure voice catalog](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts),
[ElevenLabs model matrix](https://elevenlabs.io/docs/overview/models),
[Kie TTS interface](https://kie.ai/elevenlabs-tts),
[OpenAI TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech).

ElevenLabs now labels Turbo 2.5 deprecated and recommends its equivalent, faster
Flash family. This does not prove that Kie removed its Turbo endpoint. Preserve
existing cached recordings and validate a replacement instead of changing the
configured model without adapter support. The direct provider offers newer
families, but their superiority on these learning inputs is unmeasured.
[Model lifecycle](https://elevenlabs.io/docs/overview/models).

Google's current Chirp 3 page documents Preview synchronous SSML and pace
controls, while its general catalog retains an older no-SSML/rate statement.
Hungarian is excluded from Chirp custom-pronunciation and pause controls.
Treat the model-specific documentation and a tested API configuration as the
decision boundary; do not promise identical controls for every language.
[Chirp controls](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd).
Azure documents pronunciation overrides and locale-specific phonetic alphabets.
[Azure pronunciation controls](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation),
[phonetic sets](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets).

## Proposed playback and synthesis flow

1. User presses Play. Backend resolves authorized current text and its learning
   language; never infer language from the interface locale or a short word alone.
2. Check its existing valid audio binding first. A cache hit needs no TTS call.
3. On a miss, reserve spend/capacity and admit one job for the same rendition.
   Concurrent requests should join that work rather than cause duplicate charges.
4. Generate through the selected provider, validate the output, and copy it to
   private application storage. Provider result URLs are not permanent storage.
5. Serve authorized bytes to the platform player. Show preparing/retry/unsupported
   states; canceling playback must prevent late responses from starting old audio.

Use a compatible compressed format such as MP3 after validating actual provider
output on supported browsers and devices. Existing web bearer-fetch/Blob playback
can remain. For Expo 57, `expo-audio` supports remote sources, request headers,
and audio-session/silent-mode configuration. Native playback needs real iOS and
Android evidence; mobile-browser tests do not prove it.
[Expo 57 audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/).

Start with on-demand synthesis; optionally pre-generate a small curated common
vocabulary after usage data justifies it. Do not generate every unused dictionary
item on import. Slow playback can reuse normal audio, with pitch preservation
validated on each platform; separately synthesized slow speech is a distinct
rendition. Storage can be Selectel or another S3-compatible service independently
of the speech vendor.

## Can two users reuse one recording?

**Yes, technically, when the complete synthesis input is equivalent and the
provider's output rights permit it.** Generate once and attach authorized
content bindings to one immutable rendition. Provider synthesis is paid once
per newly generated rendition; subsequent plays still incur delivery/request costs.

A proposed shared rendition identity should include:

```text
text + language/locale + pronunciation/context
     + provider/model/version + voice
     + synthesis settings + output format + pronunciation-rules version
```

Hash/HMAC a structured, versioned representation on the server. Use opaque object
keys, not raw words or sentences. Keep authorization separate from content identity:
knowing an asset key must not grant audio access. Binding-first lookup should
preserve a valid recording when provider defaults change.

Normalize conservatively, for example Unicode NFC. Preserve accents, punctuation,
and case; generic lowercasing is particularly unsafe for Turkish `I`, `İ`, `ı`,
and `i`. Different locales, voices, rates, meanings, or supplied pronunciation
context must not accidentally collide. Isolated French `fils` or `plus` can require
context; a technically identical written word is not always the same intended
pronunciation. Do not concatenate word clips to synthesize natural sentences.

For an initial sharing extension, prefer app-owned curated/public learning text.
Keep arbitrary private sentences scoped until retention and sharing semantics are
decided. A digest alone does not anonymize predictable text. Avoid exposing
cross-user cache-hit/existence metadata. Deleting one binding must not erase
another authorized user's asset; orphan deletion, owner purge, and raw text
snapshots need explicit treatment. This requires revisiting ADR-0020 through an
approved follow-up, not removing `ownerId` from the current fingerprint.

Google expressly permits generated files in applications, subject to its terms.
Microsoft's Product Terms grant paid-tier prebuilt-neural TTS output use including
commercial use. ElevenLabs describes commercial rights for paid-plan non-Beta
output. These support evaluating stored application audio, but do not establish
every redistribution use case or confer direct-provider rights through Kie.
[Google output use](https://docs.cloud.google.com/text-to-speech/docs/basics),
[Microsoft Product Terms](https://www.microsoft.com/licensing/terms/en-US/productoffering/MicrosoftAzure/allprograms),
[ElevenLabs commercial use](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform).
Do not seed commercial production assets from an unverified free-tier license.

## Costs and data handling

The following direct-engine rates were observed on **2026-10-12** and were not
refreshed as part of the regional-access update. They exclude taxes, storage,
delivery, free allowances, subscriptions, and discounts, and **are not reseller
price quotes**:

| Candidate                     | Published generation unit/rate                  | Limitation                                                                                                                 |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Google WaveNet                | $4 per million characters                       | Current rate differs from older $16/M references.                                                                          |
| Google Chirp 3 HD             | $30 per million characters                      | Model-specific language/control coverage still needs testing.                                                              |
| ElevenLabs direct Flash/Turbo | $0.04 per 1,000 characters, equivalent to $40/M | Pricing page also has subscription allowances and other model promotions; recheck the selected paid plan.                  |
| Azure neural                  | Per million characters                          | Paid regional dollar amounts rendered as placeholders; no verified numeric quote.                                          |
| Kie Turbo 2.5                 | Exact model-specific rate unverified            | Its page displays $0.06/1,000 for **Multilingual v2**; do not reuse that quote for Turbo.                                  |
| OpenAI TTS                    | Consult selected model's billing units          | No numeric quote established in this survey; avoid comparing token/audio-duration pricing directly with character pricing. |

Sources: [Google pricing](https://cloud.google.com/text-to-speech/pricing),
[ElevenLabs API pricing](https://elevenlabs.io/pricing/api),
[Azure pricing](https://azure.microsoft.com/en-us/pricing/details/speech/),
[Kie displayed pricing](https://kie.ai/elevenlabs-tts),
[OpenAI pricing](https://developers.openai.com/api/docs/pricing).

No comparable model-specific launch price for Zvukogram, APIHOST, SonnaLabs or
Eden AI was established in this update. Obtain the selected API voice/plan rate;
do not budget these routes using Google's direct rate.

Illustration, not a usage forecast: **100,000 new clips × 30 characters = 3M
characters**. At the listed marginal rates this is $12 WaveNet, $90 Chirp HD,
or $120 direct Flash/Turbo before the exclusions above. Cached replays do not
add synthesized characters. Model/language billing rules and multiple renditions
change the total. For 100,000 plays with 95% existing-cache hits and 30 characters
per miss, new synthesis would instead be 150,000 characters, assuming no retries
or duplicate misses.

Storage example: five seconds at 64 kbit/s is about 40 kB; 100,000 such recordings
are about 4 GB decimal before overhead. One million such deliveries transfer
about 40 GB. Storage and egress rates depend on the selected host/CDN; no S3 or
Selectel dollar quote was established here. These are arithmetic assumptions,
not measured file sizes or language duration estimates.

Google says Cloud TTS does not log customer text/audio; Azure says prebuilt-neural
input/output are absent from Microsoft logs. ElevenLabs documents default data
retention and selective Enterprise zero-retention capability. None of these
statements validates a reseller/proxy's policy. S3 location, TTS processing
location, and provider retention are separate; erasing our object is not proof
of upstream erasure.
[Google logging](https://docs.cloud.google.com/text-to-speech/docs/data-logging),
[Azure privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security),
[ElevenLabs retention](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode).

## Bounded validation before choosing a provider

Start with an **access and commercial-fit gate**: confirm the intended Russian
request origin and customer/business location are supported, identify a usable
payment method, and obtain exact voice/model rates and output-use terms. Then
verify authentication, voice enumeration, synthesis and download from the intended
Russian backend using synthetic content. Test the actual selected voices, not
only the website or a generic endpoint. Record origin, date, model and failures
without personal data or credentials. Published commitments and successful tests
are separate evidence. No account, outreach or paid test occurred in this update.

Use 30 synthetic inputs per language: ten isolated words, ten phrases, ten
sentences. Include French liaison/context-sensitive words; Hungarian vowel
length/diacritics; Turkish dotted/dotless letters; numbers, abbreviations,
questions, and deliberately mixed-language examples. Native reviewers should
confirm both expected reading and acceptable locale before scoring clips.

Compare selected **Zvukogram** voices first, then a qualified APIHOST, Kie or
SonnaLabs route if it passes the access gate and covers the languages. If exact
WaveNet is required, verify the upstream voice IDs explicitly; this was confirmed
as a documented SonnaLabs offering, not as a Russia-qualified service. Direct
Google/Azure samples can be optional benchmarks through eligible access rather
than launch dependencies. Score lexical accuracy, stress, naturalness, unwanted
accent, exact wording, clipping, first-play latency, failure rate, and actual
billed units. Documentation alone cannot rank them.

Proposed pass condition: no material misreadings in the launch set, acceptable
naturalness to native reviewers, and user-agreed latency/cost limits. Expand the
sample before broader language claims. Distinguish provider latency from full
queue/synthesis/storage/client time. A 3-language × 30-input × 4-profile first
round is 360 recordings; at an assumed 60 characters each, input totals 21,600
characters, distributed across providers, before retries/minimum plans.

Then verify commercial access/rights, processing/retention, storage round trip,
concurrent cache misses, edits, deletion, provider outages, web autoplay, and
native interruptions. Paid experiments need explicit authorization; none ran here.
Keep the existing provider/storage architecture. Select a route that passes the
Russia-access gate, then validated voices, then sentence/mobile and shared-cache
delivery scopes. Speech assessment of a learner's recording remains
a separate problem covered by the [voice-assessment survey](./voice-answers-pronunciation-assessment.md).

## Research updates

- **2026-10-12:** Initial engine/platform/cache survey and source inspection;
  original Google/Azure-led recommendation and direct-engine cost observations.
- **2026-10-13:** User requested preference for a provider that does not block
  requests from Russia. Revised recommendation to prioritize Zvukogram's explicit
  Russia-support claim; added APIHOST, intermediary WaveNet/Google routes,
  regional policy evidence and the access gate. Preserved earlier engine research
  as background. No Russian-origin reachability or paid speech quality measured.
