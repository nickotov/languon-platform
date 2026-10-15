# Texts completion correctness and source-fidelity review

Date: 2026-10-16. Mode: initial completion review, with prior backend/API checkpoint reuse. Verdict: **Approved** after bounded remediation and final real-app verification. Initial findings and their closure history are retained below.

## Boundary and evidence

Base `664198fee9eb1a0492134c43de9a9d04835568af`; feature/texts working tree, including untracked files. Read applicable root/web instructions, code-review/testing/ui-ux-composition/search skills, FEATURE/EXEC_PLAN/EVIDENCE/REVIEW/DESIGN and linked prior reviews. Independently traced owner library/folder/workspace, public/copy/auth continuation, selection/context/collection concurrency and matching/mobile execution paths, metadata projections, atomic copy and idempotent creation deltas, related tests and source inventory UI-01–UI-40. Reference is pinned v003 supplied component source; no reference screenshot or pixel-fidelity claim is made.

Independently compared backend-verified.sha256: 85 entries unchanged; ten changed entries comprise content store/port/service/routes, content/journey tests, contracts/tests, root package and guide checker. Reused exact unchanged reviewed backend implementation rather than restarting its completed concurrency/security audit. Changed metadata/copy/create paths were inspected directly: owner metadata is projected separately, public documents omit owner share state, new destination creation and copy share one transaction, owner operation locks/fingerprints serialize replay, and public copy validates source authority before new writes. Existing DB14/contracts100 evidence is relevant; no redundant expensive DB rerun required.

Author preflight evidence assessed: web629, contracts100, content DB14, API5/browser3, affected lint/types/styles/builds, plus strengthened multiparagraph regression that found and repaired structural whitespace. Final stronger browser rerun was still in progress during initial audit. Tests use real local app/auth/PostgreSQL/Redis with deterministic external AI/email, without browser API interception. The scoped source has substantive tests; the issues below concern missing cases, not an insufficient overall harness.

## Findings

### UI-CR-01 — High — private workspace cache crosses account identity

Location: `apps/web/src/fsd/pages/texts/hooks/use-text-workspace-data.ts` query keys and `use-text-workspace.ts` adoption cache write; `workspace-page.tsx` controller identity.

The private text/folder queries originally used `['text', textId]` and `['texts-workspace-folder', folderId]`. AuthProvider retains one QueryClient across sign-out/sign-in, with 30-second freshness, and does not clear it. Reopening a prior user's known workspace as another account can adopt cached private content without a fresh authorized request. Local controller state also needs account fencing on direct account transition.

Impact: prior owner's private source/translation and folder metadata can be displayed to the next signed-in account. Fix: include user identity in every private workspace query and cache write and remount/fence the controller on user identity. Closure requires a same-QueryClient A-to-B regression and identity transition state check. Status: **Closed after bounded remediation review below.**

### UI-CR-02 — Medium — successful public copy leaves fresh destination caches stale

Location: `apps/web/src/fsd/pages/texts/hooks/use-shared-text-copy.ts`, before `onDone`.

Copy success does not invalidate account-scoped Texts library/folder/destination queries. Seed a fresh library cache, copy into a new folder, then immediately follow the success Open folder link: folder-page resolves folder identity through the still-fresh cached library and shows Folder not found. Copy to an existing folder similarly leaves its list/counts stale.

Fix: invalidate the correct account's Texts queries before reporting success; preserve operation replay on ambiguous errors. Closure requires fresh seeded library/folder/destination caches invalidated before onDone. Status: **Closed after bounded remediation review below.**

### UI-CR-03 — Medium — editing during a pending save loses later input

Location: `apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-pair-editor.tsx`, `workspace-compose.tsx`, `workspace-languages.tsx`, and save/adopt path.

Editable fields remain enabled while saving. Save captures input/pairs, awaits persistence, then adopt(saved) replaces editor state with that earlier submission. Additional typing during a slow draft save is overwritten; pair save returns to read mode and loses the intervening edits.

Fix: disable all mutating editor controls for the saving interval, or retain newer input with a generation fence. Closure requires delayed-save coverage for compose/pair/language controls and preserved submitted values. Status: **Closed after bounded remediation review below.**

### UI-CR-04 — Medium — missing supplied job-error recovery controls

Location: `apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-banners.tsx`; reference `designs/texts/v003/source/components/workspace/JobErrorAlert.tsx`, inventory UI-20.

Reference failure alerts provide dismissal, and capacity failure offers Shorten the text alongside model recovery. Runtime failure section has retry and Preferences recovery but neither dismissal nor shortening action. The user explicitly requires supplied buttons/controls and UI-20 promises retry/dismiss, so these omissions need implementation or an explicit material-deviation decision. Retry already has the required RefreshCw icon.

Fix: dismiss clears the failed job/error while preserving draft/saved text; capacity recovery returns/focuses the editable source where applicable. Test dismissal and source-edit recovery. Status: **Closed after bounded remediation review below.**

## Coverage and limitations

Source-based comparison supports screen hierarchy, component geometry, paired reading, library/folder menus and metadata, share/revoke, real auth and atomic-copy adaptations, collection desktop/mobile flows and four-locale wiring. Primitive implementation can legitimately differ from empty inherited reference placeholders. Root preflight includes real responsive/control evidence; this reviewer has not independently produced screenshots or repeated its expensive journeys. Approval is withheld for the four concrete issues above and the pending stronger final browser evidence. No production file was modified by this reviewer.

## Independently captured source identity

The following exact working-tree manifest was independently captured while owners began bounded fixes; it is an audit snapshot, not an assertion that subsequent edits remain reviewed. It excludes feature artifacts. 232 files; SHA256 of the newline-terminated manifest: `b656f8f88d0bdfa00ca661d8a28638285a7c4dc99907622ffd7908f6fe6fbf04`.

