import { useEffect, useState } from 'react';
export function useIsCompact() {
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        const media = window.matchMedia('(max-width: 1023px)');
        const update = () => setCompact(media.matches);
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    return compact;
}
