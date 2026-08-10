import { Organization } from '../types';

/**
 * Ersätter {{lediga_tider}} och {{lediga_tider:Namn}} i inläggstext med dagens
 * lediga tider från organization.todaysAvailableSlots.
 * Fallbacks: inaktuell data/fel → "Se lediga tider på vår bokningssida", inga luckor → "Fullbokat idag".
 */
export const resolveBookingPlaceholders = (text: string | undefined, organization?: Organization): string | undefined => {
    if (!text || !text.toLowerCase().includes('{{lediga_tider')) return text;

    const data = organization?.todaysAvailableSlots;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
    const isFresh = data?.date === today;
    const entries = data?.byCalendar ? Object.values(data.byCalendar) : [];

    return text.replace(/\{\{lediga_tider(?::([^}]+))?\}\}/gi, (_match, name?: string) => {
        if (!isFresh || entries.length === 0) return 'Se lediga tider på vår bokningssida';

        if (name) {
            const entry = entries.find(e => e.staffName?.trim().toLowerCase() === name.trim().toLowerCase());
            if (!entry || entry.error) return 'Se lediga tider på vår bokningssida';
            if (entry.closed) return 'Stängt idag';
            return (entry.slots?.length ? entry.slots.join(' · ') : 'Fullbokat idag');
        }

        const open = entries.filter(e => !e.error && !e.closed);
        if (!open.length) {
            return entries.some(e => e.closed) ? 'Stängt idag' : 'Se lediga tider på vår bokningssida';
        }
        const parts = open.map(e => `${e.staffName || 'Personal'}: ${e.slots?.length ? e.slots.join(' · ') : 'Fullbokat'}`);
        return parts.join('\n');
    });
};
