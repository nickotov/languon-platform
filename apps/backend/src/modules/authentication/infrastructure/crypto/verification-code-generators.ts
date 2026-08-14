import type {
    EntropySource,
    VerificationCodeGenerator,
} from '../../application/ports/entropy';

const fixedDevelopmentCode = '0000';
const codeSpace = 10_000;
const unsignedSixteenBitSpace = 65_536;
const rejectionBoundary =
    unsignedSixteenBitSpace - (unsignedSixteenBitSpace % codeSpace);

export class FixedVerificationCodeGenerator implements VerificationCodeGenerator {
    public generate(): string {
        return fixedDevelopmentCode;
    }
}

export class RandomVerificationCodeGenerator implements VerificationCodeGenerator {
    public constructor(private readonly entropy: EntropySource) {}

    public generate(): string {
        for (;;) {
            const bytes = this.entropy.randomBytes(2);

            if (bytes.byteLength !== 2) {
                throw new Error(
                    'The entropy source returned an unexpected byte length.',
                );
            }

            const candidate = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);

            if (candidate < rejectionBoundary) {
                return (candidate % codeSpace).toString().padStart(4, '0');
            }
        }
    }
}
