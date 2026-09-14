import { ImageResponse } from 'next/og';

export const size = { height: 64, width: 64 };
export const contentType = 'image/png';

export default function Icon() {
    return new ImageResponse(
        <div
            style={{
                alignItems: 'center',
                background: '#4f46e5',
                color: '#ffffff',
                display: 'flex',
                fontFamily: 'sans-serif',
                fontSize: 42,
                fontWeight: 800,
                height: '100%',
                justifyContent: 'center',
                width: '100%',
            }}
        >
            L
        </div>,
        size,
    );
}
