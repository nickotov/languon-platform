import { z } from 'zod';
import { ConversationEditorContextSchema } from './conversation-editor-context';
import {
    GenerationPlanSchema,
    GenerationTaskKindSchema,
} from './generation-plans';

const identity = z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/u);
const revision = z.number().int().positive();
const credits = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$/u);
const mutation = { requestId: z.uuid(), expectedRevision: revision };
const sourceChoice = z.enum(['keep-snapshot', 'refresh']);
const unitCount = z.number().int().min(0).max(200);
const totalUnitCount = z.number().int().min(1).max(200);

const failurePathFields = new Set([
    'item',
    'activityId',
    'correct',
    'distractors',
    'reasons',
    'correctRole',
    'meaning',
    'target-use',
    'task-completion',
    'not-stated',
    'false',
    'true',
    'tasks',
    'taskId',
    'blocks',
    'id',
    'type',
    'language',
    'explanationLanguage',
    'title',
    'level',
    'items',
    'format',
    'question',
    'instruction',
    'instructions',
    'objective',
    'referenceAnswer',
    'acceptedAnswers',
    'parts',
    'kind',
    'text',
    'choices',
    'correctChoiceId',
    'semantics',
    'activity',
    'version',
    'checking',
    'policy',
    'key',
    'explanations',
    'choiceId',
    'explanation',
    'gaps',
    'gapId',
    'rubric',
    'criteria',
    'description',
    'sources',
    'sourceBindings',
    'origin',
    'entries',
    'entryIds',
    'blockId',
    'segmentIds',
    'segments',
    'target',
    'passages',
    'sourceId',
    'from',
    'to',
    'classification',
    'roles',
    'role',
    'absenceRationale',
    'answer',
    'answers',
    'evidence',
    'pattern',
    'rule',
    'translationLanguage',
    'translation',
    'content',
    'document',
    'prose',
    'schemaVersion',
    'attrs',
    'metadata',
    'expectedAnswer',
    'checkingPolicy',
    'criterion',
    'weight',
    'accepted',
    'points',
    'minimum',
    'maximum',
    'source',
    'group',
    'exercises',
]);

/** Schema field paths only: user text, provider messages and keys are excluded. */
export const GenerationFailurePathSchema = z
    .string()
    .min(1)
    .max(200)
    .refine((path) => {
        const fields = path.split('.');

        return (
            fields.length <= 16 &&
            fields.every(
                (field) =>
                    failurePathFields.has(field) ||
                    /^(0|[1-9][0-9]{0,2})$/u.test(field),
            )
        );
    }, 'Failure paths may contain only known schema fields and bounded indices.');

export const GenerationFailureSchema = z
    .object({
        code: z.enum([
            'output-limit',
            'schema-invalid',
            'content-invalid',
            'transport',
            'rate-limited',
            'admission-blocked',
            'provider-rejected',
            'provider-outcome-unknown',
            'interrupted',
            'publication',
            'unknown',
        ]),
        invariant: z
            .enum([
                'distinct-question',
                'distinct-term',
                'requested-words',
                'required-block-count',
                'activity-allocation',
                'passage-evidence',
                'target-language-use',
                'distinct-choice',
                'checking-key',
                'source-prerequisite',
            ])
            .optional(),
        // Operational metadata is a closed vocabulary; never persist upstream text.
        phase: z
            .enum(['dispatch', 'decode', 'validation', 'receipt', 'checkpoint'])
            .optional(),
        finishReason: z
            .enum([
                'stop',
                'length',
                'tool-calls',
                'content-filter',
                'error',
                'other',
                'unknown',
            ])
            .optional(),
        admissionReason: z
            .enum([
                'context-too-large',
                'allowance-required',
                'authority-expired',
                'stage-limit',
                'balance',
                'capacity',
                'provider-capacity',
                'operator-capacity',
                'response-active',
                'configuration',
                'source-unavailable',
                'source-changed',
                'conflict',
                'unknown',
            ])
            .optional(),
        taskId: identity.optional(),
        recoveryExhausted: z.literal(true).optional(),
        referenceId: z.uuid().optional(),
        paths: z.array(GenerationFailurePathSchema).max(8).optional(),
    })
    .strict()
    .refine(
        (failure) =>
            (failure.code === 'admission-blocked') ===
            (failure.admissionReason !== undefined),
        'Only admission failures carry an admission reason.',
    );

