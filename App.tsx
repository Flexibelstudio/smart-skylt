import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Page, MenuItem, Organization, CustomPage, UserRole, UserData, DisplayScreen, Tag, PostTemplate, DisplayPost } from './types';
import { useLocation } from './context/StudioContext';
import { useAuth } from './context/AuthContext';
import { createOrganization, updateOrganization, updateOrganizationLogos, isOffline, deleteOrganization, updateOrganizationDisplayScreens, updateOrganizationTags, setUserScreenPin, getOrganizationById, updateOrganizationPostTemplates } from './services/firebaseService';

import { getAppMode } from './utils/appMode';
import { SuperAdminScreen } from './components/SuperAdminScreen';
import { SystemOwnerScreen } from './components/SystemOwnerScreen';
import { CustomContentScreen } from './components/CustomContentScreen';
import { LoginScreen } from './components/LoginScreen';
import { DeveloperToolbar } from './components/DeveloperToolbar';
import { CustomPageEditorScreen } from './components/CustomPageEditorScreen';
import { DisplayWindowScreen } from './components/DisplayWindowScreen';
import { ReAuthModal } from './components/ReAuthModal';
import { DisplayScreenEditorScreen } from './components/DisplayScreenEditorScreen';
import { PairingScreen } from './components/PairingScreen';
import { useToast } from './context/ToastContext';
import { ConfirmDialog } from './components/ConfirmDialog';
import { BellIcon, QuestionMarkCircleIcon } from './components/icons';
import { useNotificationManager } from './hooks/useNotificationManager';
import { NotificationCenter } from './components/NotificationCenter';
import { HelpBot } from './components/HelpBot';
import { EnvironmentBadge } from './components/EnvironmentBadge';
import { AiGuideScreen } from './components/AiGuideScreen';

// --- NEW DISPLAY APP (for skylt.* domains) ---
const DisplayApp: React.FC = () => {
    const { currentUser, authLoading, signInAsScreen } = useAuth();
    const { selectedDisplayScreen, locationLoading } = useLocation();

    useEffect(() => {
        // Automatically sign in as an anonymous screen user if not logged in.
        if (!currentUser && !authLoading) {
            signInAsScreen().catch(err => {
                console.error("Automatic screen sign-in failed:", err);
            });
        }
    }, [currentUser, authLoading, signInAsScreen]);
    
    // Show a loading screen while auth, location data, or user object is being prepared.
    if (authLoading || locationLoading || !currentUser) {
        return <div className="bg-slate-900 text-white min-h-screen flex items-center justify-center">Startar skyltfönster...</div>;
    }

    // If a display screen is configured for this device, show it.
    if (selectedDisplayScreen) {
        // onBack is not used in this context, so we provide an empty function.
        return <DisplayWindowScreen onBack={() => {}} />;
    }

    // Otherwise, show the pairing screen to connect it to a channel.
    return (
        <div className="bg-slate-900 text-white min-h-screen">
            <PairingScreen />
        </div>
    );
};


// --- ADMIN/EMBED ROUTER ---
const AppRouter: React.FC = () => {
    const path = window.location.pathname;
    const embedMatch = path.match(/^\/embed\/org\/([^/]+)\/screen\/([^/]+)/);

    if (embedMatch) {
        const [, organizationId, screenId] = embedMatch;
        return <EmbedWrapper organizationId={organizationId} screenId={screenId} />;
    }

    return <AuthenticatedApp />;
};

