

import React from 'react';
import { Page, MenuItem, CustomPage, UserRole } from '../types';
// FIX: Replaced deprecated `useStudio` with `useLocation`.
import { useLocation } from '../context/StudioContext';
import { useAuth } from '../context/AuthContext';

interface CoachScreenProps {
  navigateTo: (page: Page) => void;
  onSelectCustomPage: (page: CustomPage) => void;
  isImpersonating?: boolean;
  onReturnToAdmin?: () => void;
}

export const CoachScreen: React.FC<CoachScreenProps> = ({ navigateTo, onSelectCustomPage, isImpersonating, onReturnToAdmin }) => {
  // FIX: Removed `selectedLocation` as it does not exist on the context type.
  const { selectedOrganization } = useLocation();
  // FIX: Renamed `isStudioMode` to `isScreenMode`.
  const { isScreenMode, signOut } = useAuth();

  const staticMenuItems: MenuItem[] = [];
  
  // FIX: Property 'displayConfig' does not exist on type 'Organization'. Replaced with a check on displayScreens.
  if ((selectedOrganization?.displayScreens ?? []).some(s => s.isEnabled)) {
    staticMenuItems.push({ title: 'Starta Skyltfönster', action: () => navigateTo(Page.DisplayWindow) });
  }

  const dynamicCustomPages: MenuItem[] = (selectedOrganization?.customPages || []).map(page => ({
      title: page.title,
      action: () => onSelectCustomPage(page)
  }));
  
  const adminMenuItems: MenuItem[] = [];
  
  // FIX: Renamed `isStudioMode` to `isScreenMode`.
  if (isScreenMode && !isImpersonating) { 
      adminMenuItems.push({
          title: 'Avsluta skärmläge',
          action: () => {
              if (window.confirm("Är du säker på att du vill avsluta detta läge? Detta loggar ut enheten.")) {
                  signOut();
              }
          },
      });
  }

  if (isImpersonating) {
      adminMenuItems.unshift({ 
          title: 'Återgå till Admin', 
          action: onReturnToAdmin!,
          colorClass: 'bg-gray-600 hover:bg-gray-500' 
      });
  } else if (selectedOrganization) {
      adminMenuItems.unshift({ 
          title: 'Organisationsadmin', 
          action: () => navigateTo(Page.SuperAdmin),
      });
  }

  const allMenuItems = [...staticMenuItems, ...dynamicCustomPages, ...adminMenuItems];
  
  return (
    <div className="w-full max-w-4xl mx-auto text-center">
      <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-10">Admin-hubb</h1>
       <div className="text-gray-400 mb-6 -mt-4 text-center">
            <p>Organisation: <span className="font-bold text-white">{selectedOrganization?.name || 'Ingen vald'}</span></p>
            {/* FIX: Removed display of `selectedLocation` as the data is not available in the context. */}
       </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {allMenuItems.map(item => (
          <button
            key={item.title}
            onClick={item.action}
            disabled={item.disabled}
            className={`${item.colorClass || 'bg-primary hover:brightness-95'} text-white font-bold h-32 px-6 rounded-lg transition-all duration-300 flex flex-col items-center justify-center text-xl shadow-lg disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed`}
          >
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}