export const GenerationAutomationSchema = z
    .object({
        enabled: z.boolean(),
        retryAt: z.iso.datetime().optional(),
        recoveringTaskId: identity.optional(),
        maximumCredits: credits,
        remainingCredits: credits,
    })
    .strict()
    .refine(
        (value) =>
            !credits.safeParse(value.remainingCredits).success ||
            !credits.safeParse(value.maximumCredits).success ||
            creditMilli(value.remainingCredits) <=
                creditMilli(value.maximumCredits),
        'Remaining credit authority cannot exceed its authorized maximum.',
    );

function creditMilli(value: string): bigint {
    const [whole, fraction = ''] = value.split('.');

    return BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

export const GenerationRunStateSchema = z.enum([
    'running',
    'paused',
    'completed',
    'discarded',
]);
export const GenerationRunPauseReasonSchema = z.enum([
    'budget',
    'technical-failure',
    'interrupted',
    'stopped',
    'source-changed',
]);
export const GenerationTaskProgressSchema = z
    .object({
        id: identity,
        kind: GenerationTaskKindSchema,
        status: z.enum(['pending', 'running', 'completed', 'failed']),
        label: z.string().trim().min(1).max(200),
        completedUnitCount: unitCount.optional(),
        totalUnitCount: totalUnitCount.optional(),
    })
    .strict()
    .superRefine((task, ctx) => {
        const completed = task.completedUnitCount;
        const total = task.totalUnitCount;
        const maximumUnits =
            task.kind === 'vocabulary'
                ? 200
                : task.kind === 'exercises'
                  ? 25
                  : 1;

        if (
            (completed === undefined) !== (total === undefined) ||
            (completed !== undefined &&
                total !== undefined &&
                (completed > total ||
                    total > maximumUnits ||
                    (task.status === 'completed') !== (completed === total)))
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['completedUnitCount'],
                message:
                    'Unit progress must be paired, bounded and match completion.',
            });
        }
    });

