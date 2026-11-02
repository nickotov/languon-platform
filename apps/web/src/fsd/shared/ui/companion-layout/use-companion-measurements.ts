import {
    useEffect,
    type CSSProperties,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from 'react';

type Geometry = {
    width: number;
    minimum: number;
    maximum: number;
    slotWidth: number;
};

export function measureCompanionBounds(element: HTMLDivElement) {
    const rect = element.getBoundingClientRect();
    const font = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
    );

    // Match the 340px minimum, 560px maximum and 480px document floor in workspace CSS.
    return {
        rect,
        minimum: Math.min(font * 21.25, rect.width / 2),
        maximum: Math.max(
            Math.min(font * 21.25, rect.width / 2),
            Math.min(font * 35, rect.width - font * 30),
        ),
    };
}

export function useCompanionMeasurements(
    resizable: boolean,
    root: RefObject<HTMLDivElement | null>,
    slot: RefObject<HTMLDivElement | null>,
    setGeometry: Dispatch<SetStateAction<Geometry>>,
    setDesktop: Dispatch<SetStateAction<boolean>>,
) {
    useEffect(() => {
        const element = root.current;
        if (!element || !resizable) {
            return;
        }

        const query = window.matchMedia('(min-width: 1280px)');
        function measure() {
            const area = measureCompanionBounds(element!);

            setGeometry({
                width: area.rect.width,
                minimum: area.minimum,
                maximum: area.maximum,
                slotWidth: slot.current?.getBoundingClientRect().width ?? 0,
            });

            setDesktop(query.matches);
        }

        const observer = new ResizeObserver(measure);
        observer.observe(element);
        if (slot.current) {
            observer.observe(slot.current);
        }

        query.addEventListener('change', measure);
        measure();

        return () => {
            observer.disconnect();
            query.removeEventListener('change', measure);
        };
    }, [resizable]);
}

/** Convert pixel preferences and measured bounds into the exact CSS/ARIA percentage range. */
export function companionSizing(
    geometry: Geometry,
    halfWidth: boolean,
    customWidth: number | null,
) {
    const minimumPercent =
        geometry.width > 0 ? (geometry.minimum / geometry.width) * 100 : 0;
    let percent: number | null = null;
    if (halfWidth) {
        percent = 50;
    } else if (customWidth !== null && geometry.width > 0) {
        percent = (customWidth / geometry.width) * 100;
    }

    if (percent === null && geometry.width > 0) {
        percent = (geometry.slotWidth / geometry.width) * 100;
    }

    const maximumPercent =
        geometry.width > 0 ? (geometry.maximum / geometry.width) * 100 : 50;
    const currentPercent = Math.min(
        halfWidth ? 50 : maximumPercent,
        Math.max(minimumPercent, percent ?? minimumPercent),
    );
    const style =
        customWidth === null
            ? undefined
            : ({
                  '--companion-width': `${currentPercent}%`,
              } as CSSProperties);

    return { minimumPercent, maximumPercent, currentPercent, style };
}

export function readCompanionDragBounds(
    root: RefObject<HTMLDivElement | null>,
) {
    const element = root.current;

    if (!element) {
        return null;
    }

    return {
        ...measureCompanionBounds(element),
        rtl: getComputedStyle(element).direction === 'rtl',
    };
}