```text
de1639a66fa4c3dee1a68336869c8a036ca6db284a04e11035d7050225fc0517  .env.example
9fa06e25e2546ebd6329215fff761c050517119d146d5e3bb9bf9597e184ce36  README.md
2d98f02123216f19f5ae7d068268739fa66bdde5bf3e86ce5e9a3e318cb95925  apps/backend/drizzle/0063_wet_ronan.sql
1214f0b31657b67e0de72a6d049d57ad2cdf29e633364662890edd3887bc1bd2  apps/backend/drizzle/0064_texts_execution_and_credit_guards.sql
61aaf5a243c474ccea0d7cc1f5ffb30d1196ef062a323a04c3333cdf813b7bb0  apps/backend/drizzle/0065_unique_tiger_shark.sql
4e4d87f6428401f306172233a596e19d819f68a800008973d02a9efb4b42ef0d  apps/backend/drizzle/0066_flowery_kat_farrell.sql
2a5a1944add5defd60b401e33a0b2bb04524bbcac0d6140332be0bf5db736a85  apps/backend/drizzle/0067_tiresome_secret_warriors.sql
2004df837b72e7a455cf23db3da463cca10b7eaf178565cfe92643c9f684ecb3  apps/backend/drizzle/meta/0063_snapshot.json
c3d4716da96035d4b06b6a4459c124d4bd3205071bf674a0d9ea30e5402cb980  apps/backend/drizzle/meta/0064_snapshot.json
fc01362f377ab60bb549fa7edcc3cfda74850f8f71d5664a3044a96fdc6ddcef  apps/backend/drizzle/meta/0065_snapshot.json
e53b852469fc5116a04fbae57f9cd1d3aa0faf73f60bd665918ab37408f3698a  apps/backend/drizzle/meta/0066_snapshot.json
005bfebfde7ee229b14f3ed60d75130ebbb7b32a63eef8c1f1e81266cabd4f9a  apps/backend/drizzle/meta/0067_snapshot.json
eb46ea44d50a1efc807e9593cc43fb76816049d79bcd13a5fd04498d5d9d8f71  apps/backend/drizzle/meta/_journal.json
5209af0eb334daa1fd79461aa427213d75ea39c09e6cc2bc7b72abf9937bf323  apps/backend/src/app.ts
a230fbe46ef51157ba1616cf24629526274f10d465c6de142c0e00066324df4c  apps/backend/src/index.ts
73b22ccfa523957db45c811ad715b0e7186b84eea5a319395b089a2ab5114ddf  apps/backend/src/infrastructure/database/schema.ts
0a95d56ad77198273afd440db4c74ee08faf4e4291a2ce533919e19512423a56  apps/backend/src/infrastructure/text-ai/text-ai-capacity.ts
f0229b3b40a250bc3ea4063857b49c469319d3c59ca73396d202e50b897531a7  apps/backend/src/infrastructure/worker/dictionary-worker-command.ts
fe1a11277993b7fdc36b77b2f89b3ff4051c64902f10df2339c453f10fcf5364  apps/backend/src/infrastructure/worker/dictionary-worker-runtime.ts
5676dffb072b184b567b3ff162857435d34263137216844e15d0893a4ca04b90  apps/backend/src/mastra/composition.ts
5111bddd00eb9c600c5fa3be05d1312b0218a690e04ba0ad31d1c9938baef4e6  apps/backend/src/modules/ai-credits/application/ai-credit-participant.ts
f72170d21e4a9830c214593465c659d6075b3205607d856f963eef5848fba93d  apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant.ts
6538d09e15d5a96bec870f9603dc93b89e6c049488204e4575bc33f27a2b39dc  apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/schema.ts
fc79c3a507ed2f2ccc0d3b0cbc082ef2b8f5470fb5664868c2d7d7b16bd89b3c  apps/backend/src/modules/dictionaries/application/ports/text-selection-store.ts
63176ded25dbee6866674eade3ce7dcd9926f7c110b273847b934974f66ae572  apps/backend/src/modules/dictionaries/application/text-selection-service.ts
7d64317cec5d1a16cd35dc4462d670c3b329893ecb0cca8109c4c475e3c0deff  apps/backend/src/modules/dictionaries/application/text-selection-worker.ts
88dc0085bdda39c1db7083a3bb028db3c1916dcd6bf6a4f0fb5ebc77bde7144c  apps/backend/src/modules/dictionaries/domain/card-authoring.ts
8f846e02b3b84946e09e9c6d197546e9f9a6627b9c5c9ebd9addb2b4ce8605ca  apps/backend/src/modules/dictionaries/domain/text-selection.ts
92fedb1f1fe13e53fbeb15d88f6c7b30b362a89b3e8e1ed0804af59d2cc3bc23  apps/backend/src/modules/dictionaries/infrastructure/ai/dictionary-card-authoring-agent.ts
3badf8e3fb2c8e21ffd24d53f3e018c0ca8ebaa6012ed8b5f066e706df1b63a7  apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-text-selection-store.ts
b5efcd612c08928a71ee92054b900829b4f1c702526b638a5a2ba03d70fd5752  apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/schema.ts
e7259e2309a933db748554e215bbc71be9e03dffc481d07de23e44797d7958c2  apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/selection-card-schema.ts
9281db3ee4b338f76c24eefeca50772025a23a1c616c5a9eb2685e59f98f3179  apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/text-selection-accounting.ts
b08e7a64bb10e1a9c3840e4974bb6a57e231bf5449309d6af0e7498b23ffda36  apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/text-selection-source.ts
c79e5ed149ae3f62125cc22b6f79f2d3854f131f543c04c76b730eb3426d6b30  apps/backend/src/modules/dictionaries/infrastructure/persistence/drizzle/text-selection-target.ts
1ba7508365a08bfb317dbd62b62576f93118dcfbfcf86c056659193894136746  apps/backend/src/modules/dictionaries/infrastructure/text-selection-composition.ts
29dcae731e36e5f7f7038f157d971139454fd747f3b9327ea7b0b79bb8052f15  apps/backend/src/modules/dictionaries/interface/http/text-selection.routes.ts
5a46857e5c8314a1ee0af93172d3b832d4d3d94d553382c7a3a9351a87a4d3f9  apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts
ffb284c7c33d011082954afafb7732d5452f22e33a55d28f15afd14379d23e0d  apps/backend/src/modules/text-ai/infrastructure/ai/text-ai-worker-observations.ts
243835c7405b8f3acca0fe3215ced43d8081e78fbad115b378e1613b225ce1cb  apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema.ts
b329f4b99b03e04e79949aa6ab4180f7f247764530f9b9f05b30f6da26491144  apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant.ts
9fa240611a8f02ff7bb052c2f2a1c4b5c9b249766bca96909d56a1e4ee2724c5  apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness.ts
5d6ceda7888ff6a10befe5c5a964046ff960776e61a2e21a143499d313ab7a59  apps/backend/src/modules/text-ai/infrastructure/text-ai-composition.ts
57f989c8d856a8a6a7bff6a721d4fd17ad299183495c3bd7f4d39990f03da58b  apps/backend/src/modules/texts/application/ports/text-content-store.ts
f297f7034c12e76d72e2bba9f388798b57dee3dccfc04d1448cba99a75d2cb6d  apps/backend/src/modules/texts/application/ports/texts-ai-provider.ts
06c0ecfae436cfea2899a9bea3f7a2be134a94353f0f6d9a721cf9a179a8de0c  apps/backend/src/modules/texts/application/ports/texts-job-store.ts
42a0fb3cd477b3ff76233721f98e9fcbd14ba20c7f292e05262b622f666016fe  apps/backend/src/modules/texts/application/text-content-service.ts
2adb643a1fcb6bcc094ab91b05756a8e6b7fcc01bf3e68f2acc5cdd4e385867c  apps/backend/src/modules/texts/application/texts-job-service.ts
9fdc744c3e933851aec304d2328041663c17b5ef50d1981e337041fef2a619ec  apps/backend/src/modules/texts/application/texts-worker-service.ts
40561899accf671dabcbb31b1d917e372ea3fc62b403945d925a9b710af92d81  apps/backend/src/modules/texts/domain/text.ts
4fa32e0322ee1cbf99534370cd7c035c263939b1b22ac24e6945f21aefe83e16  apps/backend/src/modules/texts/infrastructure/ai/texts-agents.ts
628044826059744c6ea6a0068d4606c2e7781ea6c64a9a222bf3c83f1e674317  apps/backend/src/modules/texts/infrastructure/ai/texts-ai-provider.ts
076e611ab12285b77165e6fdccb9ea8973170bd3401283f1a93b8e728f9f3769  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/drizzle-text-content-store.ts
dd5e04891296886b9a430fd05f9637ee180aca842e3254e55ccee5e2b590dd9a  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/drizzle-texts-job-store.ts
778e1a98f1c12dd2745a8cf0f18b9c0cf8f598658017dc595e8acefa602e5422  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/schema.ts
7390f25c98f8b4ea0a83e7c7d19e78a58fbf13983c2ed49afdd7e9144b0df8c2  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/text-content-support.ts
616a85e25469472740c041c8322be2c022c4e2994a69055e6a1fa59833b6a208  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/text-source-resolver.ts
46c5921a3f456eb2c156061bd3adef52ebb18dc00f49a57a2d32725274df7837  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-deletion-participant.ts
a13cc41a8785176792d5030a6904e22b10881f9d4e3f4330784b3017e1a81895  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-accounting.ts
574388b325be2660809b7ded71ab1d1abd10d4006716a29b7251b5566a5b012f  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-schema.ts
86b61b83c8c6737dcfc71294158789f070409cf192cf2eb0c881b6c09e8f3f36  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-support.ts
9d469da2a1a8a751540bdc20268874f9d3c8b5ac7c1c809c6b42245a257139ea  apps/backend/src/modules/texts/infrastructure/texts-ai-composition.ts
acf5c255994ff5dc28f4732cda5b33745be3e5e48befb94886cd4e644f7054fe  apps/backend/src/modules/texts/infrastructure/texts-composition.ts
e0d55bf005dd674684dbb3d36bda168c833bc9f9ab0167afb4b17ee5a4dfca59  apps/backend/src/modules/texts/interface/http/text-content.routes.ts
03a81057790c8a6abeac01c4c7c11fea6c4fc95f64a8990935ef32603c146c5f  apps/backend/src/modules/texts/interface/http/texts-job.routes.ts
438c05d5a57aa745cc60e26826261ba009aa9ef204da2b25676d82e5bdac1e19  apps/backend/src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store.ts
eb0747a124e5bd6ca6a94925952ed9cf189fbbc180f694c6277caf22b952d125  apps/backend/src/modules/users/infrastructure/persistence/drizzle/drizzle-owner-deletion-preparation.ts
641d425bec630703682b1116d796cfbad7c4816c5ffd959a6007c064ef60a03c  apps/backend/tests/integration/modules/text-ai/text-ai-capacity.test.ts
fb66ccb20c6c04d74bdf149792c1313b8687755da7a305a0b38a2fd392e767ef  apps/backend/tests/integration/modules/texts/infrastructure/text-content-store.test.ts
d41969b261e895cc0b5dbdaf07fb6a43c82d12c0cd0f3404bab0bb71b71ed6e5  apps/backend/tests/integration/modules/texts/text-selection.test.ts
f889dafea75c1b7cc88eeab28211d91caf7f7641e1b8ab3218897420ef0038fd  apps/backend/tests/integration/modules/texts/texts-account-purge.test.ts
5000ac4c3b7743bf410c170707cc80469070b31163c01cf49f2b8f3f2b645c4a  apps/backend/tests/integration/modules/texts/texts-job-store.test.ts
f6a0a256edb2bdfadb7460fd397bf5a5e7a4816acb3a1dd4012ba03349df1985  apps/backend/tests/integration/modules/texts/texts-migrations.test.ts
ba4b0491cdcd824f3f4026ea69ce163f496dc2d6af225b1c305f9c026cd7802c  apps/backend/tests/integration/modules/texts/texts.journeys.test.ts
b124c9fc93d2aeb6f9ecd71bd0d64fe7f5f6d427e509822cde7906441a622510  apps/backend/tests/support/texts-web-server.ts
5350b19652fa220ac2c9be24a970b8d0e5272f7f7e9de2315d48864ed7c3cda0  apps/backend/tests/unit/infrastructure/worker/dictionary-worker-command.test.ts
108937c1e309745ff69f34fe771d8edbfdaa47037f5d33396841d8e65d8db623  apps/backend/tests/unit/infrastructure/worker/dictionary-worker-runtime.test.ts
c87360c7c4985bd3dad98389e4e4d975d2cf4cdd7e4a826514afb131291d73e3  apps/backend/tests/unit/modules/dictionaries/application/text-selection-worker.test.ts
c4cd20d5a5082d9f49a23e3e0321389b9649be9fa6b2c20a84be1f4b2752d7b8  apps/backend/tests/unit/modules/dictionaries/domain/text-selection.test.ts
7e30a96cbbf32d89f82b62064182f81efaae77012f1715828b72a20c6a063bbf  apps/backend/tests/unit/modules/text-ai/infrastructure/text-ai-admission-participant.test.ts
4fdebd3cdf27c868c39786e4455c29823a4fd02daaddb337738a53fe602865e9  apps/backend/tests/unit/modules/text-ai/infrastructure/text-ai-worker-observations.test.ts
860afa76f85b7d4634e5f681eae57ec7ffb083e05074ca97fe61d6150fdd2ac9  apps/backend/tests/unit/modules/text-ai/infrastructure/texts-admission-gate.test.ts
120b8b2836eb207d34608e85c45869fbaddb442f7b2ce97c7511e02123963249  apps/backend/tests/unit/modules/texts/domain/text.test.ts
0675c1cce8346e5a6fbd2beab3a7a1973b8ac18b4ed4a0322d52d43014bcee56  apps/backend/tests/unit/modules/texts/texts-job-routes.test.ts
605e608c5db194097fcfcad3ec6f43c51424ee1c8714637358a7f975323e1649  apps/backend/tests/unit/modules/texts/texts-provider.test.ts
30089d2614608e5d74039517f6444659179095fbacfa017f9ce9c1e29dfafc26  apps/backend/tests/unit/modules/texts/texts-worker.test.ts
071ef26c04d50e1bbe97b05034a386fe1120620bffedd7d768a620f14eb00799  apps/web/next-env.d.ts
03aba0c40a345a128e2c13698e5411ffa2eb87e38dd12cbf04cf2035284c2f38  apps/web/scripts/style-contract.ts
32fadd774111385581f80e6efc4b863511ce374b09083d8fe55da87ca3e022d8  apps/web/src/app/shared/text-folders/[shareId]/page.tsx
0967ec63b4296cc7f2e6b02f093d01b2edacf09dd029d3bdd8f3356101b6e17b  apps/web/src/app/shared/text-folders/[shareId]/texts/[textId]/page.tsx
6b6e10c40185a33d9195bf4f443eb259ccc203d0f464b38be020a4af9914fd10  apps/web/src/app/shared/texts/[shareId]/page.tsx
3d9d26a8768303fe84ac84d187b374c07fa6a4b507c6cac70b4801460fcfc601  apps/web/src/app/styles/geometry-tokens.css
1d3dce5e61c375db6bacf9cc69369a523b739503d932160433c0bff51ce0668b  apps/web/src/app/texts/folders/[folderId]/new/page.tsx
56b08bd3134d4d7b7cbe01fb9e284e2fe6cb1d4362ca0808e8aefd7f46c44ccb  apps/web/src/app/texts/folders/[folderId]/page.tsx
c806144118077acbf25d9c146ac879d5ef45e4ea372b2f41b1c16c07139d7e58  apps/web/src/app/texts/folders/[folderId]/texts/[textId]/page.tsx
3d78dd9badaa67225033d020128ebccf731e6aaf702c28c5b3ba523d449efd01  apps/web/src/app/texts/page.tsx
0180b52de02493d2f54c370b274ee43a0cc7759d32b9134b13ec9a1ce3178c02  apps/web/src/fsd/entities/texts/api/content.ts
51e5f12feedf7ef9eafbd9eb4af5d4deac76d1e88af0b6f032db406591184774  apps/web/src/fsd/entities/texts/api/jobs.ts
290f4f9300f31164ddf07543c8e130db16c01cd3cbe968098cbedf0e7babdfa4  apps/web/src/fsd/entities/texts/api/sharing.ts
16c3f297db054d13ee8256e562a56df0374fc0b42626ddd300f6e1af702ebf22  apps/web/src/fsd/entities/texts/api/transport.ts
95bc66e437e17df0b10fe2596f7ea62c7967f8111f561fc48ae5236045cc91ee  apps/web/src/fsd/entities/texts/index.ts
630b5debeb77e61fbc96d64e297a97987f1e0b3871bc2d1568ed38c7b121a6f4  apps/web/src/fsd/entities/texts/ui/text-status-badge/text-status-badge.tsx
0f8e5bee99c1fcfc79a177dd3cfe9588da98445e4d9fcb7a74d4b6b72b5b6712  apps/web/src/fsd/features/text-management/hooks/use-text-mutation.ts
a141020d6a0040668ef7efa779e6d0ab823c432d12c57e2a4496860d53858367  apps/web/src/fsd/features/text-management/hooks/use-text-share.ts
77bfc8446fb5b374caafbb0ddb0ffc78d84e1fac0b1171dddecaa47a8457c5bc  apps/web/src/fsd/features/text-management/index.ts
7df93f470c82a240852ce0ae6193fdb3ad7886f2988a51845691329a25601314  apps/web/src/fsd/features/text-management/types.ts
b16bcc4a7f00bd30961ffacd99c19f77b4778a30a7af89c42d459ca347823c8d  apps/web/src/fsd/features/text-management/ui/archive-text-dialog.tsx
2e8a0f7712a9f75bdd1ebc8f94352175c3deebc4ff9afa1ef347d9fb0f7b83fc  apps/web/src/fsd/features/text-management/ui/dialogs.module.css
8fd7b31e52b65f97070d1d873ae9504fb194aff20be0d6c71a72473bb9679026  apps/web/src/fsd/features/text-management/ui/folder-form-dialog.tsx
9d03e44fab386d4c5ef54ed91bdf7c7f679d3d9d4f105794133cb17015faa4a4  apps/web/src/fsd/features/text-management/ui/rename-text-dialog.tsx
a8acc1d468a39fb494ca022133015b36f6ac096af91f8eb380b24ab88d22417a  apps/web/src/fsd/features/text-management/ui/text-share-dialog.tsx
85c6e8aafdf9f519af35e735334799dcd2bf5b763c01c7117e56263e50be6554  apps/web/src/fsd/features/text-management/ui/texts-auth-boundary.tsx
c44182a94d8c4baa0b3276d80db568c1cfd892e6665dbd66024482d4683ab896  apps/web/src/fsd/features/text-reading/hooks/use-collect.ts
8ef0cdbd3f847fba54a63c0b4ee13d4158a06a83eb78dfbad92dcd66517b515b  apps/web/src/fsd/features/text-reading/hooks/use-collection-jobs.ts
3a98470fef710e702320a56e2cef73bb496ffcb26b0600ebde6d896e00823100  apps/web/src/fsd/features/text-reading/hooks/use-reading-copy.ts
1f2734bda521b8bf0dc3c0a591d8b83cadaf4da54d9222f5be8c826818e0a86e  apps/web/src/fsd/features/text-reading/index.ts
93ed8411c1726d1dc4fd4bb74ec58d1a3ff6e895464f34e8ac1bcb610836688e  apps/web/src/fsd/features/text-reading/lib/collection-failure.ts
93a319d62e2d110d624964bee2b2c1a7cf72d1cf68d203025e09db6d50eef0ce  apps/web/src/fsd/features/text-reading/lib/selection.ts
882861af6af1eb7870062f1f952855e85566aaa018028332951443d9d3056ff7  apps/web/src/fsd/features/text-reading/lib/wait-for-poll.ts
c70cea731bdb011d1b62e70f2b2ce68beeff2a8e8fc23828ac224bdbce97b4eb  apps/web/src/fsd/features/text-reading/types.ts
58dd7846a8ffdde22ef27472ef94843ec75f43420b6c6806f2418eaef6eb4b4e  apps/web/src/fsd/features/text-reading/ui/collect-panel/collect-panel.module.css
b96ec95fb951cfea32b6e7292703699dccb1d0a3a67592527b34f50eb352eba6  apps/web/src/fsd/features/text-reading/ui/collect-panel/collect-panel.tsx
3f250de1e0af14bb62518163e82542a1fef2e99e6b1cb126e3424a5a4fac67d1  apps/web/src/fsd/features/text-reading/ui/collect-panel/dictionary-choices.tsx
f0b51923ceb1a41b581dffd72f8d770b5dba5bc66be3fd91579167d03a2f8c44  apps/web/src/fsd/features/text-reading/ui/collect-panel/duplicate-preview.tsx
3632a1d5ab7b2e309a9342d50db2b22e5d5a106de6ae3130966501c5f62d13c0  apps/web/src/fsd/features/text-reading/ui/text-reading/collection-layer.tsx
70bf1e0a206f8bf1f44176931c8768390c6cac03786b61cb010620e137839ec8  apps/web/src/fsd/features/text-reading/ui/text-reading/collection-notifications.tsx
471ecf896d78922b4802273faa34d187ee0629e02619f156e6c9cce09b69ad3e  apps/web/src/fsd/features/text-reading/ui/text-reading/counterpart-sheet.tsx
3a4ed2140ed1c39d44e500020f026eebcc52473f1a3f415dea769685e5120043  apps/web/src/fsd/features/text-reading/ui/text-reading/reading-pair.tsx
6a020e69122bf930a288e0d1148dbd1a9e83acebd7b71443fd5a92353d8fabf5  apps/web/src/fsd/features/text-reading/ui/text-reading/text-reading.module.css
bb37ff1cc90c934f7b7a4189247c7ec180a9822a08c83f83bb372f7f3a53a7c7  apps/web/src/fsd/features/text-reading/ui/text-reading/text-reading.tsx
6dd5cf2bbe17b37ff2ef1073bb0e3942ac9b8b88370c9dd3948877e33bfdb6b5  apps/web/src/fsd/pages/texts/hooks/use-shared-text-copy.ts
af143ef4d10052d0bdfcb6f714121bb125d9b4c523ab2a7fb287f82f923f538f  apps/web/src/fsd/pages/texts/hooks/use-shared-text.ts
536d8f857d40a0a579bfb43329dc8151d77f08b57eac7fe0b61bbcd82c23471a  apps/web/src/fsd/pages/texts/hooks/use-text-folder.ts
f1901fa878926838e59f9c7f2803f17669aeb111104fb894f76d4c8e8375a844  apps/web/src/fsd/pages/texts/hooks/use-text-library.ts
8d632d3b823f24b5c9b5f9607258af21ed06260fa26ec132b6125bbe897775f5  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-data.ts
0094f3aca161c89c5dccef1f6d5e48f8ba20e38e3d897dd1a7d4627bea2f30d8  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-expiry.ts
53a48ae126ea24e779eed8dc77ee702ab1dc7c0cc623bcab6cada60c378d4c83  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-job.ts
4ce8b54adbdc8b0d6c5bd6530e52e707026f3d3a3264df7f398040ef827fc8b9  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-save.ts
7d25f221906a135095a6fcf8837a18c97fcb485407a000b4a4ec4d2568392cd1  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-session.ts
7359ced267217a6399a08669f96c867091b7bf541ccdf30945dcd527e3053a6d  apps/web/src/fsd/pages/texts/hooks/use-text-workspace.ts
b3737a3bffabbfcbc88265431619da963564f69613dfabdae990eac2668ada42  apps/web/src/fsd/pages/texts/index.ts
d7202a7aabce4a6a0a969c83e3b9a420d4b8b52db9192b79f8254b5395b4982c  apps/web/src/fsd/pages/texts/lib/library-relative-time.ts
921b923957a2f123ab8d475d704c2f7e13642ad7344fcf70e377be79a484d9e7  apps/web/src/fsd/pages/texts/lib/workspace-boundaries.ts
2d5c616a092d989208e3970866e12ce95eea1f96d2dbc9740b886340d7748ac7  apps/web/src/fsd/pages/texts/lib/workspace-content.ts
9d3cccbb23d19a226511dcaa273a3dd4f84a08a9777c4f4b8b489c8444249115  apps/web/src/fsd/pages/texts/lib/workspace-reading.ts
da2deb1ca6dddf0efd9c46ca5a3f34b2752e99391161b450adbe248765a24151  apps/web/src/fsd/pages/texts/lib/workspace-save.ts
fb64bcfa10f09db99df47b0a67f8c891c9ea2319ea69fc68584d1cf57664906f  apps/web/src/fsd/pages/texts/ui/folder-page/folder-dialogs.tsx
968df52c06a95818c6ba6934bacb9aa35ca21153228faf5354c566fdfce37884  apps/web/src/fsd/pages/texts/ui/folder-page/folder-header.tsx
468bb8b904f0aa27da0f24c0eb9fe7d3d45db819a89b20898c0e53aa83fd628c  apps/web/src/fsd/pages/texts/ui/folder-page/folder-page.module.css
9f530bbbc335d7a3e7dedc3c66a9ba04b88e3af5c94491c7fc273c3278e0ba9d  apps/web/src/fsd/pages/texts/ui/folder-page/folder-page.tsx
808d4ec5d4e92b7a821d20e146ccc99b0120cdb0ba55aa773b84db22f81d4956  apps/web/src/fsd/pages/texts/ui/folder-page/folder-text-list.tsx
ea245cb7ecc0e5f2a5ae5e4f3a893c8bb10042d65906701b8b00a4d5bab7b8a7  apps/web/src/fsd/pages/texts/ui/folder-page/text-row.tsx
2fb903ad6ca203dd82b7fe69efb99f6ca07c9e55f4d8e42acebbc74c7f4da1c2  apps/web/src/fsd/pages/texts/ui/library-page/folder-card.tsx
935c3901064471c7476842935c43aa6aac0db3da446f60f1023b5dc88c804cd3  apps/web/src/fsd/pages/texts/ui/library-page/folder-grid.tsx
3e84b0e1322708f69e6fb71ac16cdcbfe9bc987352b373c9333049c6b00f377b  apps/web/src/fsd/pages/texts/ui/library-page/library-page.module.css
d8927b796540fdb421f0d8fabc6107d49f49a342c570e7cbc4dafb1736b537c9  apps/web/src/fsd/pages/texts/ui/library-page/library-page.tsx
f7f9ae7ad1c5220796647b2f4276ab6c1fc962dabf46de04267b283e739b62b9  apps/web/src/fsd/pages/texts/ui/public-page/copy-dialog.module.css
f316a260beadb4fcc39b432a219c0fe609c2e29c52b0dbb0080c156d38f6b8fc  apps/web/src/fsd/pages/texts/ui/public-page/copy-dialog.tsx
d2346df6829e9c2555382f8a6979409d2e0c30a3c79917da948e4757e2194905  apps/web/src/fsd/pages/texts/ui/public-page/public-folder.tsx
a1de86f7b31f340c0fe67635611ba8bc07486daae04b7bdd6335116bc13cb48a  apps/web/src/fsd/pages/texts/ui/public-page/public-header.tsx
b8e43a2678b4eb36dd26d5f1fa3f0297bca3e07a1a7907bd05105e403251155f  apps/web/src/fsd/pages/texts/ui/public-page/public-page.module.css
422f8f7e3a5453e8189baead4a9e0f50c2ea46242fac27832087669246a0e5da  apps/web/src/fsd/pages/texts/ui/public-page/reader-header.tsx
f5d105dae230daeab249b7561af6265bfb3038eb177402b9cff66e49427744e0  apps/web/src/fsd/pages/texts/ui/public-page/shared-texts-page.tsx
e64015e681d957c0d194cb8b94f1d6190831a9d150bd06f292904618fba6ccfe  apps/web/src/fsd/pages/texts/ui/public-page/sign-in-dialog.tsx
4c89765bf8a1e15e220a409a5d0be38d396268f95d49811f61754476e54d4f3f  apps/web/src/fsd/pages/texts/ui/public-page/unavailable.module.css
0d7457ce5275909df2949888c496cc4939c41c601913543f5d2bb8f4a95ec6cf  apps/web/src/fsd/pages/texts/ui/public-page/unavailable.tsx
6454b8833efe093a7132fbc8476a5486949b1d41b08c428a6bf8eb9dbb4d4f4b  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-actions.tsx
956ad9a31fe61e4b58f10c2984c479b603312c21c19f4ce6b85c1dcc43f3b57f  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-banners.tsx
33a3928ca3de29fbcf17feb18e58edd9480ad855dfeca11a23592d18d0a0e95c  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-compose.tsx
aa4a951d2327ce9f67f75c707235f35128fef73df69aa8ed1a3f18be9b1276f8  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-confirm.tsx
d70617fed70017363a0c122555cc1eb1744f9689b0ee12bd21d07ef0fc36bfb3  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-copy.ts
60c3ef31139fa7d5005fd368ce67d5558e80d5c112c19caf2ac50e68479bd30d  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-header.tsx
103b6b406be9e5f03407d3b7792c05d83d6e7c8c23655442eeeec3f4239aeab2  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-languages.tsx
e6d21940f08578444401f561802655474c623ffcfb84d1efbdcea03773fe2fe2  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-page.module.css
f261e112548f1f6c2100223e095a29b271d5e521fed653669a454c2c95098880  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-page.tsx
c1fbcd8a5fe5de92137aa78d0bf0d8909020fae50d5eaa4f1f89e54ea341eb82  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-pair-editor.tsx
eb3b51d4a78cc377eddc0e80a92c68c393f4d615c0cdf40dc74c8d0695a11cdb  apps/web/src/fsd/shared/i18n/messages/en.ts
1f3dca4b40d9d9154568a38a93ae861f4133dff5f1df78e31b37e78be1b71df4  apps/web/src/fsd/shared/i18n/messages/es.ts
d79a7358e892c551d762829617621c605c5e6cc62da14cbb6de0adea9b4f9e30  apps/web/src/fsd/shared/i18n/messages/fr.ts
7da6b043bf2e0019fa3265a140a3ae93272f643f6db83f8ae0a2fb18049a1bb3  apps/web/src/fsd/shared/i18n/messages/ru.ts
42c0949828c4060dea054c2c94e99afaecc713353919a3d6e72b30023db55c3c  apps/web/src/fsd/shared/i18n/messages/texts-library.ts
884eb8fee720814ed27e1af55399e56f5bb0968593d70830168ed363f54c016b  apps/web/src/fsd/shared/i18n/messages/texts-management.ts
72eeaa6255f770a84605ede7da6fa817c741223533987aa2177dacd7d4547028  apps/web/src/fsd/shared/i18n/messages/texts-public.ts
d24d47e7caddef4e8754059e8ed51b52861a2018cdfbb2c63c044a2d5484bd8e  apps/web/src/fsd/shared/i18n/messages/texts-reading.ts
86adbf43c6ff47edb845acb2d7f6a4b417c266226e0f99a306490f1ade04e827  apps/web/src/fsd/shared/i18n/messages/texts-workspace.ts
07848088fa2299120551037a2c6bac3bb2e71acb79dd0eaa2f9b7bf4a4f23377  apps/web/src/fsd/shared/lib/capability-return.ts
c3ee081ff8618e6dc6d31846c9df6edb23a4c76391e6e1bc088b119830d933c8  apps/web/src/fsd/shared/ui/dialog/dialog.module.css
ee1cc1ef29823e0517b220a9a26477514716cf54db1934508abc8bc80327dcd4  apps/web/src/fsd/shared/ui/dialog/dialog.tsx
fe33748c7fea4ce54ebea1f69f1517f10511a4d8c2511e566281d94dd8383a53  apps/web/src/fsd/widgets/app-shell/ui/app-shell/app-shell.tsx
bce729c42fe0246a6558ce634cd5109fd27a46309fc5aae597e897f8bd108b22  apps/web/src/fsd/widgets/app-shell/ui/application-chrome/application-chrome.tsx
ca76fa387452e688b0de822fbfb2ac68509695a9c6f674c02410d0b0a965ce96  apps/web/src/fsd/widgets/app-shell/ui/sidebar/sidebar.tsx
078e5aa26fd92aafe0d3080528077524660191a17503abf1f6938558f3a0d9dd  apps/web/src/fsd/widgets/app-shell/ui/sidebar/texts-navigation.module.css
82e492b5124c543c85ecff051d29ea7f88812dd8b27488144e772259c313b68b  apps/web/src/fsd/widgets/app-shell/ui/sidebar/texts-navigation.tsx
fe04537a20c39441b109902247ecae0add9fdf4f955a31ba4347d62f9330ecea  apps/web/tests/dictionary-capability-return.test.tsx
471e518a755f53d0e256838bcdbc78eba7bf38a503999f5b61fcba4d051ba07e  apps/web/tests/e2e/support/texts-playwright.config.ts
27f661dd048d4895bb1ace3445f76ac083a5421a17cd4969e26e8194be43ae13  apps/web/tests/e2e/texts.journeys.spec.ts
e27245d272659a5ad608b541584e9413285fd914b197ccf8edb26b1833e283b4  apps/web/tests/style-contract.test.ts
6511b8886a73fb940f143c0c9b8a0acd499943edaab1ef3ca67c77610b821e0b  apps/web/tests/texts-api.test.ts
f5f88187ed10415221a79ed01a65c11265360f53afd220a50867dc1f07b6764b  apps/web/tests/texts-library-controls.test.tsx
b387fee3497fbf1b48978e984999d67acbf273a8282e0a0e481203fdb930b141  apps/web/tests/texts-library-query.test.tsx
0d94ab423c0ab0839a29ebcca1e785e20a26ab2db7eed17d8d0b061e4d5393b6  apps/web/tests/texts-management.test.tsx
1443bed1d619851b13f678142aa7c20da6a8a6c11f34c9f5d5ba3da5b708eb82  apps/web/tests/texts-public-capability.test.tsx
90589cc93c305bc1fa8a524af98fe98509a80b77582fdbf1a36d994c24a5acfc  apps/web/tests/texts-public-copy.test.tsx
62b092b4b7a702155a3d89a6b1553e512c1a250ae983f7d674088f822f117f8c  apps/web/tests/texts-reading-collect.test.tsx
f02beef16588c777a8165c8aaea327a10931434ddd9aad32a8b94e1721f5534f  apps/web/tests/texts-reading-duplicate.test.tsx
ea6da3d3762a00c7f122993789b8c61e649b81f4cd7fda33e699dd602aeb7387  apps/web/tests/texts-reading-selection.test.ts
ffec872ffaf4927a99d3131605508b8fa5635c7a22d974a2c73def00286281e6  apps/web/tests/texts-reading-view.test.tsx
146e7814cefa4604087c1bf7d9a033436fce8d404e1747ac37e951fe3bc3e494  apps/web/tests/texts-workspace-boundaries.test.ts
3caddaf1e112fa36fc9997fb99e55ea0e0b158bc3ae5ba05f3993eb64bc2a403  apps/web/tests/texts-workspace-content.test.ts
adbd87a40de5386f35f657fc350180644dd660a38a067219082a6672a703b82f  apps/web/tests/texts-workspace-job.test.tsx
31becd57d5d3cd89898c653d20aad39a1ed436bedd72af993eefc367b53a3fd7  docs/adr/0012-dictionary-worker-and-document-ingestion.md
44a22765fcb74a3768673708b3a2c2ae25e910889d08b7facfafe3f530861cc4  docs/adr/0035-texts-and-contextual-vocabulary-publication.md
cd06534b84ac0ea4ef06358ada816cee57fd47a42abcd38389f4d0a983fc318a  docs/adr/README.md
c2cfe58b1cc5bf1860c09d178a23a7011c4964a96ae6247f9bd3065727ac7026  docs/architecture.md
e8ad8952d37556ea8ae73b05c7ec8b5d61b033045cc6f0382b71c522544b71c6  docs/design-prompt/README.md
093fe7e224bde2764dd26f786a297c465b9259e746343677524f96f121325c64  docs/design-prompt/texts.md
f5e962e5c39d361299c362ee4f63ed88be277f2091ac655202e2a35dbc95595c  docs/user-flows/README.md
5b49f4869463ee4f3db7b5c80fe5f34801b35ac7dced3d1c520e3a5bb3aa0d72  docs/user-flows/texts.md
85086f1c9bdf667edc879f546efe8bf6acf7033e401a1198d575f593a97726e3  infra/deploy/sql/account-purge-worker-role.sql
62c353905de16021f0a8fdbfd240af03c3edbeecd5fc8e039c370180ce128333  infra/deploy/sql/dictionary-worker-role.sql
67668c1be9be97414911b9a551e68019be869f2e9c1418c429ef2f31d89b20f1  package.json
e3dfe40ca58393efbc01afbb7c94eb91441e328c7764721326938c8f66fa0f9d  packages/contracts/src/index.ts
e7c2de6a4838e8042e90d6e4d76c325b4d26654748a24393ce200be75c2ea269  packages/contracts/src/texts/index.ts
6081d0d7bc1807f12dc2b91883effbed09e652083f4c2d0eca83bd5593e37517  packages/contracts/tests/texts.test.ts
0242fbabec04418a22ba5fd6678b1c424d90bddad5429a072350d05f368fe67a  packages/prompts/src/index.ts
24ec8bf542327bdb565c6e5d41ffd62e2d5640b201b1472b608db144a08d5c82  packages/prompts/src/local/texts.ts
5eaa379c59b711caf22e3fd088318f15c6a0fe792f5f2044a6fe58a427dd0655  scripts/check-user-flow-guides.mjs
c9f71eef7bc9f6dc2cf569441ece8515bef3920af267d51eebd2dc16f6dbc137  scripts/run-texts-all-e2e.mjs
d4022b1cf79764d4e34cf562973d72a331d900dcb9d208c1de64c76a6b75df2e  scripts/run-texts-all-e2e.test.mjs
5d35b5d65935990a2a2b4b1311a6826b6c4245ead558a4438a4841f9181e77a5  scripts/run-texts-e2e.mjs
66e9974a0177744b1657237c066da667738525c4f4916223c95696ca52448bc9  scripts/run-texts-e2e.test.mjs
10b3f89b6e87269b6c93c09dcb287060724a40001d2926c862f0a2bbf80c7818  scripts/run-texts-web-e2e.mjs
```

