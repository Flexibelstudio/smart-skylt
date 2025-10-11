import { Organization, UserData, CustomPage, SystemSettings, ScreenPairingCode, CustomEvent, PostTemplate, PhysicalScreen, MediaItem } from '../types';

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

export const MOCK_PAIRING_CODES: ScreenPairingCode[] = [
    { code: 'ABC123', createdAt: new Date(), status: 'pending' }
];

// NEW: Mock data for physically connected screens
const MOCK_PHYSICAL_SCREENS_DATA: PhysicalScreen[] = [
    { 
        id: 'phys_xyz_789', 
        name: 'Kanal alla butiker (Stående)', 
        organizationId: 'org_flexibel_mock', 
        displayScreenId: 'ds_1', 
        pairedAt: '2024-01-15T10:00:00.000Z', 
        pairedByUid: 'offline_admin_uid' 
    },
    { 
        id: 'phys_abc_123', 
        name: 'Café-TV (Liggande)', 
        organizationId: 'org_flexibel_mock', 
        displayScreenId: 'ds_2', 
        pairedAt: '2023-11-20T09:00:00.000Z', 
        pairedByUid: 'offline_admin_uid' 
    },
];


const MOCK_CUSTOM_PAGES: CustomPage[] = [
    { 
        id: 'mock_page_1', 
        title: 'Vår Filosofi', 
        tabs: [
            { id: 'tab_1_1', title: 'Grundpelare', content: '# Vår Filosofi\n\nVi tror på funktionell träning som bygger en stark och hållbar kropp för livet.' },
            { id: 'tab_1_2', title: 'Metodik', content: '## Vår Metodik\n\nVi kombinerar styrka, kondition och rörlighet för att skapa kompletta atleter.' }
        ]
    },
    { 
        id: 'mock_page_2', 
        title: 'Kom Igång Guide', 
        tabs: [
            { id: 'tab_2_1', title: 'Välkommen!', content: '## Välkommen!\n\nBörja med att boka in ditt första pass via appen. Vi ser fram emot att träffa dig!' }
        ]
    },
];

const MOCK_CUSTOM_EVENTS: CustomEvent[] = [
    { id: 'evt_summer_party', name: 'Sommarfest', date: '2024-07-20', icon: '☀️' },
    { id: 'evt_reopening', name: 'Nyöppning Kärra', date: '2024-08-12', icon: '🎉' },
];

const MOCK_POST_TEMPLATES: PostTemplate[] = [
    {
        id: 'template_lunch',
        templateName: 'Dagens Lunch',
        postData: {
            layout: 'text-only',
            headline: 'Dagens Lunch',
            headlineFontSize: '7xl',
            body: '- Dagens Kött\n- Dagens Fisk\n- Dagens Vegetariska',
            bodyFontSize: '2xl',
            durationSeconds: 20,
            backgroundColor: 'white',
            textColor: 'black',
        }
    },
    {
        id: 'template_property',
        templateName: 'Ny Fastighet',
        postData: {
            layout: 'image-left',
            headline: 'Nytt objekt till salu!',
            headlineFontSize: '5xl',
            body: 'Beskrivning av fastigheten här...',
            bodyFontSize: 'lg',
            durationSeconds: 15,
            imageUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlyeT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzgwODQ4OCI+SG9tZTwvdGV4dD48L3N2Zz4=',
        }
    }
];

const MOCK_MEDIA_LIBRARY: MediaItem[] = [
    {
        id: 'mock-media-1',
        type: 'image',
        url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4MDAgNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzI2MjYyNiIvPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2VlZSIgc3Ryb2tlLXdpZHRoPSIxMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSI0MDAiIGN5PSIyMDAiIHI9IjMwIi8+PHBhdGggZD0iTTQwMCwyMzAgTDQwMCwzMDAgTDM1MCwzNTAgTTQwMCwzMDAgTDQ1MCwzNTAiLz48cGF0aCBkPSJNMzYwLDI2MCBMNDQwLDI2MCIvPjxwYXRoIGQ9Ik0zMjAsNDAwIEwzNTAsMzUwIE00ODAsNDAwIEw0NTAsMzUwIi8+PC9nPjwvc3ZnPg==',
        internalTitle: 'Yoga icon',
        createdAt: new Date().toISOString(),
        createdBy: 'user',
    },
     {
        id: 'mock-media-2',
        type: 'image',
        url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4MDAgNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzM2NTM2YiIvPjxnIGZpbGw9IiNkZmUxZTAiPjxwYXRoIGQ9Ik0yNTAgNDAwIEwyNTAgMjUwIEw1NTAgMjUwIEw1NTAgNDAwIFoiLz48cGF0aCBkPSJNMjIwIDI2MCBMNTgwIDI2MCBMNDAwIDE1MCBaIi8+PHJlY3QgeD0iMzYwIiB5PSIzMjAiIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIvPjwvZz48L3N2Zz4=',
        internalTitle: 'House icon',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        createdBy: 'ai',
        aiPrompt: 'a simple house icon',
    }
];