/** Deliberately excludes generated content, raw provider errors and private snapshots. */
export const GenerationRunSummarySchema = z
    .object({
        id: z.uuid(),
        conversationId: z.uuid(),
        noteId: z.uuid(),
        revision,
        state: GenerationRunStateSchema,
        pauseReason: GenerationRunPauseReasonSchema.optional(),
        tasks: z.array(GenerationTaskProgressSchema).min(1).max(8),
        completedTaskCount: z.number().int().min(0).max(8),
        totalTaskCount: z.number().int().min(1).max(8),
        activeTurnId: z.uuid().nullable(),
        uncertainTurnId: z.uuid().optional(),
        lastCommandRequestId: z.uuid().optional(),
        proposalId: z.uuid().nullable(),
        chargedCredits: credits,
        failure: GenerationFailureSchema.optional(),
        automation: GenerationAutomationSchema.optional(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
    })
    .strict()
    .superRefine((run, ctx) => {
        if (run.uncertainTurnId && run.state !== 'paused') {
            ctx.addIssue({
                code: 'custom',
                path: ['uncertainTurnId'],
                message:
                    'Only a paused run can require an attempt acknowledgement.',
            });
        }

        if (
            run.failure &&
            (run.state !== 'paused' ||
                !(run.failure.code === 'admission-blocked'
                    ? [
                          'technical-failure',
                          'budget',
                          'source-changed',
                      ].includes(run.pauseReason ?? '')
                    : ['technical-failure', 'interrupted'].includes(
                          run.pauseReason ?? '',
                      )) ||
                (run.failure.taskId &&
                    !run.tasks.some((task) => task.id === run.failure!.taskId)))
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['failure'],
                message:
                    'Failure details must identify the current failed or interrupted run.',
            });
        }

        if (
            run.automation?.enabled &&
            !(
                run.state === 'running' ||
                (run.state === 'paused' && run.pauseReason === 'budget')
            )
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['automation'],
                message:
                    'Automatic continuation requires running work or an eligible budget pause.',
            });
        }

        if (run.state === 'discarded' && (run.failure || run.automation)) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'Discarded runs cannot retain failure or authorization details.',
            });
        }

        if (
            new Set(run.tasks.map((task) => task.id)).size !==
                run.tasks.length ||
            run.totalTaskCount !== run.tasks.length ||
            run.completedTaskCount !==
                run.tasks.filter((task) => task.status === 'completed').length
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['tasks'],
                message: 'Progress must match distinct task statuses.',
            });
        }

        if ((run.state === 'paused') !== (run.pauseReason !== undefined)) {
            ctx.addIssue({
                code: 'custom',
                path: ['pauseReason'],
                message: 'Only paused runs require a pause reason.',
            });
        }

        if ((run.state === 'running') !== (run.activeTurnId !== null)) {
            ctx.addIssue({
                code: 'custom',
                path: ['activeTurnId'],
                message: 'Only running runs have an active action.',
            });
        }

        if (
            run.state === 'discarded' &&
            run.tasks.some((task) => task.label !== task.kind)
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['tasks'],
                message: 'Discarded runs retain only generic task labels.',
            });
        }

        if (
            (run.state === 'completed') !== (run.proposalId !== null) ||
            (run.state === 'completed' &&
                run.completedTaskCount !== run.totalTaskCount)
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['proposalId'],
                message: 'Only complete runs expose a final proposal.',
            });
        }
    });

const taskIds = z
    .array(identity)
    .max(8)
    .refine(
        (ids) => new Set(ids).size === ids.length,
        'Task identities must be distinct.',
    );

export const GenerationPlanRevisionCandidateSchema = z
    .object({
        id: z.uuid(),
        baseRevision: revision,
        plan: GenerationPlanSchema,
        keptTaskIds: taskIds,
        changedTaskIds: taskIds,
        addedTaskIds: taskIds,
        removedTaskIds: taskIds,
    })
    .strict()
    .superRefine((candidate, ctx) => {
        const current = [
            ...candidate.keptTaskIds,
            ...candidate.changedTaskIds,
            ...candidate.addedTaskIds,
        ];
        const all = [...current, ...candidate.removedTaskIds];

        if (
            new Set(all).size !== all.length ||
            current.length !== candidate.plan.tasks.length ||
            candidate.plan.tasks.some((task) => !current.includes(task.id))
        ) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'Revision changes must partition the candidate tasks and removed identities.',
            });
        }
    });

export const GenerationRunDetailSchema = z
    .object({
        run: GenerationRunSummarySchema,
        plan: GenerationPlanSchema.optional(),
        revisionCandidate: GenerationPlanRevisionCandidateSchema.optional(),
    })
    .strict()
    .superRefine((detail, ctx) => {
        // Discard removes private requirements; tombstones must not recreate them in readback.
        if (detail.run.state === 'discarded') {
            if (detail.plan || detail.revisionCandidate) {
                ctx.addIssue({
                    code: 'custom',
                    message:
                        'Discarded runs cannot expose plans or revision candidates.',
                });
            }

            return;
        }

        if (!detail.plan) {
            ctx.addIssue({
                code: 'custom',
                path: ['plan'],
                message:
                    'Active and completed runs require their current plan.',
            });

            return;
        }

        const planTasks = new Map(
            detail.plan.tasks.map((task) => [task.id, task.kind]),
        );

        if (
            detail.run.tasks.length !== planTasks.size ||
            detail.run.tasks.some(
                (task) => planTasks.get(task.id) !== task.kind,
            )
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['plan'],
                message: 'Run progress must describe its current plan.',
            });
        }

        if (
            detail.revisionCandidate &&
            (detail.run.state !== 'paused' ||
                detail.revisionCandidate.baseRevision !== detail.run.revision)
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['revisionCandidate'],
                message: 'A candidate must revise the current paused plan.',
            });
        }
    });