## Bounded remediation review — UI-CR-01 through UI-CR-03

Inspected focused fixes and new regression bodies, reusing owner-passed workspace18/18 and public-copy5/5 plus affected types/lint/style evidence. UI-CR-01 is closed: folder, document and job queries are actor-scoped; adopt writes the matching key; workspace controller remounts with actor identity. The session wrapper rejects stale actors before request execution, inside refreshed-token callbacks and after response, preventing old operations from executing as the next account. The regression retains one QueryClient, changes A to B on the same URL, verifies private A content disappears while B loads and remains absent after404, and tests a late response/retry callback.

UI-CR-02 is closed: copy awaits account-scoped invalidation before onDone; actor/authority checks fence late results, session-refresh callbacks and completion, while operation identity remains stable on ambiguous retry. Seeded fresh/infinite-staleness account library/folder caches invalidate before completion and another account stays untouched.

UI-CR-03 is closed: compose title/source/sample, language selectors/detection/acceptance and pair textareas lock while saving; close/cancel paths retain the in-flight snapshot. Delayed-save regression observes disabled fields and enabled recovery after resolution. Dismissal is now an explicitly named X and capacity failure includes Shorten the text, but UI-CR-04 remains pending: on compact compose, the job has switched to Translation tab and shortening only focuses the hidden source textarea without selecting Source. This specific recovery follow-up was sent to the root; no broadened review is required.

