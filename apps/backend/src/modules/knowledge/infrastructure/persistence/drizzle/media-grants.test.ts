import { describe, expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { knowledgeAudioAssetIds } from './media-grants';

const blockId = '00000000-0000-4000-8000-000000000001';
const preparedId = '00000000-0000-4000-8000-000000000002';
const assetId = '00000000-0000-4000-8000-000000000003';

describe('audio grants for prepared and unprepared blocks', () => {
    it('collects only actual assets and never treats an unprepared block as an asset grant', () => {
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: { block: { type: 'audio', id: blockId } },
                    },
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                type: 'audio',
                                id: preparedId,
                                assetId,
                            },
                        },
                    },
                ],
            },
        });
        expect(knowledgeAudioAssetIds(body)).toEqual([assetId]);
    });
});