const EmbedWrapper: React.FC<{ organizationId: string; screenId: string }> = ({ organizationId, screenId }) => {
    const { selectOrganization, selectDisplayScreen, selectedDisplayScreen } = useLocation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        const fetchAndSetData = async () => {
            try {
                const org = await getOrganizationById(organizationId);
                if (!org) {
                    throw new Error("Organisationen kunde inte hittas.");
                }
                const screen = org.displayScreens?.find(s => s.id === screenId);
                if (!screen) {
                    throw new Error("Skyltfönstret kunde inte hittas.");
                }
                selectOrganization(org);
                selectDisplayScreen(screen);
            } catch (err) {
                console.error("Embed fetch error:", err);
                setError(err instanceof Error ? err.message : "Ett okänt fel inträffade.");
            } finally {
                setLoading(false);
            }
        };
        fetchAndSetData();
    // Using selectOrganization and selectDisplayScreen in deps can cause re-renders.
    // They are stable from useCallback, but for this one-time setup, it's safer to omit them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationId, screenId]);

    if (loading) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">Laddar...</div>;
    }

    if (error) {
         return <div className="bg-black text-white min-h-screen flex items-center justify-center">{error}</div>;
    }
    
    if (!selectedDisplayScreen) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">Kunde inte ladda skyltfönster.</div>;
    }

    return <DisplayWindowScreen onBack={() => {}} isEmbedded={true} />;
};


// --- MAIN APP ROUTER ---
export default function App() {
    const appMode = getAppMode();

    if (appMode === 'display') {
        return <DisplayApp />;
    }
    
    return <AppRouter />;
}

// --- AUTHENTICATED ADMIN APP ---
const AuthenticatedApp: React.FC = () => {
  const { authLoading, currentUser, userData } = useAuth();
  const { locationLoading, selectedOrganization, selectOrganization, allOrganizations } = useLocation();
  
  useEffect(() => {
    // When a non-screen user logs in, ensure an organization is selected.
    if (!locationLoading && allOrganizations.length > 0 && !selectedOrganization) {
        // If the user is an org admin, select their specific organization.
        if (userData?.role === 'organizationadmin' && userData.organizationId) {
            const userOrg = allOrganizations.find(org => org.id === userData.organizationId);
            if (userOrg) {
                selectOrganization(userOrg);
            } else {
                // Fallback if their org isn't found for some reason (e.g., deleted)
                console.warn(`Admin's organization (${userData.organizationId}) not found in the list. Defaulting to the first one.`);
                selectOrganization(allOrganizations[0]);
            }
        } else {
            // For system owners or other roles, default to the first organization.
            selectOrganization(allOrganizations[0]);
        }
    }
  }, [locationLoading, allOrganizations, selectOrganization, selectedOrganization, userData]);

  if (authLoading || locationLoading) {
    return <div className="bg-slate-900 text-white min-h-screen flex items-center justify-center">Laddar...</div>;
  }
  
  if (!currentUser) {
    return <LoginScreen />;
  }
  
  // If a logged-in admin/owner
  return <MainContent />;
}

const THEME_STORAGE_KEY = 'smart-skylt-theme';