Reviewed source identities for this bounded pass:

```text
7d25f221906a135095a6fcf8837a18c97fcb485407a000b4a4ec4d2568392cd1  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-session.ts
8d632d3b823f24b5c9b5f9607258af21ed06260fa26ec132b6125bbe897775f5  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-data.ts
402e236b2936d33f7c84e59f01c8a96aa0323ea9da61d3750f348266eb217091  apps/web/src/fsd/pages/texts/hooks/use-text-workspace.ts
53a48ae126ea24e779eed8dc77ee702ab1dc7c0cc623bcab6cada60c378d4c83  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-job.ts
4ce8b54adbdc8b0d6c5bd6530e52e707026f3d3a3264df7f398040ef827fc8b9  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-save.ts
6dd5cf2bbe17b37ff2ef1073bb0e3942ac9b8b88370c9dd3948877e33bfdb6b5  apps/web/src/fsd/pages/texts/hooks/use-shared-text-copy.ts
63cbb34fe50003c08167869d03a4866928592335e370544531cb122defcdb29b  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-page.tsx
86f48ed79b4691a00f5f817cb1dc3c09fe84facc09fd566edfb42dc2c98d5e49  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-compose.tsx
c2f95a618d94c51badd6cb2929100c1a56aedbe3ebffde5b65e9a42b29231c6a  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-languages.tsx
ea2411d3c538fd4086e4c4fc0a37bae62483a6781cba4126dbfb588aeb3d5667  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-pair-editor.tsx
424ec4a69958300a55e79ef132cbc9900897dd628afa7e3cfb84e25e4d489030  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-banners.tsx
788dd61b622e66fe046348aa1618a1aac8b20624bfc1f0a39b264d5ef0c1fa6c  apps/web/tests/texts-workspace-account.test.tsx
efd258a079c255d2387e06e1c80ea8a4ffce9aa93ca8243e46b4426b021ded9b  apps/web/tests/texts-workspace-controls.test.tsx
4d05cd358b52ad6ea8b0b76f25fda3d656e2bba26fa4f0b077858182e6d05776  apps/web/tests/texts-public-copy.test.tsx
```

