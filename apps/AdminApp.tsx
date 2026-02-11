
import React, { useState, useEffect, useRef, useMemo, lazy, Suspense, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Page, MenuItem, Organization, CustomPage, UserRole, UserData, DisplayScreen, Tag, PostTemplate, DisplayPost } from '../types';
import { useLocation } from '../context/StudioContext';
import { useAuth } from '../context/AuthContext';
import { 
    createOrganization, 
    updateOrganization, 
    deleteOrganization, 
    getOrganizationById, 
    isOffline,
    updateOrganizationLogos,
    updateOrganizationPostTemplates,
    updateOrganizationTags
} from '../services/firebaseService';

import { LoginScreen } from '../components/LoginScreen';
import { DeveloperToolbar } from '../components/DeveloperToolbar';
import { ReAuthModal } from '../components/ReAuthModal';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BellIcon, LoadingSpinnerIcon } from '../components/icons';
import { useNotificationManager } from '../hooks/useNotificationManager';
import { NotificationCenter } from '../components/NotificationCenter';
import { EnvironmentBadge } from '../components/EnvironmentBadge';
import { SyncStatusIndicator } from '../components/SyncStatusIndicator';
import { MarketingCoachBot } from '../components/MarketingCoachBot';
import { DraggableSkylieButton } from '../components/DraggableSkylieButton';
import { APP_VERSION } from '../version';

// --- LAZY-LOADED COMPONENTS ---
const SuperAdminScreen = lazy(() => import('../components/SuperAdminScreen').then(module => ({ default: module.SuperAdminScreen })));
const SystemOwnerScreen = lazy(() => import('../components/SystemOwnerScreen').then(module => ({ default: module.SystemOwnerScreen })));
const CustomContentScreen = lazy(() => import('../components/CustomContentScreen').then(module => ({ default: module.CustomContentScreen })));
const CustomPageEditorScreen = lazy(() => import('../components/CustomPageEditorScreen').then(module => ({ default: module.CustomPageEditorScreen })));
const DisplayWindowScreen = lazy(() => import('../components/DisplayWindowScreen').then(module => ({ default: module.DisplayWindowScreen })));
const DisplayScreenEditorScreen = lazy(() => import('../components/DisplayScreenEditorScreen').then(module => ({ default: module.DisplayScreenEditorScreen })));

const THEME_STORAGE_KEY = 'smart-skylt-theme';

