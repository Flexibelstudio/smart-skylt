export interface Holiday {
    date: Date;
    name: string;
    icon: string;
}

export const getSwedishHolidays = (year: number): Holiday[] => {
    const holidays: Holiday[] = [];
    // Fixed dates
    holidays.push({ date: new Date(year, 0, 1), name: 'Nyårsdagen', icon: '🎉' });
    holidays.push({ date: new Date(year, 1, 14), name: 'Alla hjärtans dag', icon: '❤️' });
    holidays.push({ date: new Date(year, 3, 30), name: 'Valborgsmässoafton', icon: '🔥' });
    holidays.push({ date: new Date(year, 4, 1), name: 'Första maj', icon: '✊' });
    holidays.push({ date: new Date(year, 5, 6), name: 'Sveriges nationaldag', icon: '🇸🇪' });
    holidays.push({ date: new Date(year, 9, 4), name: 'Kanelbullens dag', icon: '🥨' });
    holidays.push({ date: new Date(year, 9, 31), name: 'Halloween', icon: '🎃' });
    holidays.push({ date: new Date(year, 11, 24), name: 'Julafton', icon: '🎄' });
    holidays.push({ date: new Date(year, 11, 25), name: 'Juldagen', icon: '🎁' });
    
    // Dynamic dates (Computus for Easter)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = new Date(year, month, day);
    holidays.push({ date: easter, name: 'Påskdagen', icon: '🐣' });

    const lastOfMay = new Date(year, 5, 0);
    const mothersDay = new Date(year, 4, lastOfMay.getDate() - lastOfMay.getDay());
    holidays.push({ date: mothersDay, name: 'Mors dag', icon: '💐' });

    for (let i = 19; i <= 25; i++) {
        const date = new Date(year, 5, i);
        if (date.getDay() === 5) {
            holidays.push({ date, name: 'Midsommarafton', icon: '🌸' });
            break;
        }
    }
    
    let sundays = 0;
    for (let i = 1; i <= 14; i++) {
        const date = new Date(year, 10, i);
        if (date.getDay() === 0) {
            sundays++;
            if (sundays === 2) {
                holidays.push({ date, name: 'Fars dag', icon: '👨‍👧‍👦' });
                break;
            }
        }
    }

    // Black Friday (4th Friday in November)
    const firstOfNovember = new Date(year, 10, 1);
    const daysUntilFirstFriday = (5 - firstOfNovember.getDay() + 7) % 7; // 5 is Friday
    const firstFriday = 1 + daysUntilFirstFriday;
    const blackFridayDate = firstFriday + 21; // 3 weeks later for the 4th Friday
    holidays.push({ date: new Date(year, 10, blackFridayDate), name: 'Black Friday', icon: '🛍️' });
    
    return holidays;
};