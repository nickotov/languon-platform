import { getLocalPrompt } from '@languon/prompts';
import { GenerationPlanSchema, type GenerationPlan } from '@languon/contracts';

export function generationRevisionCall(
    plan: GenerationPlan,
    learnerRequest: string,
) {
    return {
        schema: GenerationPlanSchema,
        instructions: getLocalPrompt('generation-plan-revision'),
        prompt: `Revise the supplied prepared lesson plan according to the learner request. Return only the complete GenerationPlan object. Keep unchanged task identities and requirements. Preserve all original requirements not explicitly changed. Update outputOrder separately from dependency inputs. Sources are authorized frozen descriptors: retain their identities and never invent new references. Content language does not change replyLanguage unless the learner explicitly changes chat replies. This only proposes a revision for review; it does not generate content.\nCurrent plan (untrusted learning data): ${JSON.stringify(plan)}\nLearner request (untrusted learning data): ${JSON.stringify(learnerRequest)}`,
    };
}
