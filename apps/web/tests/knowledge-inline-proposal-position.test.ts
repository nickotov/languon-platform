import { expect, it } from 'vitest';
import { inlineProposalPosition } from '../src/fsd/features/knowledge-notes/lib/inline-proposal-position';

it('caps an inline proposal to 440px and anchors it to the final selected line', () => {
    expect(
        inlineProposalPosition(
            { top: 100, left: 200, width: 736 },
            { left: 440, bottom: 260 },
        ),
    ).toEqual({ top: 168, left: 228, width: 440 });
});

it('clamps the inline proposal at the final line near either document edge', () => {
    const root = { top: 100, left: 200, width: 736 };
    expect(inlineProposalPosition(root, { left: 200, bottom: 260 }).left).toBe(
        -8,
    );
    expect(inlineProposalPosition(root, { left: 900, bottom: 260 }).left).toBe(
        304,
    );
});

it('fits a narrow editor with the source eight-pixel gutters and scales with root text size', () => {
    expect(
        inlineProposalPosition(
            { top: 100, left: 20, width: 300 },
            { left: 30, bottom: 150 },
        ),
    ).toEqual({ top: 58, left: -8, width: 316 });
    expect(
        inlineProposalPosition(
            { top: 100, left: 20, width: 736 },
            { left: 30, bottom: 150 },
            20,
        ),
    ).toEqual({ top: 60, left: -5, width: 550 });
});
