import { Organization } from '../types';

export interface SlotGroup {
    label?: string;      // t.ex. "Lymfmassage" — utelämnas när namn inte ska visas
    chips: string[];     // t.ex. ["09:00–11:00", "14:30"]
}

export interface BookingSlotsView {
    isFresh: boolean;          // data gäller dagens datum
    status?: string;           // sätts när det inte finns några tider att visa
    groups: SlotGroup[];
}

/**
 * Konverterar tidsträng "HH:MM" till minuter från midnatt.
 */
const timeToMinutes = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(val => parseInt(val, 10));
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

/**
 * Konverterar minuter från midnatt till tidsträng "HH:MM".
 */
const minutesToTime = (mins: number): string => {
    const normalized = Math.max(0, mins);
    const h = Math.floor(normalized / 60) % 24;
    const m = normalized % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Slår ihop stigande sorterade tider till intervall enligt kalenderns slotMinutes.
 * Två tider hör till samma intervall när nästa starttid är exakt föregående starttid plus slotMinutes.
 * Ett intervall med en enda tid skrivs som "09:00".
 * Ett intervall med flera skrivs som "09:00–11:00" (med tankstreck/en-dash),
 * där slutet är sista starttiden plus slotMinutes.
 */
const formatSlotsToIntervals = (
    slots: string[],
    slotMinutes: number
): string[] => {
    if (!slots || slots.length === 0) return [];

    // Sortera tiderna stigande
    const sorted = Array.from(new Set(slots)).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    if (sorted.length === 0) return [];

    const duration = slotMinutes > 0 ? slotMinutes : 30;
    const chips: string[] = [];

    let intervalStart = sorted[0];
    let prevTime = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const nextTime = sorted[i];
        const prevMins = timeToMinutes(prevTime);
        const nextMins = timeToMinutes(nextTime);

        if (prevMins + duration === nextMins) {
            // Fortsättning på samma intervall
            prevTime = nextTime;
        } else {
            // Avsluta föregående intervall
            if (intervalStart === prevTime) {
                chips.push(intervalStart);
            } else {
                const endMins = timeToMinutes(prevTime) + duration;
                chips.push(`${intervalStart}–${minutesToTime(endMins)}`);
            }
            intervalStart = nextTime;
            prevTime = nextTime;
        }
    }

    // Avsluta sista intervallet
    if (intervalStart === prevTime) {
        chips.push(intervalStart);
    } else {
        const endMins = timeToMinutes(prevTime) + duration;
        chips.push(`${intervalStart}–${minutesToTime(endMins)}`);
    }

    return chips;
};

/**
 * Slår ihop tider från flera kalendrar med eventuellt olika slotMinutes.
 */
const mergeMultiCalendarSlotsToIntervals = (
    timeEntries: { time: string; slotMinutes: number }[]
): string[] => {
    if (!timeEntries || timeEntries.length === 0) return [];

    // Samla giltiga slotMinutes per unik starttid
    const timeDurationMap = new Map<string, Set<number>>();
    for (const entry of timeEntries) {
        if (!entry.time) continue;
        const dur = entry.slotMinutes > 0 ? entry.slotMinutes : 30;
        if (!timeDurationMap.has(entry.time)) {
            timeDurationMap.set(entry.time, new Set());
        }
        timeDurationMap.get(entry.time)!.add(dur);
    }

    // Sortera unika starttider stigande
    const uniqueTimes = Array.from(timeDurationMap.keys()).sort(
        (a, b) => timeToMinutes(a) - timeToMinutes(b)
    );

    if (uniqueTimes.length === 0) return [];

    const chips: string[] = [];
    let intervalStart = uniqueTimes[0];
    let prevTime = uniqueTimes[0];
    let prevDurations = timeDurationMap.get(prevTime)!;
    let lastUsedDuration = Array.from(prevDurations)[0] || 30;

    for (let i = 1; i < uniqueTimes.length; i++) {
        const nextTime = uniqueTimes[i];
        const prevMins = timeToMinutes(prevTime);
        const nextMins = timeToMinutes(nextTime);

        // Kontrollera om nästa starttid är exakt föregående starttid plus någon av dess slotMinutes
        let matchedDuration: number | null = null;
        for (const dur of prevDurations) {
            if (prevMins + dur === nextMins) {
                matchedDuration = dur;
                break;
            }
        }

        if (matchedDuration !== null) {
            // Hör till samma intervall
            lastUsedDuration = matchedDuration;
            prevTime = nextTime;
            prevDurations = timeDurationMap.get(prevTime)!;
        } else {
            // Avsluta intervall
            if (intervalStart === prevTime) {
                chips.push(intervalStart);
            } else {
                const endMins = timeToMinutes(prevTime) + (Array.from(prevDurations)[0] || lastUsedDuration);
                chips.push(`${intervalStart}–${minutesToTime(endMins)}`);
            }
            intervalStart = nextTime;
            prevTime = nextTime;
            prevDurations = timeDurationMap.get(prevTime)!;
            lastUsedDuration = Array.from(prevDurations)[0] || 30;
        }
    }

    // Avsluta sista intervall
    if (intervalStart === prevTime) {
        chips.push(intervalStart);
    } else {
        const endMins = timeToMinutes(prevTime) + (Array.from(prevDurations)[0] || lastUsedDuration);
        chips.push(`${intervalStart}–${minutesToTime(endMins)}`);
    }

    return chips;
};

