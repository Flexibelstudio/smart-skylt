import { getPostGeometry, GeometryLayout, PostGeometry } from './postGeometry';

export interface PostDefaults extends PostGeometry {
    durationSeconds: number;
    bodyAnchor: 'top';
    bodyMaxLines: number;
    textAlign: 'center';
    headlineShadowType: 'soft';
    headlineShadowColor: string;
    bodyShadowType: 'soft';
    bodyShadowColor: string;
}

// Gemensamma standardvärden för nya inlägg, oavsett om de skapas i editorn
// eller som snabbinlägg. Innehåll och de fält där vyerna medvetet skiljer sig
// hör inte hemma här.
export const getPostDefaults = (layout: GeometryLayout, isPortrait: boolean): PostDefaults => ({
    ...getPostGeometry(layout, isPortrait),
    durationSeconds: 15,
    bodyAnchor: 'top',
    bodyMaxLines: 4,
    textAlign: 'center',
    headlineShadowType: 'soft',
    headlineShadowColor: 'rgba(0, 0, 0, 0.95)',
    bodyShadowType: 'soft',
    bodyShadowColor: 'rgba(0, 0, 0, 0.95)',
});
