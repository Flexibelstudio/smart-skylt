export type GeometryLayout = 'image-fullscreen' | 'image-left' | 'image-right' | 'real-estate' | 'text-only' | 'collage';

export interface PostGeometry {
    headlineFontScale: number;
    bodyFontScale: number;
    headlinePositionX: number;
    headlinePositionY: number;
    headlineWidth: number;
    bodyPositionX: number;
    bodyPositionY: number;
    bodyWidth: number;
    qrPositionX: number;
    qrPositionY: number;
    qrWidth: number;
}

// Enda källan för inläggens typografi och textpositioner. Används av både
// editorn och snabbinlägget. Ändras ett värde här ändras det överallt.
export const getPostGeometry = (layout: GeometryLayout, isPortrait: boolean): PostGeometry => {
    const headlineFontScale = layout === 'image-fullscreen' ? (isPortrait ? 8.5 : 5.5) : (isPortrait ? 5.5 : 3.6);
    const bodyFontScale = layout === 'image-fullscreen' ? (isPortrait ? 4.2 : 3.0) : (isPortrait ? 3.8 : 2.5);

    if (layout === 'image-fullscreen') {
        return { headlineFontScale, bodyFontScale,
            headlinePositionX: 50, headlinePositionY: 68, headlineWidth: 90,
            bodyPositionX: 50, bodyPositionY: 75, bodyWidth: 90,
            qrPositionX: isPortrait ? 86 : 89, qrPositionY: isPortrait ? 89 : 84, qrWidth: 15 };
    }
    if (layout === 'image-left') {
        return isPortrait
            ? { headlineFontScale, bodyFontScale, headlinePositionX: 50, headlinePositionY: 64, headlineWidth: 90,
                bodyPositionX: 50, bodyPositionY: 73, bodyWidth: 90, qrPositionX: 86, qrPositionY: 89, qrWidth: 15 }
            : { headlineFontScale, bodyFontScale, headlinePositionX: 75, headlinePositionY: 40, headlineWidth: 42,
                bodyPositionX: 75, bodyPositionY: 50, bodyWidth: 42, qrPositionX: 89, qrPositionY: 84, qrWidth: 15 };
    }
    if (layout === 'image-right') {
        return isPortrait
            ? { headlineFontScale, bodyFontScale, headlinePositionX: 50, headlinePositionY: 20, headlineWidth: 90,
                bodyPositionX: 50, bodyPositionY: 29, bodyWidth: 90, qrPositionX: 86, qrPositionY: 89, qrWidth: 15 }
            : { headlineFontScale, bodyFontScale, headlinePositionX: 25, headlinePositionY: 40, headlineWidth: 42,
                bodyPositionX: 25, bodyPositionY: 50, bodyWidth: 42, qrPositionX: 89, qrPositionY: 84, qrWidth: 15 };
    }
    if (layout === 'real-estate') {
        return { headlineFontScale, bodyFontScale,
            headlinePositionX: 50, headlinePositionY: 30, headlineWidth: 80,
            bodyPositionX: 50, bodyPositionY: 53, bodyWidth: 80,
            qrPositionX: 50, qrPositionY: 82, qrWidth: 15 };
    }
    if (layout === 'collage') {
        return {
            headlineFontScale,
            bodyFontScale,
            headlinePositionX: 50,
            headlinePositionY: 45,
            headlineWidth: 90,
            bodyPositionX: 50,
            bodyPositionY: 55,
            bodyWidth: 90,
            qrPositionX: isPortrait ? 86 : 89,
            qrPositionY: isPortrait ? 89 : 84,
            qrWidth: 15
        };
    }
    // text-only: centrerat standardläge
    return { headlineFontScale, bodyFontScale,
        headlinePositionX: 50, headlinePositionY: 40, headlineWidth: 80,
        bodyPositionX: 50, bodyPositionY: 58, bodyWidth: 80,
        qrPositionX: 92, qrPositionY: 92, qrWidth: 15 };
};
