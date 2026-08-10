import React from 'react';
import { Organization } from '../types';

export const DnaStatusBadge: React.FC<{
    organization: Organization;
    onGoToBranding?: () => void;
    className?: string;
}> = ({ organization, onGoToBranding, className }) => {
    const hasDna = !!organization.styleProfile?.summary;

    if (hasDna) {
        return (
            <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-800/50 px-2.5 py-1 rounded-full select-none ${className || ''}`}
                title={`AI:n använder din DNA-profil: ${(organization.styleProfile?.summary || '').slice(0, 160)}`}
            >
                ✨ Skapas med ditt varumärkes-DNA
            </span>
        );
    }

    const content = <>💡 Bygg din DNA-profil för mer träffsäkra förslag{onGoToBranding ? ' →' : ''}</>;
    const classes = `inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 px-2.5 py-1 rounded-full ${className || ''}`;

    return onGoToBranding ? (
        <button type="button" onClick={onGoToBranding} className={`${classes} hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors`} title="Öppna Varumärke-fliken och bygg din DNA-profil">
            {content}
        </button>
    ) : (
        <span className={`${classes} select-none`} title="Gå till fliken Varumärke för att bygga din DNA-profil">{content}</span>
    );
};