export const getBookingSlotsView = (organization?: Organization | null): BookingSlotsView => {
    const data = organization?.todaysAvailableSlots;

    // a) Färskhet. Jämför med dagens datum i Europe/Stockholm
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
    const isFresh = Boolean(data && data.date === today);

    if (!isFresh) {
        return {
            isFresh: false,
            status: 'Se lediga tider på vår bokningssida',
            groups: []
        };
    }

    // Kontrollera om data finns
    const calendarEntries = data?.byCalendar ? Object.entries(data.byCalendar) : [];
    if (calendarEntries.length === 0) {
        return {
            isFresh: true,
            status: 'Se lediga tider på vår bokningssida',
            groups: []
        };
    }

    // b) Kalendrar med error hoppas över. Är ALLA kalendrar fel:
    const nonErrorEntries = calendarEntries.filter(([_, cal]) => !cal.error);
    if (nonErrorEntries.length === 0) {
        return {
            isFresh: true,
            status: 'Se lediga tider på vår bokningssida',
            groups: []
        };
    }

    // Är alla stängda: status "Inga lediga tider kvar i dag"
    const allClosed = nonErrorEntries.every(([_, cal]) => Boolean(cal.closed));
    if (allClosed) {
        return {
            isFresh: true,
            status: 'Inga lediga tider kvar i dag',
            groups: []
        };
    }

    // Öppna kalendrar utan error
    const openEntries = nonErrorEntries.filter(([_, cal]) => !cal.closed);

    // Finns kalendrar men inga lediga tider: status "Inga lediga tider kvar i dag"
    const hasAnySlots = openEntries.some(([_, cal]) => Array.isArray(cal.slots) && cal.slots.length > 0);
    if (!hasAnySlots) {
        return {
            isFresh: true,
            status: 'Inga lediga tider kvar i dag',
            groups: []
        };
    }

    // Bygg snabbuppslag för kalenderinställningar (slotMinutes och staffName)
    const calendarConfigMap = new Map<string, { staffName: string; slotMinutes: number }>();
    if (organization?.bookingCalendars) {
        for (const cal of organization.bookingCalendars) {
            calendarConfigMap.set(cal.id, {
                staffName: cal.staffName,
                slotMinutes: cal.slotMinutes > 0 ? cal.slotMinutes : 30
            });
        }
    }

    const represent = organization?.bookingCalendarsRepresent || 'staff';
    const showCalendarNames = Boolean(organization?.showCalendarNames);

    if (represent === 'staff' && !showCalendarNames) {
        // d) Läge 'staff' (standard) utan showCalendarNames:
        // Slå ihop samtliga kalendrars tider till en gemensam lista, ta bort dubbletter,
        // sortera kronologiskt och slå ihop till intervall. Resultatet blir EN grupp utan label.
        const allTimeEntries: { time: string; slotMinutes: number }[] = [];

        for (const [calId, calData] of openEntries) {
            if (!calData.slots || calData.slots.length === 0) continue;
            const config = calendarConfigMap.get(calId);
            const slotMinutes = config?.slotMinutes || 30;

            for (const timeStr of calData.slots) {
                if (timeStr && timeStr.trim()) {
                    allTimeEntries.push({ time: timeStr.trim(), slotMinutes });
                }
            }
        }

        const chips = mergeMultiCalendarSlotsToIntervals(allTimeEntries);

        return {
            isFresh: true,
            groups: chips.length > 0 ? [{ chips }] : []
        };
    }

    // e) Läge 'staff' med showCalendarNames, samt läge 'services':
    // En grupp per kalender, i samma ordning som kalendrarna ligger i organisationen,
    // med label = kalenderns staffName. Kalendrar utan lediga tider utelämnas helt.
    const rawGroups: { label: string; chips: string[]; earliestMins: number; orderIndex: number }[] = [];

    // Håll koll på hanterade kalender-ID:n för att bevara organisationsordning
    const processedCalIds = new Set<string>();

    if (organization?.bookingCalendars) {
        organization.bookingCalendars.forEach((cal, index) => {
            processedCalIds.add(cal.id);
            const calData = data.byCalendar[cal.id];
            if (!calData || calData.error || calData.closed || !calData.slots || calData.slots.length === 0) {
                return;
            }
            const slotMinutes = cal.slotMinutes > 0 ? cal.slotMinutes : 30;
            const chips = formatSlotsToIntervals(calData.slots, slotMinutes);
            if (chips.length > 0) {
                const earliestMins = timeToMinutes(chips[0].slice(0, 5));
                rawGroups.push({
                    label: cal.staffName || calData.staffName || 'Kalender',
                    chips,
                    earliestMins,
                    orderIndex: index
                });
            }
        });
    }

    // Hantera eventuella kalendrar som fanns i byCalendar men inte i organization.bookingCalendars
    let extraIndex = rawGroups.length;
    for (const [calId, calData] of openEntries) {
        if (processedCalIds.has(calId)) continue;
        if (!calData.slots || calData.slots.length === 0) continue;

        const config = calendarConfigMap.get(calId);
        const slotMinutes = config?.slotMinutes || 30;
        const chips = formatSlotsToIntervals(calData.slots, slotMinutes);
        if (chips.length > 0) {
            const earliestMins = timeToMinutes(chips[0].slice(0, 5));
            rawGroups.push({
                label: config?.staffName || calData.staffName || 'Kalender',
                chips,
                earliestMins,
                orderIndex: extraIndex++
            });
        }
    }

    // f) Grupper och brickor ska alltid vara kronologiskt sorterade, tidigast först.
    // (Brickorna sorteras redan i formatSlotsToIntervals. Sortera grupperna efter tidigaste tid,
    // med organisationsordningen som tie-breaker för stabil ordning).
    rawGroups.sort((a, b) => {
        if (a.earliestMins !== b.earliestMins) {
            return a.earliestMins - b.earliestMins;
        }
        return a.orderIndex - b.orderIndex;
    });

    const groups: SlotGroup[] = rawGroups.map(g => ({
        label: g.label,
        chips: g.chips
    }));

    return {
        isFresh: true,
        groups
    };
};