Final reader visual-boundary patch and stronger real-browser evidence were still pending; no approval of unseen changes is implied.

## UI-CR-04 final bounded closure

Inspected compact recovery fix: WorkspaceCompose owns an explicit shortening handler that first selects Source and then calls workspace shortening, whose animation-frame callback focuses the now-visible source. WorkspaceBanners accepts that local override while retaining normal read/pair-editor recovery. Added regression reproduces active-job automatic Translation selection, subsequent capacity failure and Shorten action; it asserts Source aria-selected/data-tab plus the shortening callback. Reused the owner3/3 passing controls run. Dismiss X and localized capacity shortening controls now match the required source semantics without changing saved text. **UI-CR-04 closed; all four correctness findings closed.**

Final bounded identities:

```text
7c2a003bbf8c5e354c41ed91f0944c6a39daf4641b0aca33b35a688b900bd102  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-compose.tsx
142dc79a5706faeb6b8c855888da910a3882dcc6a0166053980e8db469e23a27  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-banners.tsx
3624a19f75baed29a01249b52b076654dc4bee7b2b38d12763c8f37a61ad8010  apps/web/tests/texts-workspace-controls.test.tsx
```

Correctness remediation is approved for this scoped state. Final reader visual-boundary patch and real-browser completion evidence remain pending review; overall completion verdict will be finalized after those arrive.

