// Central förteckning över AI-modeller. Byt modell HÄR — aldrig i anropen.
export const AI_MODELS = {
  TEXT: 'gemini-3.5-flash',
  TEXT_LIGHT: 'gemini-2.5-flash',
  IMAGE: 'gemini-2.5-flash-image',
  IMAGE_GENERATION: 'imagen-4.0-generate-001',
} as const;