const MainContent: React.FC = () => {
  const queryClient = useQueryClient();
  const { 
    selectOrganization, allOrganizations, setAllOrganizations,
    clearSelection, selectedDisplayScreen, syncStatus,
    updateSelectedOrganization, displayScreens, updateDisplayScreen,
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
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationManager(selectedOrganization, page);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isMarketingCoachOpen, setIsMarketingCoachOpen] = useState(false);
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
        
        // Uppdatera React Query-cachen direkt
        queryClient.setQueryData<Organization[]>(['allOrganizations'], (oldData) => {
            return oldData ? [...oldData, newOrg] : [newOrg];
        });

        showToast({ message: `Organisationen "${orgData.name}" skapades.`, type: 'success' });
    } catch (error) {
        console.error("Failed to create organization:", error);
        if ((window as any).DEBUG_MODE) {
            console.error("Full create organization error object:", error);
        }
        showToast({ message: `Kunde inte skapa organisation: ${error instanceof Error ? error.message : "Ett okänt fel inträffade."}`, type: 'error' });
    }
  };

  const handleDeleteOrganization = async (organizationId: string) => {
    try {
        await deleteOrganization(organizationId);
        
        // Uppdatera React Query-cachen direkt genom att ta bort den raderade organisationen
        queryClient.setQueryData<Organization[]>(['allOrganizations'], (oldData) => {
            return oldData ? oldData.filter(o => o.id !== organizationId) : [];
        });

        showToast({ message: `Organisationen togs bort.`, type: 'success' });
    } catch (error) {
         console.error("Failed to delete organization:", error);
         if ((window as any).DEBUG_MODE) {
            console.error("Full delete organization error object:", error);
         }
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

    const handleUpdateOrganizationForSystemOwner = useCallback(async (orgId: string, data: Partial<Organization>) => {
        try {
            await updateOrganization(orgId, data);
            // The listener will update the state automatically.
        } catch (e) {
            console.error("Failed to update organization from SystemOwnerScreen", e);
            if ((window as any).DEBUG_MODE) {
                console.error("Full update organization error object:", e);
            }
            showToast({ message: "Kunde inte uppdatera organisationen.", type: 'error' });
            throw e; // rethrow so component can handle loading state.
        }
    }, [showToast]);

    const optimisticUpdateOrganization = useCallback(
        async (orgId: string, data: Partial<Organization>) => {
            // If we are updating the currently selected organization, use the context method
            // because it handles the write to Firebase. The listener will then update the local state.
            if (orgId === selectedOrganization?.id) {
                return updateSelectedOrganization(data);
            }
            // Otherwise, write directly to Firebase.
            return updateOrganization(orgId, data);
        }, [selectedOrganization?.id, updateSelectedOrganization]
    );

    const optimisticUpdateLogos = useCallback(
        async (orgId: string, data: { light: string; dark: string }) => {
            if (orgId !== selectedOrganization?.id) return updateOrganizationLogos(orgId, data);
            updateSelectedOrganization({ logoUrlLight: data.light, logoUrlDark: data.dark });
            try { await updateOrganizationLogos(orgId, data); } 
            catch (e) {
                console.error("Optimistic logo update failed, rolling back.", e);
                showToast({ message: 'Sparning misslyckades, återställer...', type: 'error' });
                getOrganizationById(orgId).then(freshOrg => freshOrg && updateSelectedOrganization(freshOrg));
                throw e;
            }
        }, [selectedOrganization?.id, updateSelectedOrganization, showToast]
    );

    const optimisticUpdateTags = useCallback(
        async (orgId: string, data: Tag[]) => {
            if (orgId !== selectedOrganization?.id) return updateOrganizationTags(orgId, data);
            updateSelectedOrganization({ tags: data });
            try { await updateOrganizationTags(orgId, data); }
            catch (e) {
                console.error("Optimistic tags update failed, rolling back.", e);
                showToast({ message: 'Sparning misslyckades, återställer...', type: 'error' });
                getOrganizationById(orgId).then(freshOrg => freshOrg && updateSelectedOrganization(freshOrg));
                throw e;
            }
        }, [selectedOrganization?.id, updateSelectedOrganization, showToast]
    );
    
    const optimisticUpdatePostTemplates = useCallback(
        async (orgId: string, data: PostTemplate[]) => {
            if (orgId !== selectedOrganization?.id) return updateOrganizationPostTemplates(orgId, data);
            updateSelectedOrganization({ postTemplates: data });
            try { await updateOrganizationPostTemplates(orgId, data); }
            catch (e) {
                console.error("Optimistic post templates update failed, rolling back.", e);
                showToast({ message: 'Sparning misslyckades, återställer...', type: 'error' });
                getOrganizationById(orgId).then(freshOrg => freshOrg && updateSelectedOrganization(freshOrg));
                throw e;
            }
        }, [selectedOrganization?.id, updateSelectedOrganization, showToast]
    );

    const handleUpdateDisplayScreens = useCallback(async (orgId: string, screens: DisplayScreen[]) => {
        if (!selectedOrganization || orgId !== selectedOrganization.id) {
            console.warn("Mismatched orgId or no selected organization in handleUpdateDisplayScreens");
            return;
        }

        for (const screen of screens) {
            const originalScreen = displayScreens.find(s => s.id === screen.id);
            if (originalScreen && JSON.stringify(originalScreen) !== JSON.stringify(screen)) {
                try {
                    await updateDisplayScreen(screen.id, { posts: screen.posts });
                } catch (e) {
                    console.error(`Failed to update screen ${screen.id}`, e);
                }
            }
        }
    }, [selectedOrganization, displayScreens, updateDisplayScreen]);

    const handleEditDisplayScreenFromBot = (screen: DisplayScreen, post: DisplayPost) => {
        setScreenToEdit(screen);
        setPostToEdit(post);
        navigateTo(Page.DisplayScreenEditor);
        setIsMarketingCoachOpen(false);
    };


  const mainHeader = useMemo(() => {
      const headerTitle = page === Page.SystemOwner ? "SmartSkylt" : (selectedOrganization?.brandName || selectedOrganization?.name || "Smart Skyltning");

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
              // Pass displayScreens from context instead of organization object
              return <SuperAdminScreen
                  organization={{...selectedOrganization, displayScreens}}
                  adminRole={userData.adminRole || 'admin'}
                  userRole={role}
                  theme={theme}
                  onUpdateOrganization={optimisticUpdateOrganization}
                  onUpdateLogos={optimisticUpdateLogos}
                  onUpdateTags={optimisticUpdateTags}
                  onUpdatePostTemplates={optimisticUpdatePostTemplates}
                  onEditDisplayScreen={(screen, post) => {
                    setScreenToEdit(screen);
                    setPostToEdit(post || null);
                    navigateTo(Page.DisplayScreenEditor);
                  }}
                  onUpdateDisplayScreens={handleUpdateDisplayScreens}
              />;
          
          case Page.CustomContent:
              if (!activeCustomPage) return <div>Inget innehåll valt.</div>;
              return <CustomContentScreen page={activeCustomPage} />;

          case Page.CustomPageEditor:
              return <CustomPageEditorScreen
                  pageToEdit={customPageToEdit}
                  onSave={async (p) => {
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
              // Pass the screen object from state which is kept up-to-date by the context
              const currentScreenData = displayScreens.find(s => s.id === screenToEdit.id);
              if (!currentScreenData) return <div>Kanalen kunde inte hittas. Gå tillbaka och försök igen.</div>
              return <DisplayScreenEditorScreen 
                screen={currentScreenData} 
                initialPostToEdit={postToEdit}
                onUpdateOrganization={optimisticUpdateOrganization}
                userRole={role}
              />
              
          default:
              if (role === 'systemowner') return <SystemOwnerScreen allOrganizations={allOrganizations} onSelectOrganization={(org) => selectOrganization(org)} onCreateOrganization={handleCreateOrganization} onDeleteOrganization={handleDeleteOrganization} onUpdateOrganization={handleUpdateOrganizationForSystemOwner}/>;
              if (role === 'organizationadmin') {
                  if (!selectedOrganization || !userData) return <div>Välj en organisation.</div>;
                  return <SuperAdminScreen 
                      organization={{...selectedOrganization, displayScreens}}
                      adminRole={userData?.adminRole || 'admin'}
                      userRole={role}
                      theme={theme}
                      onUpdateOrganization={optimisticUpdateOrganization}
                      onUpdateLogos={optimisticUpdateLogos}
                      onUpdateTags={optimisticUpdateTags}
                      onUpdatePostTemplates={optimisticUpdatePostTemplates}
                      onEditDisplayScreen={(screen, post) => {
                        setScreenToEdit(screen);
                        setPostToEdit(post || null);
                        navigateTo(Page.DisplayScreenEditor);
                      }}
                      onUpdateDisplayScreens={handleUpdateDisplayScreens}
                  />;
              }
              return <div className="text-center p-8">Välkommen!</div>;
      }
  };

  return (
      <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900">
          {mainHeader}
          <main className="flex-grow p-4 sm:p-6 lg:p-8">
              <Suspense fallback={
                <div className="w-full h-64 flex items-center justify-center">
                    <LoadingSpinnerIcon className="h-10 w-10 text-primary" />
                </div>
              }>
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
              </Suspense>
          </main>
          {isMarketingCoachOpen && selectedOrganization && (
            <MarketingCoachBot 
                onClose={() => setIsMarketingCoachOpen(false)} 
                organization={{...selectedOrganization, displayScreens}}
                onEditDisplayScreenFromBot={handleEditDisplayScreenFromBot}
            />
          )}
          {/* Only show the help button if an organization is selected to avoid confusion */}
          {selectedOrganization && (
              <DraggableSkylieButton isOpen={isMarketingCoachOpen} onClick={() => setIsMarketingCoachOpen(prev => !prev)} />
          )}
          <SyncStatusIndicator status={syncStatus} />
          <footer className="p-4 text-center text-[10px] text-slate-400 dark:text-slate-600">
              Smart Skylt Admin &bull; Version {APP_VERSION}
          </footer>
          <EnvironmentBadge />
          {isOffline && <DeveloperToolbar />}
      </div>
  );
};

const AdminApp: React.FC = () => {
  const { authLoading, currentUser, userData } = useAuth();
  const { locationLoading, selectedOrganization, selectOrganization, allOrganizations } = useLocation();
  
  useEffect(() => {
    // Wait for all initial data to load before making a selection.
    if (authLoading || locationLoading || allOrganizations.length === 0) {
      return;
    }

    // Priority 1: If user is an org admin, ensure their org is selected.
    if (userData?.role === 'organizationadmin' && userData.organizationId) {
      if (selectedOrganization?.id !== userData.organizationId) {
        const orgToSelect = allOrganizations.find(o => o.id === userData.organizationId);
        if (orgToSelect) {
            selectOrganization(orgToSelect);
        }
        return;
      }
    }
    
    // Priority 2: For any other user (e.g., systemowner), if no org is selected yet, select the first one.
    else if (!selectedOrganization) {
      selectOrganization(allOrganizations[0]);
    }
  }, [authLoading, locationLoading, allOrganizations, userData, selectedOrganization, selectOrganization]);

  if (authLoading || locationLoading) {
    return <div className="bg-slate-900 text-white min-h-screen flex items-center justify-center">Laddar...</div>;
  }
  
  if (!currentUser) {
    return <LoginScreen />;
  }
  
  return <MainContent />;
}

export default AdminApp;