export const MOCK_ORGANIZATIONS: Organization[] = [
    {
        id: 'org_flexibel_mock',
        name: 'Smart Skyltning (Offline)',
        subdomain: 'smart-offline',
        address: 'Exempelgatan 1, 123 45 Exempelstad',
        email: 'kontakt@smartskylt.se',
        phone: '08-123 45 67',
        contactPerson: 'Erik Exempel',
        orgNumber: '556000-0000',
        logoUrlLight: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiB2aWV3Qm94PSIwIDAgMzYgMzYiPjxwYXRoIGZpbGw9IiMwMDAwMDAiIGQ9Ik0zNC4zMyAyMS4yMmEyLjY3IDIuNjcgMCAwIDEtMS43Ni42OGwtMy4yMy40MWExMi42MyAxMi42MyAwIDAgMS0yLjU4IDMuNTFsMS42NCAyLjg0YTIuNjYgMi42NiAwIDAgMS0uMjIgMy40OWEyLjcxIDIuNzEgMCAwIDEtMy41MS4yMmwtMi44NC0xLjYxYTEyLjUyIDEyLjUyIDAgMCAxLTQuMTEgMnYzLjMxYTIuNjkgMi42OSAwIDAgMS0yLjY3IDIuNjhoLS41OGEyLjY5IDIuNjkgMCAwIDEtMi42Ny0yLjY5di0zLjMxYTEyLjQ0IDEyLjQ0IDAgMCAxLTQuMDgtMmwtMi44NCAxLjYxYTIuNzEgMi43MSAwIDAgMS0zLjUxLS4yMmEyLjY2IDIuNjYgMCAwIDEtLjIyLTMuNDlsMS42NC0yLjg0YTEyLjYzIDEyLjYzIDAgMCAxLTIuNTgtMy41MWwtMy4yMy0uNDFhMi42NyAyLjY3IDAgMCAxLTEuNzYtLjY4YTIuNjQgMi42NCAwIDAgMS0xLTIuMjh2LS41OGEyLjY0IDIuNjQgMCAwIDEgMS0yLjJhMi42NyAyLjY3IDAgMCAxIDEuNzYtLjY4bDMuMjMtLjQxYTEyLjYzIDEyLjYzIDAgMCAxIDIuNTgtMy41MUw0LjE0IDguNjVBMi42NiAyLjY2IDAgMCAxIDQuMzYgNS4xNmEyLjcxIDIuNzEgMCAwIDEgMy41MS0uMjJsMi44NCAxLjYxYTEyLjUyIDEyLjUyIDAgMCAxIDQuMTEtMlYxLjI0QTIuNjkgMi42OSAwIDAgMSAxNy41IDBoLjU4YTIuNjkgMi42OSAwIDAgMSAyLjY3IDIuNjl2My4zMWExMi40NCAxMi40NCAwIDAgMSA0LjA4IDJsMi44NC0xLjYxYTIuNzEgMi43MSAwIDAgMSAzLjUxLjIyYTIuNjYgMi42NiAwIDAgMSAuMjIgMy40OWwtMS42NCAyLjg0YTEyLjYzIDEyLjYzIDAgMCAxIDIuNTggMy41MWwzLjIzLjQxYTIuNjcgMi42NyAwIDAgMSAxLjc2LjY4YTIuNjQgMi42NCAwIDAgMSAxIDIuMjh2LjU4YTIuNjQgMi42NCAwIDAgMS0xIDIuMjNNMTggMTIuNDJBNS41OCA1LjU4IDAgMSAwIDIzLjU4IDE4QTUuNTggNS41OCAwIDAgMCAxOCAxMi40MiIgY2xhc3M9ImNsci1pLXNvbGlkIGNsci1pLXNvbGlkLXBhdGgtMSIvPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0wIDBoMzZ2MzZIMHoiLz48L3N2Zz4=',
        logoUrlDark: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDI0IDI0IiB4bWw6c3BhY2U9InByZXNlcnZlIiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PHBhdGggZD0iTTEyLDBDNS40LDAsMCw1LjQsMCwxMnM1LjQsMTIsMTIsMTJzMTItNS40LDEyLTEyUzE4LjYsMCwxMiwweiBNMTIsMjEuNmMtNS4zLDAtOS42LTQuMy05LjYtOS42UzYuNywyLjQsMTIsMi40czkuNiw0LjMsOS42LDkuNlMxNy4zLDIxLjYsMTIsMjEuNnogTTEyLDcuMmMtMi42LDAtNC44LDIuMS00LjgsNC44czIuMSw0LjgsNC44LDQuOHM0LjgtMi4xLDQuOC00LjhTMTQuNiw3LjIsMTIsNy4yeiBNMTIsMTQuNGMtMS4zLDAtMi40LTEuMS0yLjQtMi40YzAtMS4zLDEuMS0yLjQsMi40LTIuNGMxLjMsMCwyLjQsMS4xLDIuNCwyLjRDMTQuNCwxMy4zLDEzLjMsMTQuNCwxMiwxNC40eiIvPjwvc3ZnPg==',
        primaryColor: '#14b8a6',
        secondaryColor: '#f97316',
        tertiaryColor: '#3b82f6',
        accentColor: '#ec4899',
        businessType: ['Gym/Hälsa'],
        businessDescription: 'Vi är ett premiumgym som fokuserar på funktionell träning, grupp-pass och personlig träning för en hållbar hälsa.',
        customPages: MOCK_CUSTOM_PAGES,
        customEvents: MOCK_CUSTOM_EVENTS,
        postTemplates: MOCK_POST_TEMPLATES,
        physicalScreens: MOCK_PHYSICAL_SCREENS_DATA,
        mediaLibrary: MOCK_MEDIA_LIBRARY,
        discountScreen: 10,
        infoCarousel: {
            isEnabled: true,
            messages: [
                {
                    id: 'msg1',
                    internalTitle: 'Välkomstkampanj',
                    headline: 'Välkommen tillbaka!',
                    body: 'Nu kör vi igång höstterminen med ny energi. Boka din plats på passen i appen!',
                    layout: 'text-only',
                    animation: 'fade',
                    durationSeconds: 10,
                    visibleInLocations: ['all']
                },
                {
                    id: 'msg2',
                    internalTitle: 'Teknikvecka Kärra',
                    headline: 'Teknikvecka i Kärra!',
                    body: 'Denna vecka fokuserar vi extra på tekniken i ryck och stöt. Kom och finslipa formen!',
                    layout: 'image-left',
                    imageUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZmZmZiI+PHBhdGggZD0iTTMgM2gxOHYxOEgzeiIvPjwvc3ZnPg==',
                    animation: 'slide-left',
                    durationSeconds: 15,
                    startDate: '2024-01-01T00:00:00.000Z',
                    endDate: '2025-12-31T23:59:59.000Z',
                    visibleInLocations: ['studio_karra_mock']
                }
            ]
        },
        displayScreens: [
            {
                id: 'ds_1',
                name: 'Kanal alla butiker (Stående)',
                isEnabled: true,
                aspectRatio: '9:16',
                branding: {
                    isEnabled: true,
                    showLogo: true,
                    showName: false,
                    position: 'bottom-left',
                },
                posts: [
                    {
                        id: 'post1',
                        internalTitle: 'Huvudkampanj',
                        layout: 'image-fullscreen',
                        headline: 'Ny termin, Nya möjligheter!',
                        body: 'Höstens schema är här. Upptäck nya pass och utmana dig själv.',
                        imageUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZmZmZiI+PHBhdGggZD0iTTMgM2gxOHYxOEgzeiIvPjwvc3ZnPg==',
                        durationSeconds: 15,
                        tagIds: ['tag_sale'],
                        subImages: [
                            { id: 'sub1', imageUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZmZmZiI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgMThjLTQuNDEgMC04LTMuNTktOC04czMuNTktOCA4LTggOCAzLjU5IDggOHptLTEtNWgydjJoLTJ6bTAtN2gydjVoLTJ6Ii8+PC9zdmc+' },
                            { id: 'sub2', imageUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzAwMDAwMCI+PHBhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0xMiA1Ljc5TDE4Ljk1IDEwLjUgMTIgMTUuMjEgNS4wNSA5LjUgMTIgNS43OU0xMiAyTDIgOUw3IDEyTDQgMTVMMTIgMjJMMjAgMTVMNyAxMkwxMiA3TDcgM0wxMiAyWiIvPjwvc3ZnPg==' }
                        ],
                        subImageConfig: {
                            animation: 'fade',
                            position: 'bottom-right',
                            size: 'md',
                            intervalSeconds: 5
                        }
                    }
                ]
            },
            {
                id: 'ds_2',
                name: 'Café-TV (Liggande)',
                isEnabled: true,
                aspectRatio: '16:9',
                posts: [
                    {
                        id: 'post2',
                        internalTitle: 'Kaffereklam',
                        layout: 'text-only',
                        headline: 'Dagens deal: Kaffe & bulle 35kr',
                        body: 'Gäller hela dagen för alla våra medlemmar.',
                        durationSeconds: 10,
                    }
                ]
            },
            {
                id: 'ds_3_local',
                name: 'Erbjudandeskärm',
                isEnabled: true,
                aspectRatio: '16:9',
                posts: [
                    {
                        id: 'post4_local',
                        internalTitle: 'PT-kampanj',
                        layout: 'text-only',
                        headline: 'Boka PT!',
                        body: 'Just nu 10% rabatt på 5-klipp.',
                        durationSeconds: 12,
                    }
                ]
            }
        ],
        tags: [
            { id: 'tag_sale', text: 'REA', backgroundColor: '#ef4444', textColor: '#FFFFFF', fontSize: '5xl', fontFamily: 'adscript', fontWeight: 'bold', animation: 'pulse', position: 'center', url: 'https://smartskylt.se' },
            { id: 'tag_new', text: 'Nyhet!', backgroundColor: '#3b82f6', textColor: '#FFFFFF', fontSize: 'sm', fontFamily: 'sans', fontWeight: 'bold', animation: 'glow', position: 'top-right' }
        ]
    }
];

export const MOCK_SYSTEM_SETTINGS: SystemSettings = {
    id: 'main',
    basePriceIncludingFirstScreen: 249,
    pricePerScreenAdditional: 199,
};