export const GenerationRunsResponseSchema = z
    .object({ runs: z.array(GenerationRunSummarySchema).max(100) })
    .strict();
export const ContinueGenerationRunRequestSchema = z
    .object({
        ...mutation,
        acknowledgedUncertainTurnId: z.uuid().optional(),
        confirmedQuoteId: z.uuid().optional(),
        sourceChoice: sourceChoice.optional(),
    })
    .strict();
export const ReviseGenerationRunRequestSchema = z
    .object({
        ...mutation,
        instruction: z.string().trim().min(1).max(4_000),
        acknowledgedUncertainTurnId: z.uuid().optional(),
        confirmedQuoteId: z.uuid().optional(),
    })
    .strict();
export const ApplyGenerationPlanRevisionRequestSchema = z
    .object({ ...mutation, candidateId: z.uuid() })
    .strict();
export const ResolveGenerationRunSourceRequestSchema = z
    .object({
        ...mutation,
        choice: sourceChoice,
        sourceId: identity.optional(),
        editorContext: ConversationEditorContextSchema.optional(),
    })
    .strict()
    .superRefine((request, ctx) => {
        const hasSource = request.sourceId !== undefined;
        const hasContext = request.editorContext !== undefined;

        if (
            hasSource !== hasContext ||
            ((hasSource || hasContext) && request.choice !== 'refresh')
        ) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'A fresh selection requires both source identity and editor context, only when refreshing.',
            });
        }

        const context = request.editorContext;
        if (!context) {
            return;
        }

        const anchor = context.editorTarget;
        const matchesSelection =
            context.selectedText !== undefined &&
            context.selectedText.trim().length > 0 &&
            context.selectedText === anchor.originalText &&
            anchor.to > anchor.from &&
            anchor.to <= context.content.length &&
            context.content.slice(anchor.from, anchor.to) ===
                anchor.originalText;

        if (!context.workingBranch || !matchesSelection) {
            ctx.addIssue({
                code: 'custom',
                path: ['editorContext'],
                message:
                    'Refresh requires a current branch and exact nonempty editor selection.',
            });
        }
    });
export const DiscardGenerationRunRequestSchema = z.object(mutation).strict();
export const StopGenerationRunRequestSchema = z.object(mutation).strict();

export type GenerationRunSummary = z.infer<typeof GenerationRunSummarySchema>;
export type GenerationFailure = z.infer<typeof GenerationFailureSchema>;
export type GenerationAutomation = z.infer<typeof GenerationAutomationSchema>;
export type GenerationRunDetail = z.infer<typeof GenerationRunDetailSchema>;
export type GenerationPlanRevisionCandidate = z.infer<
    typeof GenerationPlanRevisionCandidateSchema
>;
export type ContinueGenerationRunRequest = z.infer<
    typeof ContinueGenerationRunRequestSchema
>;
export type ReviseGenerationRunRequest = z.infer<
    typeof ReviseGenerationRunRequestSchema
>;
export type ApplyGenerationPlanRevisionRequest = z.infer<
    typeof ApplyGenerationPlanRevisionRequestSchema
>;
export type ResolveGenerationRunSourceRequest = z.infer<
    typeof ResolveGenerationRunSourceRequestSchema
>;
export type DiscardGenerationRunRequest = z.infer<
    typeof DiscardGenerationRunRequestSchema
>;
export type StopGenerationRunRequest = z.infer<
    typeof StopGenerationRunRequestSchema
>;
