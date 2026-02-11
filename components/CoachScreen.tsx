
import React, { useState } from 'react';
import { Page, MenuItem, CustomPage, UserRole } from '../types';
import { useLocation } from '../context/StudioContext';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from './ConfirmDialog';

interface CoachScreenProps {
  navigateTo: (page: Page) => void;
  onSelectCustomPage: (page: CustomPage) => void;
  isImpersonating?: boolean;
  onReturnToAdmin?: () => void;
}

export const CoachScreen: React.FC<CoachScreenProps> = ({ navigateTo, onSelectCustomPage, isImpersonating, onReturnToAdmin }) => {
  const { selectedOrganization } = useLocation();
  const { isScreenMode, signOut } = useAuth();
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);

  const staticMenuItems: MenuItem[] = [];
  
  if ((selectedOrganization?.displayScreens ?? []).some(s => s.isEnabled)) {
    staticMenuItems.push({ title: 'Starta Skyltfönster', action: () => navigateTo(Page.DisplayWindow) });
  }

  const dynamicCustomPages: MenuItem[] = (selectedOrganization?.customPages || []).map(page => ({
      title: page.title,
      action: () => onSelectCustomPage(page)
  }));
  
  const adminMenuItems: MenuItem[] = [];
  
  if (isScreenMode && !isImpersonating) { 
      adminMenuItems.push({
          title: 'Avsluta skärmläge',
          action: () => setIsExitConfirmOpen(true),
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

      <ConfirmDialog
        isOpen={isExitConfirmOpen}
        onClose={() => setIsExitConfirmOpen(false)}
        onConfirm={signOut}
        title="Avsluta skärmläge?"
        confirmText="Logga ut enhet"
        variant="destructive"
      >
        Är du säker på att du vill avsluta skärmläget? Detta kommer att logga ut den här enheten från systemet.
      </ConfirmDialog>
    </div>
  );
}
