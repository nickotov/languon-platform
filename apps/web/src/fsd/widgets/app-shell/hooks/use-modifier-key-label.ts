import { useEffect, useState } from 'react';
export function useModifierKeyLabel() {
    const [label, setLabel] = useState('Ctrl');
    useEffect(() => {
        if (/Mac|iPhone|iPad/.test(navigator.platform)) setLabel('⌘');
    }, []);
    return label;
}