const MainContent: React.FC = () => {
  const { 
    selectOrganization, allOrganizations, setAllOrganizations,
    clearSelection, selectedDisplayScreen
  } = useLocation();
  const { role, userData, signOut } = useAuth();
  const { showToast } = useToast();
  
  const [history, setHistory] = useState<Page[]>([]);
  const page = history[history.length - 1];
  
  const [activeCustomPage, setActiveCustomPage] = useState<CustomPage | null>(null);
  const [customPageToEdit, setCustomPageToEdit] = useState<CustomPage | null>(null);
  const [screenToEdit, setScreenToEdit] = useState<DisplayScreen | null>(null);
  const [postToEdit, setPostToEdit] = useState<DisplayPost | null>(null);
  const [isReAuthModalOpen, setIsReAuthModalOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  });

  const { selectedOrganization } = useLocation();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationManager(selectedOrganization);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isHelpBotOpen, setIsHelpBotOpen] = useState(false);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationCenterRef = useRef<HTMLDivElement>(null);

  // Set the main page based on role when the component loads
  useEffect(() => {
    if (role === 'systemowner') {
      setHistory([Page.SystemOwner]);
    } else if (role === 'organizationadmin') {
      setHistory([Page.SuperAdmin]);
    }
  }, [role]);
  
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };
  
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [theme]);
  
  useEffect(() => {
    const root = document.documentElement;
    const primaryColor = selectedOrganization?.primaryColor;
    if (primaryColor) {
      root.style.setProperty('--color-brand', primaryColor);
    } else {
      root.style.removeProperty('--color-brand');
    }
  }, [selectedOrganization]);
  
    // Effect to close notification center on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                notificationCenterRef.current &&
                !notificationCenterRef.current.contains(event.target as Node) &&
                notificationButtonRef.current &&
                !notificationButtonRef.current.contains(event.target as Node)
            ) {
                setIsNotificationCenterOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);


  const navigateTo = (destinationPage: Page) => {
    setHistory(prev => [...prev, destinationPage]);
  };
  
  const handleBack = useCallback(() => {
    if (history.length <= 1) return;
    
    const currentPage = history[history.length - 1];
    if (currentPage === Page.DisplayScreenEditor) {
        setScreenToEdit(null);
        setPostToEdit(null);
    }

    const newHistory = history.slice(0, -1);
    
    // if going back to home, and original role is admin/owner, go to their main page instead
    if (newHistory.length === 0 && (role === 'systemowner' || role === 'organizationadmin')) {
      if (role === 'systemowner') setHistory([Page.SystemOwner]);
      else setHistory([Page.SuperAdmin]);
      return;
    }

    setHistory(newHistory);
  }, [history, role]);
  
  const handleCreateOrganization = async (orgData: Pick<Organization, 'name' | 'email'>) => {
    try {
        const newOrg = await createOrganization(orgData);
        setAllOrganizations(prev => [...prev, newOrg]);
        showToast({ message: `Organisationen "${orgData.name}" skapades.`, type: 'success' });
    } catch (error) {
        console.error("Failed to create organization:", error);
        showToast({ message: `Kunde inte skapa organisation: ${error instanceof Error ? error.message : "Ett okänt fel inträffade."}`, type: 'error' });
    }
  };

  const handleDeleteOrganization = async (organizationId: string) => {
    try {
        await deleteOrganization(organizationId);
        setAllOrganizations(prev => prev.filter(o => o.id !== organizationId));
        showToast({ message: `Organisationen togs bort.`, type: 'success' });
    } catch (error) {
         console.error("Failed to delete organization:", error);
         showToast({ message: "Kunde inte ta bort organisationen.", type: 'error' });
    }
  };
  
  const handleSignOut = () => {
    setConfirmState({
        isOpen: true,
        title: "Logga ut",
        message: "Är du säker på att du vill logga ut?",
        onConfirm: () => {
            signOut();
            setConfirmState(null);
        }
    });
  };
  
  const handleReturnToAdminFromDisplay = () => {
      clearSelection();
      setHistory([Page.SuperAdmin]);
  };

    const handleSetUserPin = async (uid: string, pin: string) => {
        try {
            await setUserScreenPin(uid, pin);
             showToast({ message: `PIN-kod sparad.`, type: 'success' });
        } catch (error) {
            console.error("Failed to set user screen PIN:", error);
            showToast({ message: "Kunde inte spara PIN-kod.", type: 'error' });
            // Re-throw to allow component to handle its own loading state
            throw error;
        }
    };

    const handleUpdateOrganizationForSystemOwner = useCallback(async (orgId: string, data: Partial<Organization>) => {
        try {
            const updatedOrg = await updateOrganization(orgId, data);
            setAllOrganizations(prev => prev.map(o => o.id === updatedOrg.id ? updatedOrg : o));
        } catch (e) {
            console.error("Failed to update organization from SystemOwnerScreen", e);
            showToast({ message: "Kunde inte uppdatera organisationen.", type: 'error' });
            throw e; // rethrow so component can handle loading state.
        }
    }, [setAllOrganizations, showToast]);


  const mainHeader = useMemo(() => {
      const headerTitle = page === Page.SystemOwner ? "SmartSkylt" : (selectedOrganization?.name || "Smart Skyltning");

      return (
          <div className="w-full bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="flex justify-between items-center h-16">
                      <div className="flex items-center">
                          {history.length > 1 && (
                              <button onClick={handleBack} className="text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors mr-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                  <span className="sr-only">Tillbaka</span>
                              </button>
                          )}
                          <span className="font-bold text-xl text-slate-900 dark:text-white">{headerTitle}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                          <button onClick={toggleTheme} className="text-slate-500 dark:text-slate-400 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                              {theme === 'dark' ? 
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> :
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                              }
                          </button>
                          <div className="relative">
                                <button
                                    ref={notificationButtonRef}
                                    onClick={() => setIsNotificationCenterOpen(prev => !prev)}
                                    className="text-slate-500 dark:text-slate-400 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative"
                                    aria-label={`Notifications (${unreadCount} unread)`}
                                >
                                    <BellIcon className="h-6 w-6" />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1 right-1 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 justify-center items-center text-white text-[9px] font-bold">
                                                {unreadCount > 9 ? '9+' : unreadCount}
                                            </span>
                                        </span>
                                    )}
                                </button>
                                {isNotificationCenterOpen && (
                                    <div ref={notificationCenterRef}>
                                        <NotificationCenter
                                            notifications={notifications}
                                            onMarkAsRead={markAsRead}
                                            onMarkAllAsRead={markAllAsRead}
                                            onClose={() => setIsNotificationCenterOpen(false)}
                                        />
                                    </div>
                                )}
                            </div>
                          <button onClick={handleSignOut} className="text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-500 font-semibold transition-colors px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">Logga ut</button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }, [page, selectedOrganization, toggleTheme, theme, handleSignOut, history.length, handleBack, notifications, unreadCount, isNotificationCenterOpen, markAsRead, markAllAsRead]);

  const renderPage = () => {
      switch (page) {
          case Page.SystemOwner:
              return <SystemOwnerScreen 
                        allOrganizations={allOrganizations}
                        onSelectOrganization={(org) => {
                            selectOrganization(org);
                            navigateTo(Page.SuperAdmin);
                        }}
                        onCreateOrganization={handleCreateOrganization}
                        onDeleteOrganization={handleDeleteOrganization}
                        onUpdateOrganization={handleUpdateOrganizationForSystemOwner}
                    />;

          case Page.SuperAdmin:
              if (!selectedOrganization || !userData) return <div>Välj en organisation.</div>;
              return <SuperAdminScreen
                  organization={selectedOrganization}
                  adminRole={userData.adminRole || 'admin'}
                  userRole={role}
                  theme={theme}
                  onSetUserScreenPin={handleSetUserPin}
                  onUpdateLogos={(orgId, logos) => updateOrganizationLogos(orgId, logos).then(selectOrganization)}
                  onUpdateOrganization={(orgId, data) => updateOrganization(orgId, data).then(selectOrganization)}
                  onUpdateDisplayScreens={(orgId, screens) => updateOrganizationDisplayScreens(orgId, screens).then(selectOrganization)}
                  onUpdateTags={(orgId, tags) => updateOrganizationTags(orgId, tags).then(selectOrganization)}
                  onUpdatePostTemplates={(orgId, templates) => updateOrganizationPostTemplates(orgId, templates).then(selectOrganization)}
                  onEditDisplayScreen={(screen, post) => {
                    setScreenToEdit(screen);
                    setPostToEdit(post || null);
                    navigateTo(Page.DisplayScreenEditor);
                  }}
                  onShowAiGuide={() => navigateTo(Page.AiGuide)}
              />;
          
          case Page.CustomContent:
              if (!activeCustomPage) return <div>Inget innehåll valt.</div>;
              return <CustomContentScreen page={activeCustomPage} />;

          case Page.CustomPageEditor:
              return <CustomPageEditorScreen
                  pageToEdit={customPageToEdit}
                  onSave={async (p) => {
                      const newPages = (selectedOrganization?.customPages || []).filter(cp => cp.id !== p.id);
                      newPages.push(p);
                      // FIX: `onUpdateOrganization` is not defined in this scope. Replaced with `updateOrganization` from firebaseService and `selectOrganization` from context to update the state.
                      await updateOrganization(selectedOrganization!.id, { customPages: newPages }).then(selectOrganization);
                      setCustomPageToEdit(null);
                      handleBack();
                  }}
                  onCancel={() => { setCustomPageToEdit(null); handleBack(); }}
              />

          case Page.DisplayWindow:
              if (!selectedDisplayScreen) return <div>Välj en skärm.</div>;
              return <DisplayWindowScreen onBack={handleReturnToAdminFromDisplay} />;
          
          case Page.DisplayScreenEditor:
              if (!screenToEdit || !selectedOrganization) return <div>Ingen skärm vald för redigering.</div>
              return <DisplayScreenEditorScreen 
                screen={screenToEdit} 
                initialPostToEdit={postToEdit}
                onUpdateDisplayScreens={(orgId, screens) => updateOrganizationDisplayScreens(orgId, screens).then(selectOrganization)} 
                onUpdateOrganization={(orgId, data) => updateOrganization(orgId, data).then(selectOrganization)}
              />
              
          case Page.AiGuide:
              return <AiGuideScreen />;

          default:
              if (role === 'systemowner') return <SystemOwnerScreen allOrganizations={allOrganizations} onSelectOrganization={selectOrganization} onCreateOrganization={handleCreateOrganization} onDeleteOrganization={handleDeleteOrganization} onUpdateOrganization={handleUpdateOrganizationForSystemOwner}/>;
              if (role === 'organizationadmin') {
                  if (!selectedOrganization || !userData) return <div>Välj en organisation.</div>;
                  return <SuperAdminScreen 
                      organization={selectedOrganization}
                      adminRole={userData?.adminRole || 'admin'}
                      userRole={role}
                      theme={theme}
                      onSetUserScreenPin={handleSetUserPin}
                      onUpdateLogos={(orgId, logos) => updateOrganizationLogos(orgId, logos).then(selectOrganization)}
                      onUpdateOrganization={(orgId, data) => updateOrganization(orgId, data).then(selectOrganization)}
                      onUpdateDisplayScreens={(orgId, screens) => updateOrganizationDisplayScreens(orgId, screens).then(selectOrganization)}
                      onUpdateTags={(orgId, tags) => updateOrganizationTags(orgId, tags).then(selectOrganization)}
                      onUpdatePostTemplates={(orgId, templates) => updateOrganizationPostTemplates(orgId, templates).then(selectOrganization)}
                      onEditDisplayScreen={(screen, post) => {
                        setScreenToEdit(screen);
                        setPostToEdit(post || null);
                        navigateTo(Page.DisplayScreenEditor);
                      }}
                      onShowAiGuide={() => navigateTo(Page.AiGuide)}
                  />;
              }
              return <div className="text-center p-8">Välkommen!</div>;
      }
  };

  return (
      <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900">
          {mainHeader}
          <main className="flex-grow p-4 sm:p-6 lg:p-8">
              {confirmState?.isOpen && (
                    <ConfirmDialog
                        isOpen={confirmState.isOpen}
                        title={confirmState.title}
                        onClose={() => setConfirmState(null)}
                        onConfirm={confirmState.onConfirm}
                    >
                        {confirmState.message}
                    </ConfirmDialog>
                )}
              {isReAuthModalOpen && <ReAuthModal onClose={() => setIsReAuthModalOpen(false)} onSuccess={() => { /* Re-auth success logic if needed */ }} />}
              {renderPage()}
          </main>
          {isHelpBotOpen && <HelpBot onClose={() => setIsHelpBotOpen(false)} />}
          <button
            onClick={() => setIsHelpBotOpen(prev => !prev)}
            className="fixed bottom-6 right-6 bg-primary text-white w-16 h-16 rounded-full shadow-lg hover:brightness-110 transition-all flex items-center justify-center z-40 transform hover:scale-105"
            aria-label="Öppna hjälp-chatt"
            title="Hjälp & Support"
          >
              <QuestionMarkCircleIcon className="h-9 w-9" />
          </button>
          <EnvironmentBadge />
          {isOffline && <DeveloperToolbar />}
      </div>
  );
};