import { DisplayPost, PlanningProfile } from '../types';
import { parseToDate } from './dateUtils';

export function calculatePlanningProfile(posts: DisplayPost[]): PlanningProfile {
    const scheduledPosts = posts
        .map(p => ({
            ...p,
            startDate: p.startDate ? parseToDate(p.startDate) : null,
            endDate: p.endDate ? parseToDate(p.endDate) : null,
        }))
        .filter((p): p is typeof p & { startDate: Date; endDate: Date } => !!p.startDate && !!p.endDate)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    if (scheduledPosts.length < 3) {
        // Not enough data to create a meaningful profile
        return { lastUpdatedAt: new Date().toISOString() };
    }

    // --- Campaign Lengths ---
    const lengths = scheduledPosts.map(p => (p.endDate.getTime() - p.startDate.getTime()) / (1000 * 3600 * 24));
    const averageCampaignLengthDays = Math.round(lengths.reduce((sum, len) => sum + len, 0) / lengths.length);

    // --- Gaps Between Campaigns ---
    const gaps = [];
    for (let i = 0; i < scheduledPosts.length - 1; i++) {
        const gap = (scheduledPosts[i + 1].startDate.getTime() - scheduledPosts[i].endDate.getTime()) / (1000 * 3600 * 24);
        if (gap > 0) {
            gaps.push(gap);
        }
    }
    const averageGapDays = gaps.length > 0 ? Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length) : undefined;

    // --- Common Start Period ---
    const startDays = scheduledPosts.map(p => p.startDate.getDate());
    const early = startDays.filter(d => d <= 10).length;
    const mid = startDays.filter(d => d > 10 && d <= 20).length;
    const late = startDays.filter(d => d > 20).length;
    let commonStartPeriod: PlanningProfile['commonStartPeriod'] = 'any';
    if (early > mid && early > late) commonStartPeriod = 'early-month';
    else if (mid > early && mid > late) commonStartPeriod = 'mid-month';
    else if (late > early && late > mid) commonStartPeriod = 'late-month';

    // --- Peak and Low Months ---
    const monthCounts: { [key: number]: number } = {};
    for (let i = 0; i < 12; i++) monthCounts[i] = 0;
    scheduledPosts.forEach(p => {
        monthCounts[p.startDate.getMonth()]++;
    });
    
    const sortedMonths = Object.entries(monthCounts).sort(([, countA], [, countB]) => countB - countA);
    const peakMonths = sortedMonths.slice(0, 3).filter(([, count]) => count > 0).map(([month]) => parseInt(month));
    const lowActivityMonths = sortedMonths.slice(-3).filter(([, count]) => count === 0).map(([month]) => parseInt(month));

    return {
        averageCampaignLengthDays,
        averageGapDays,
        commonStartPeriod,
        peakMonths: peakMonths.length > 0 ? peakMonths : undefined,
        lowActivityMonths: lowActivityMonths.length > 0 ? lowActivityMonths : undefined,
        lastUpdatedAt: new Date().toISOString(),
    };
}