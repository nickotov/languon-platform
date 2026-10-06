# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sentence-practice.journeys.spec.ts >> finishes a five-word Russian to French round and reuses completed examples unless new examples are selected
- Location: tests/e2e/sentence-practice.journeys.spec.ts:778:5

# Error details

```
Test timeout of 300000ms exceeded.
```

```
Error: locator.waitFor: Test timeout of 300000ms exceeded.
Call log:
  - waiting for getByRole('dialog', { name: /Sentence practice/ }).getByRole('button', { name: /: show hint · Required word$/ }) to be visible

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - link "Skip to main content" [ref=e3] [cursor=pointer]:
      - /url: "#main-content"
    - complementary "Application sidebar" [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - link "Languon home" [ref=e7] [cursor=pointer]:
            - /url: /dictionaries
            - generic [ref=e8]: L
            - generic [ref=e9]: Languon
          - button "Collapse sidebar" [ref=e11] [cursor=pointer]
        - navigation "Main navigation" [ref=e16]:
          - list [ref=e17]:
            - listitem [ref=e18]:
              - generic [ref=e19]:
                - button "Dictionaries" [expanded] [ref=e20] [cursor=pointer]
                - button "Create a dictionary" [ref=e27] [cursor=pointer]
              - list [ref=e31]:
                - listitem [ref=e32]:
                  - link [ref=e33] [cursor=pointer]:
                    - /url: /dictionaries
                    - strong [ref=e37]: All dictionaries
                - listitem [ref=e38]:
                  - link "Finite round sentence-ui-verify-final-20261006 French → Russian" [ref=e39] [cursor=pointer]:
                    - /url: /dictionaries/eeb6b9c3-a5cd-4556-a839-8d96a311a66e
                    - generic [ref=e41]:
                      - strong [ref=e42]: Finite round sentence-ui-verify-final-20261006
                      - generic [ref=e43]: French → Russian
                - listitem [ref=e44]:
                  - link "Sentence practice sentence-ui-verify-final-20261006 English → Spanish" [ref=e45] [cursor=pointer]:
                    - /url: /dictionaries/7e71d73e-c945-4cfd-be0e-9b80936430cd
                    - generic [ref=e46]:
                      - strong [ref=e47]: Sentence practice sentence-ui-verify-final-20261006
                      - generic [ref=e48]: English → Spanish
        - button "Account menu, Your account" [ref=e51] [cursor=pointer]:
          - img "Your account" [ref=e52]:
            - generic [ref=e53]: YA
          - generic [ref=e54]:
            - strong [ref=e55]: Your account
            - generic [ref=e56]: sentence-e2e-sentence-ui-verify-final-20261006-0-owner@example.test
    - main [ref=e60]:
      - navigation "Breadcrumb" [ref=e61]:
        - list [ref=e62]:
          - listitem [ref=e63]:
            - link "Back to dictionaries" [ref=e64] [cursor=pointer]:
              - /url: /dictionaries
          - listitem [ref=e67]:
            - generic [ref=e68]: Finite round sentence-ui-verify-final-20261006
      - generic [ref=e70]:
        - generic [ref=e71]:
          - heading "Finite round sentence-ui-verify-final-20261006" [level=1] [ref=e72]
          - generic [ref=e73]:
            - generic [ref=e74]: French → Russian
            - generic [ref=e75]: 5 active cards
            - generic [ref=e76]: Private
        - generic [ref=e77]:
          - button "Dictionary settings — Finite round sentence-ui-verify-final-20261006" [ref=e79] [cursor=pointer]
          - button "More dictionary actions" [ref=e85] [cursor=pointer]
      - paragraph [ref=e90]: Card saved.
      - generic [ref=e91]:
        - group "Card status" [ref=e92]:
          - button "Active 5" [pressed] [ref=e93] [cursor=pointer]:
            - generic [ref=e94]: Active
            - generic [ref=e95]: "5"
          - button "Archived" [ref=e96] [cursor=pointer]
        - searchbox "Search cards" [ref=e99]
      - generic [ref=e100]:
        - list [ref=e101]:
          - listitem [ref=e102]:
            - generic [ref=e103]:
              - generic [ref=e104]:
                - generic [ref=e105]:
                  - strong [ref=e107]:
                    - generic [ref=e108]: livre
                    - button "Play Source phrase" [ref=e111] [cursor=pointer]
                  - strong [ref=e117]:
                    - generic [ref=e118]: книга
                    - button "Play Translation" [ref=e121] [cursor=pointer]
                - button "Card actions, card 1" [ref=e127] [cursor=pointer]
              - generic [ref=e132]:
                - generic [ref=e133]: Human
                - generic [ref=e138]: Inherited settings
          - listitem [ref=e139]:
            - generic [ref=e140]:
              - generic [ref=e141]:
                - generic [ref=e142]:
                  - strong [ref=e144]:
                    - generic [ref=e145]: maison
                    - button "Play Source phrase" [ref=e148] [cursor=pointer]
                  - strong [ref=e154]:
                    - generic [ref=e155]: дом
                    - button "Play Translation" [ref=e158] [cursor=pointer]
                - button "Card actions, card 2" [ref=e164] [cursor=pointer]
              - generic [ref=e169]:
                - generic [ref=e170]: Human
                - generic [ref=e175]: Inherited settings
          - listitem [ref=e176]:
            - generic [ref=e177]:
              - generic [ref=e178]:
                - generic [ref=e179]:
                  - strong [ref=e181]:
                    - generic [ref=e182]: travail
                    - button "Play Source phrase" [ref=e185] [cursor=pointer]
                  - strong [ref=e191]:
                    - generic [ref=e192]: работа
                    - button "Play Translation" [ref=e195] [cursor=pointer]
                - button "Card actions, card 3" [ref=e201] [cursor=pointer]
              - generic [ref=e206]:
                - generic [ref=e207]: Human
                - generic [ref=e212]: Inherited settings
          - listitem [ref=e213]:
            - generic [ref=e214]:
              - generic [ref=e215]:
                - generic [ref=e216]:
                  - strong [ref=e218]:
                    - generic [ref=e219]: ami
                    - button "Play Source phrase" [ref=e222] [cursor=pointer]
                  - strong [ref=e228]:
                    - generic [ref=e229]: друг
                    - button "Play Translation" [ref=e232] [cursor=pointer]
                - button "Card actions, card 4" [ref=e238] [cursor=pointer]
              - generic [ref=e243]:
                - generic [ref=e244]: Human
                - generic [ref=e249]: Inherited settings
          - listitem [ref=e250]:
            - generic [ref=e251]:
              - generic [ref=e252]:
                - generic [ref=e253]:
                  - strong [ref=e255]:
                    - generic [ref=e256]: voiture
                    - button "Play Source phrase" [ref=e259] [cursor=pointer]
                  - strong [ref=e265]:
                    - generic [ref=e266]: машина
                    - button "Play Translation" [ref=e269] [cursor=pointer]
                - button "Card actions, card 5" [ref=e275] [cursor=pointer]
              - generic [ref=e280]:
                - generic [ref=e281]: Human
                - generic [ref=e286]: Inherited settings
        - paragraph [ref=e287]: Showing all 5 Active cards.
      - generic [ref=e288]:
        - generic [ref=e289]:
          - button "Train" [ref=e292] [cursor=pointer]
          - dialog "Sentence practice" [ref=e299]:
            - generic [ref=e300]:
              - generic [ref=e303]:
                - generic [ref=e304]:
                  - heading "Sentence practice · Finite round sentence-ui-verify-final-20261006" [level=2] [ref=e305]
                  - paragraph [ref=e306]: Sentence 1 · 0 / 5 Selected words seen
                - generic [ref=e307]:
                  - button "AI preferences" [active] [ref=e308] [cursor=pointer]
                  - button "History" [ref=e312] [cursor=pointer]
                  - button "Fullscreen" [ref=e319] [cursor=pointer]
                  - button "Close practice" [ref=e326] [cursor=pointer]
              - status [ref=e332]:
                - generic [ref=e333]: i
                - generic [ref=e334]:
                  - paragraph [ref=e335]: AI task running
                  - generic [ref=e336]: Generating a sentence. Your previous sentences stay saved. Cancellation does not guarantee a refund for work already started.
                  - button "Cancel task" [ref=e338] [cursor=pointer]
        - button "Add card" [ref=e340] [cursor=pointer]
  - status "Notifications"
  - button "Open Next.js Dev Tools" [ref=e347] [cursor=pointer]
  - alert [ref=e351]
```