## Final reader display-boundary remediation review

Inspected reading-fragment, ReadingPair, selection analyzer and counterpart sheet plus new DOM/Unicode regressions. Paragraph layout now owns structural paragraph-edge line breaks; exact intra-paragraph leading/trailing spaces remain outside lexical spans. Zero-space CJK joins and repeated spaces survive without fabricated separators, and edited markers precede trailing structural whitespace. Persisted source/alignment strings remain unchanged. Selection prefixes use visible UTF-16 offsets plus offsetOrigin, context sentenceStart is mapped to that same original coordinate system, and marks subtract that origin for rendering. The original occurrence and server-authoritative selection contract remain coherent after visual trimming. Counterpart sheet uses lexical content.

No material correctness regression found in this bounded patch. New cases assess paragraph groups, inline marker placement, untouched original text, CJK/repeated-space joins, original Unicode occurrence offsets/context slicing and phone counterpart content. Final reported focused/browser results remain pending at capture.

```text
8ebbf5e62f787b0a7aaf0510ba3bd8f41be37573d00976879523e1797c2b2afe  apps/web/src/fsd/features/text-reading/lib/reading-fragment.ts
133cac47eb633fb74828b7058cedb6cd237677680bef26d0739250a5d268dfbe  apps/web/src/fsd/features/text-reading/lib/selection.ts
032831a27dea7cc8ed7a8878388ddc310cc28e7d5d7cd3c0d07458d97b37afa4  apps/web/src/fsd/features/text-reading/ui/text-reading/reading-pair.tsx
845c7a927db51394b103ded8c1f509a8c5f1c8e9f860d9d594c61589a17d5ebc  apps/web/src/fsd/features/text-reading/ui/text-reading/counterpart-sheet.tsx
f9057546b80db3bbc30cc03be0ab4d04fa60bbcf22ad14234c0783854220797f  apps/web/tests/texts-reading-view.test.tsx
569a493df2a8a626016e07b98f92d20e4c5ee435ca05aa39e9086b5037180cf6  apps/web/tests/texts-reading-selection.test.ts
```

