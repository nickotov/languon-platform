import componentStyles from '../../styles/library-states-common.module.css';
import { Skeleton } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../../hooks/use-interface-text';

export function LibrarySkeleton({ rows = 5 }: { rows?: number }) {
    const { L } = useInterfaceText();

    return (
        <div
            role='status'
            aria-label={L('loading')}
            className={componentStyles.root}
        >
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={componentStyles.skeletonRow}>
                    <Skeleton variant='rect' width={20} height={20} />
                    <div className={componentStyles.skeletonContent}>
                        <Skeleton
                            variant='rect'
                            width={`${70 - (i % 3) * 12}%`}
                            height='1.1rem'
                        />
                        <Skeleton variant='rect' width='40%' height='0.85rem' />
                    </div>
                </div>
            ))}
        </div>
    );
}