# Test source

```ts
  748 |         await readerPractice
  749 |             .getByRole('button', {
  750 |                 name: 'Repeat these exact examples',
  751 |                 exact: true,
  752 |             })
  753 |             .click();
  754 |         await revoked;
  755 |         await expect(
  756 |             readerPractice.getByRole('region', { name: 'Free comparison' }),
  757 |         ).not.toBeVisible();
  758 |         await expect(
  759 |             readerPractice.getByLabel(/^Your translation/),
  760 |         ).not.toBeVisible();
  761 |         await expect(
  762 |             reader.getByText('book is useful.', { exact: true }),
  763 |         ).not.toBeVisible();
  764 |         await expect(
  765 |             reader.getByRole('button', { name: 'History', exact: true }),
  766 |         ).not.toBeVisible();
  767 |         await expect(
  768 |             reader.getByRole('dialog', { name: 'My practice history' }),
  769 |         ).not.toBeVisible();
  770 |         await capture(reader, info, 'sentence-access-loss-no-cached-content');
  771 |         assertReaderErrors();
  772 |         await readerContext.close();
  773 |         assertErrors();
  774 |     });
  775 | });
  776 | 
  777 | // @user-flow sentence-practice-web/finite-round-saved-reentry
  778 | test('finishes a five-word Russian to French round and reuses completed examples unless new examples are selected', async ({
  779 |     page,
  780 | }, info) => {
  781 |     test.setTimeout(300_000);
  782 |     const assertErrors = observeErrors(page);
  783 |     await signup(page, email(info, 'round-owner'));
  784 |     await createDictionary(page, `Finite round ${runId}`, {
  785 |         sourceLanguage: 'fr',
  786 |         targetLanguage: 'ru',
  787 |         source: 'livre',
  788 |         translation: 'книга',
  789 |     });
  790 |     for (const [source, translation] of [
  791 |         ['maison', 'дом'],
  792 |         ['travail', 'работа'],
  793 |         ['ami', 'друг'],
  794 |         ['voiture', 'машина'],
  795 |     ]) {
  796 |         await page.getByRole('button', { name: 'Add card' }).click();
  797 |         await page.getByLabel(/^Source word or phrase \(/).fill(source!);
  798 |         await page.getByLabel(/^Translation \(/).fill(translation!);
  799 |         await page.getByRole('button', { name: 'Create card' }).click();
  800 |         await expect(page.getByText(source!, { exact: true })).toBeVisible();
  801 |     }
  802 |     const admissions: {
  803 |         kind: string;
  804 |         exercise?: {
  805 |             id: string;
  806 |             sourceText: string;
  807 |             hints: { text: string }[];
  808 |         };
  809 |     }[] = [];
  810 |     const generatedExerciseIds: string[] = [];
  811 |     const exactPrepareIds: string[][] = [];
  812 |     const exactNextIds: string[] = [];
  813 |     page.on('response', async (response) => {
  814 |         if (response.url().endsWith('/sentences/next') && response.ok())
  815 |             admissions.push(await response.json());
  816 |         if (!/\/sentences\/jobs\/[^/]+$/.test(new URL(response.url()).pathname))
  817 |             return;
  818 |         const job = (await response.json()) as {
  819 |             state?: string;
  820 |             result?: { kind?: string; exercise?: { id?: string } } | null;
  821 |         };
  822 |         if (
  823 |             job.state === 'completed' &&
  824 |             job.result?.kind === 'exercise' &&
  825 |             job.result.exercise?.id
  826 |         )
  827 |             generatedExerciseIds.push(job.result.exercise.id);
  828 |     });
  829 |     page.on('request', (request) => {
  830 |         const path = new URL(request.url()).pathname;
  831 |         if (request.method() !== 'POST') return;
  832 |         const body = request.postDataJSON() as {
  833 |             replayExerciseIds?: string[];
  834 |             replayExerciseId?: string;
  835 |         } | null;
  836 |         if (path.endsWith('/sentences/prepare') && body?.replayExerciseIds)
  837 |             exactPrepareIds.push(body.replayExerciseIds);
  838 |         if (path.endsWith('/sentences/next') && body?.replayExerciseId)
  839 |             exactNextIds.push(body.replayExerciseId);
  840 |     });
  841 |     const ready = async (practice: Locator) => {
  842 |         // The real learner limiter covers preparation and advancement; honor its countdown.
  843 |         const nextHint = practice.getByRole('button', {
  844 |             name: /: show hint · Required word$/,
  845 |         });
  846 |         const retry = practice.getByRole('button', { name: /^Try again/ });
  847 |         await Promise.race([
> 848 |             nextHint.waitFor({ state: 'visible' }),
      |                      ^ Error: locator.waitFor: Test timeout of 300000ms exceeded.
  849 |             retry.waitFor({ state: 'visible' }),
  850 |         ]);
  851 |         if (await retry.isVisible()) {
  852 |             await expect(retry).toBeEnabled({ timeout: 70_000 });
  853 |             await retry.click();
  854 |         }
  855 |         await expect(nextHint).toBeVisible();
  856 |     };
  857 |     const begin = async (mode: 'saved-first' | 'new-only', repeat = false) => {
  858 |         await page.getByRole('button', { name: 'Train', exact: true }).click();
  859 |         await page
  860 |             .getByRole('menuitem', { name: 'Sentence practice', exact: true })
  861 |             .click();
  862 |         const setup = page.getByRole('dialog', { name: /Sentence practice/ });
  863 |         if (!repeat)
  864 |             await expect(
  865 |                 setup.locator('input[value="target-to-source"]'),
  866 |             ).toBeChecked();
  867 |         await expect(
  868 |             setup.getByText(
  869 |                 'Each round uses up to 100 words. A dictionary batch uses the first eligible words. Choose entries to practise other words.',
  870 |                 { exact: true },
  871 |             ),
  872 |         ).toBeVisible();
  873 |         if (!repeat) await capture(page, info, 'finite-round-batch-setup');
  874 |         await setup.locator('input[value="target-to-source"]').check();
  875 |         await setup.locator(`input[value="${mode}"]`).check();
  876 |         const start = setup.getByRole('button', {
  877 |             name: 'Start in a dialog',
  878 |             exact: true,
  879 |         });
  880 |         const retry = setup.getByRole('button', { name: /^Try again/ });
  881 |         await waitForRetryableReady(
  882 |             () => expect(start).toBeEnabled({ timeout: 70_000 }),
  883 |             retry,
  884 |         );
  885 |         await start.click();
  886 |         const practice = page.getByRole('dialog', {
  887 |             name: /Sentence practice/,
  888 |         });
  889 |         await expect(practice).toBeVisible();
  890 |         await ready(practice);
  891 |         return practice;
  892 |     };
  893 |     const completeRound = async (
  894 |         practice: Locator,
  895 |         manuallyReview: boolean,
  896 |         round: string,
  897 |         close = true,
  898 |         heading = 'Round complete',
  899 |     ) => {
  900 |         const seen = new Set<string>();
  901 |         for (let index = 0; index < 5; index++) {
  902 |             const hint = practice.getByRole('button', {
  903 |                 name: /: show hint · Required word$/,
  904 |             });
  905 |             const phrase = await hint.getAttribute('aria-label');
  906 |             expect(phrase).toMatch(/[А-Яа-яЁё]/);
  907 |             seen.add(phrase!);
  908 |             if (index === 0 && manuallyReview) {
  909 |                 await practice
  910 |                     .getByRole('button', { name: /Show reference answer/ })
  911 |                     .click();
  912 |                 await expect(
  913 |                     practice.getByRole('region', { name: 'Free comparison' }),
  914 |                 ).toContainText(
  915 |                     /(?:livre|maison|travail|ami|voiture) est utile\./,
  916 |                 );
  917 |                 await expect(
  918 |                     practice.getByText('Reference read without an answer.', {
  919 |                         exact: true,
  920 |                     }),
  921 |                 ).toBeVisible();
  922 |             }
  923 |             await practice
  924 |                 .getByRole('button', {
  925 |                     name:
  926 |                         index === 4
  927 |                             ? 'Skip and finish'
  928 |                             : /(?:Skip|Next) sentence/,
  929 |                 })
  930 |                 .click();
  931 |             if (index < 4) {
  932 |                 await ready(practice);
  933 |                 await expect(
  934 |                     practice.getByRole('button', {
  935 |                         name: /: show hint · Required word$/,
  936 |                     }),
  937 |                 ).not.toHaveAttribute('aria-label', phrase!);
  938 |             }
  939 |         }
  940 |         expect(seen.size).toBe(5);
  941 |         await expect(
  942 |             practice.getByRole('heading', { name: heading, exact: true }),
  943 |         ).toBeVisible();
  944 |         const count = admissions.length;
  945 |         await capture(page, info, `finite-round-${round}-complete`);
  946 |         await expect(
  947 |             practice.getByText('Examples presented', { exact: true }),
  948 |         ).toBeVisible();
```