## Bounded backend context correction

The final strict browser journey exposed a whitespace-only Intl sentence segment replacing meaningful river context. Inspected the two-line domain fix and three regressions: both selected-pair sentence entries and neighboring-pair candidates now exclude blank-only segments while preserving original nonblank `.index` and `.segment` values. Original selection offsets, surrogate checks, sentence confinement and source/translation language direction remain intact. Tests cover previous/next paragraphs on both sides and multiple sentences/blank units within an edited pair with exact occurrence slicing. This is a sound bounded correction with no new contract, persistence or security boundary. Focused green execution and strict owner-browser rerun were pending at capture.

Reviewed identities:

```text
2c115ee1e75dedffdd2dfe76620a5c95081274d03a7e300a577e8c0aec229a7d  apps/backend/src/modules/texts/domain/text.ts
7bbaab22bc569382fdb1f4d58e94ab1813c86793cf386cf8590a34e560bd5397  apps/backend/tests/unit/modules/texts/domain/text.test.ts
```

## Final completion verdict — Approved

All four correctness findings are independently closed; no open material correctness or source-control fidelity finding remains. Separate final security review is approved. Final source manifest `ui-preflight.sha256` independently verified:227/227 entries match, manifest SHA-256 `3894b0517afc36d9d4e47d748ab2fed4b9adbd264ffe12402dbb850df5f76fea`.

