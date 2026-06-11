
import React, { useState, useEffect } from 'react';
import { Organization, CampaignIdea } from '../types';
import { generateRhythmReminderText, getSeasonalSuggestion } from '../services/geminiService';
import { SparklesIcon } from './icons';
import { PrimaryButton } from './Buttons';

interface ProactiveRhythmBannerProps {
    organization: Organization;
    onGenerateIdeas: (context: string) => void;
}

export const ProactiveRhythmBanner: React.FC<ProactiveRhythmBannerProps> = ({ organization, onGenerateIdeas }) => {
    const [analysisResult, setAnalysisResult] = useState<{ reason: 'new_cycle' | 'gap' | 'ending_soon' | 'peak_month_approaching'; context: string } | null>(null);
    const [reminder, setReminder] = useState<{ headline: string, subtext: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Analyze planning profile
    useEffect(() => {
        const profile = organization.planningProfile;
        if (!profile || !profile.averageCampaignLengthDays) {
            setAnalysisResult(null);
            return;
        }

        const now = new Date();
        const posts = (organization.displayScreens || []).flatMap(s => s.posts || []);
        const latestPost = posts
            .filter(p => p.endDate)
            .sort((a, b) => new Date(b.endDate!).getTime() - new Date(a.endDate!).getTime())[0];

        let reason: 'new_cycle' | 'gap' | 'peak_month_approaching' | null = null;
        let context = '';

        // Check for gap
        if (latestPost && profile.averageGapDays) {
            const daysSinceLast = (now.getTime() - new Date(latestPost.endDate!).getTime()) / (1000 * 3600 * 24);
            if (daysSinceLast > profile.averageGapDays) {
                reason = 'gap';
                context = `Det var ${Math.round(daysSinceLast)} dagar sedan din senaste kampanj, vilket är längre än ditt vanliga uppehåll på ca ${profile.averageGapDays} dagar.`;
            }
        }
        
        // Check for common start period
        if (!reason && profile.commonStartPeriod !== 'any') {
            const dayOfMonth = now.getDate();
            const hasUpcoming = posts.some(p => p.startDate && new Date(p.startDate) > now);
            if (!hasUpcoming) {
                if (profile.commonStartPeriod === 'early-month' && dayOfMonth <= 10) {
                    reason = 'new_cycle';
                    context = 'Du brukar starta nya kampanjer i början av månaden.';
                } else if (profile.commonStartPeriod === 'mid-month' && dayOfMonth > 10 && dayOfMonth <= 20) {
                    reason = 'new_cycle';
                    context = 'Du brukar starta nya kampanjer i mitten av månaden.';
                }
            }
        }
        
        // Check for peak month
        if (!reason && profile.peakMonths) {
            const nextMonth = (now.getMonth() + 1) % 12;
            if (profile.peakMonths.includes(nextMonth)) {
                const monthName = new Date(now.getFullYear(), nextMonth, 1).toLocaleString('sv-SE', { month: 'long' });
                reason = 'peak_month_approaching';
                context = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} brukar vara en aktiv månad för dig.`;
            }
        }
        
        if (reason) {
            // Avoid showing this banner too often
            const lastShownKey = `rhythm-banner-shown-${organization.id}-${reason}`;
            const lastShown = localStorage.getItem(lastShownKey);
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            if (!lastShown || lastShown < sevenDaysAgo) {
                setAnalysisResult({ reason, context });
                localStorage.setItem(lastShownKey, now.toISOString());
            } else {
                setAnalysisResult(null);
            }
        } else {
            setAnalysisResult(null);
        }

    }, [organization]);

    // Fetch reminder text from AI
    useEffect(() => {
        if (analysisResult) {
            setIsLoading(true);
            generateRhythmReminderText(organization, analysisResult)
                .then(setReminder)
                .catch(err => {
                    console.warn("Failed to generate rhythm reminder text:", err);
                    setReminder({
                        headline: 'Dags att planera?',
                        subtext: 'Vill du ha lite ny inspiration?'
                    });
                })
                .finally(() => setIsLoading(false));
        } else {
            setReminder(null);
            setIsLoading(false);
        }
    }, [analysisResult, organization]);

    if (isLoading || !reminder) {
        return null;
    }

    return (
        <>
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white p-4 rounded-xl shadow-lg animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-center sm:text-left">
                    <div className="text-4xl">
                        <SparklesIcon className="w-10 h-10" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">{reminder.headline}</h3>
                        <p className="text-indigo-200 mt-1">{reminder.subtext}</p>
                    </div>
                </div>
                {analysisResult && (
                    <PrimaryButton onClick={() => onGenerateIdeas(analysisResult.context)} className="bg-white/90 hover:bg-white text-indigo-600 font-bold flex-shrink-0">
                        Visa idéer
                    </PrimaryButton>
                )}
            </div>
        </>
    );
};

interface ProactiveSeasonalBannerProps {
    organization: Organization;
    onGenerateIdeas: (context: string) => void;
}

export const ProactiveSeasonalBanner: React.FC<ProactiveSeasonalBannerProps> = ({ organization, onGenerateIdeas }) => {
    const [suggestion, setSuggestion] = useState<{ headline: string, subtext: string, context: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSuggestion = async () => {
            const allPosts = (organization.displayScreens || []).flatMap(s => s.posts || []);
            
            const oldestPostDate = allPosts
                .filter(p => p.startDate)
                .map(p => new Date(p.startDate!))
                .sort((a, b) => a.getTime() - b.getTime())[0];
            
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            if (allPosts.length < 5 || !oldestPostDate || oldestPostDate > oneYearAgo) {
                setIsLoading(false);
                return;
            }

            const now = new Date();
            const lastShownKey = `seasonal-banner-shown-${organization.id}-${now.getFullYear()}-${now.getMonth()}`;
            const lastShown = localStorage.getItem(lastShownKey);
            if (lastShown) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                const result = await getSeasonalSuggestion(allPosts, organization);
                if (result) {
                    setSuggestion(result);
                    localStorage.setItem(lastShownKey, now.toISOString());
                }
            } catch (err) {
                console.error("Failed to get seasonal suggestion:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSuggestion();
    }, [organization]);

    if (isLoading || !suggestion) {
        return null;
    }

    return (
        <div className="bg-gradient-to-r from-green-500 to-teal-500 text-white p-4 rounded-xl shadow-lg animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="text-4xl">
                    <SparklesIcon className="w-10 h-10" />
                </div>
                <div>
                    <h3 className="text-xl font-bold">{suggestion.headline}</h3>
                    <p className="text-teal-100 mt-1">{suggestion.subtext}</p>
                </div>
            </div>
            <PrimaryButton onClick={() => onGenerateIdeas(suggestion.context)} className="bg-white/90 hover:bg-white text-teal-600 font-bold flex-shrink-0">
                Visa idéer
            </PrimaryButton>
        </div>
    );
};
