import { Organization, UserData, CustomPage, SystemSettings, ScreenPairingCode, CustomEvent, PostTemplate, PhysicalScreen, MediaItem, AiAutomation, SuggestedPost } from '../types';

export const MOCK_SYSTEM_OWNER: UserData = {
    uid: 'offline_owner_uid',
    email: 'owner@smart.app',
    role: 'systemowner'
};

export const MOCK_ORG_ADMIN: UserData = {
    uid: 'offline_admin_uid',
    email: 'admin@smart.app',
    role: 'organizationadmin',
    organizationId: 'org_flexibel_mock',
    adminRole: 'superadmin',
    screenPin: '1234',
};

// FIX: Initialize MOCK_PAIRING_CODES with mock data and correct the type to ScreenPairingCode[].
export const MOCK_PAIRING_CODES: ScreenPairingCode[] = [
    { code: 'ABC123', createdAt: new Date(), status: 'pending' },
    { code: 'XYZ789', createdAt: new Date(), status: 'paired', organizationId: 'org_flexibel_mock', pairedDeviceId: 'phys_123', assignedDisplayScreenId: 'screen_flexibel_1' }
];

// FIX: Added missing MOCK_ORGANIZATIONS export.
export const MOCK_ORGANIZATIONS: Organization[] = [
    {
        id: 'org_flexibel_mock',
        name: 'Flexibel Friskvård & Hälsa (Offline)',
        brandName: 'Flexibel Hälsostudio (Offline)',
        subdomain: 'flexibel-offline',
        email: 'admin@smart.app',
        displayScreens: [
            {
                id: 'screen_flexibel_1',
                name: 'Huvudskärm',
                isEnabled: true,
                posts: [
                    {
                        id: 'post1',
                        internalTitle: 'Välkommen!',
                        layout: 'text-only',
                        headline: 'Välkommen till Flexibel!',
                        body: 'Ditt center för friskvård och hälsa.',
                        durationSeconds: 10,
                    }
                ],
                aspectRatio: '16:9',
            }
        ],
        customPages: [],
        mediaLibrary: [],
    }
];

// FIX: Added missing MOCK_SYSTEM_SETTINGS export.
export const MOCK_SYSTEM_SETTINGS: SystemSettings = {
    id: 'main',
    basePriceIncludingFirstScreen: 99,
    pricePerScreenAdditional: 49,
};