Assessed final evidence: full web80 files/650 tests, reader22 and workspace19/public-copy5 focused cases; backend Texts/dictionaries52 files/390 tests; current API5/5 in3.11s; final strict real-browser3/3 in28.1s. The owner native-pointer journey now verifies both exact edited paragraph columns, real bank selection, containing sentence and edited river previous context, contextual orilla/full definition/bilingual example persistence and dictionary reload. Public copy/revoke and phone counterpart/selection/320 layout pass. Existing contracts100/contentDB14 evidence remains applicable to unchanged boundaries. Affected lint/types/styles and backend/web production builds pass. No redundant expensive suite was run solely for review.

A final screenshot inspection identified narrow header clipping. The bounded CSS-only correction scopes ellipsis to title/breadcrumb, prevents desktop badge shrink and hides the status badge below768px, matching the supplied reference. Reviewed CSS SHA-256 `decf2cf6d19ea641c1792ce37e88a0920375b2df49781fb85c160f2a98d150e2`; subsequent phone-only real journey passes1/1 in14.7s with390/320 captures inspected, and final production web build/style check pass. Test-only Prettier formatting does not change assertions.

Approval applies to this exact source state and documented source-based fidelity. It does not claim pixel comparison with an unavailable reference screenshot, external paid-provider verification or production deployment. Remaining repository formatting/durable-record reconciliation and authorized local Git integration belong to root handoff; they do not leave an unresolved implementation finding.
