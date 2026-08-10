import React from 'react';

interface OnboardingChecklistProps {
    hasChannel: boolean;
    hasPost: boolean;
    hasConnectedScreen: boolean;
    onCreateChannel: () => void;
    onCreatePost: () => void;
    onOpenSkylie?: () => void;
    onConnectScreen: () => void;
    onDismiss: () => void;
    onGoToBranding?: () => void;
}

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
    hasChannel, hasPost, hasConnectedScreen,
    onCreateChannel, onCreatePost, onOpenSkylie, onConnectScreen, onDismiss, onGoToBranding,
}) => {
    const steps = [
        { done: hasChannel, num: 1, title: 'Skapa din första kanal', desc: 'Kanalen är spellistan som dina inlägg rullar i. Vi skapar den med smarta standardinställningar.', cta: 'Skapa kanal', action: onCreateChannel },
        { done: hasPost, num: 2, title: 'Skapa ditt första inlägg', desc: 'Gör det själv i editorn — eller beskriv vad du vill visa så bygger AI-assistenten Skylie inlägget åt dig.', cta: 'Skapa inlägg', action: onCreatePost },
        { done: hasConnectedScreen, num: 3, title: 'Anslut ditt skyltfönster', desc: 'Öppna appen på TV:n så visas en kod — skriv in den här, så börjar din kanal rulla direkt.', cta: 'Anslut TV med kod', action: onConnectScreen },
    ];
    const doneCount = steps.filter(s => s.done).length;
    const currentIdx = steps.findIndex(s => !s.done);
    const allDone = doneCount === 3;

    if (allDone) {
        return (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-6 text-center animate-fade-in">
                <div className="text-3xl mb-2">🎉✨🎊</div>
                <h2 className="text-xl font-black text-emerald-800 dark:text-emerald-300 mb-1">Snyggt jobbat — ditt skyltfönster är igång!</h2>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-4">Ditt första inlägg rullar nu på skärmen. Nästa steg: fyll i din varumärkesprofil under fliken Varumärke så blir AI-förslagen ännu vassare.</p>
                <button type="button" onClick={onDismiss} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors">Klar — visa min översikt</button>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm animate-fade-in">
            <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
                <div>
                    <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-1">👋 Välkommen! Tre steg till ditt första skyltfönster</h2>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-xl">Så här hänger det ihop: en <strong>kanal</strong> är din spellista med inlägg, och ett <strong>skyltfönster</strong> är TV:n som visar den. Klart på ett par minuter.</p>
                </div>
                <div className="min-w-[160px]">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 text-right mb-1.5">{doneCount} av 3 klara</div>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-teal-500 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(doneCount / 3) * 100}%` }} />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {steps.map((step, idx) => {
                    const isCurrent = idx === currentIdx;
                    const isLocked = !step.done && !isCurrent;
                    return (
                        <div key={step.num} className={`rounded-xl border p-4 flex flex-col gap-2.5 transition-all ${step.done ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50' : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'} ${isLocked ? 'opacity-55' : ''}`}>
                            <div className="flex items-center gap-2.5">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-black flex-shrink-0 ${step.done ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                    {step.done ? '✓' : step.num}
                                </div>
                                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{step.title}</h3>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-grow">{step.desc}</p>
                            {step.done ? (
                                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">✓ Klart</span>
                            ) : (
                                <>
                                    <button type="button" onClick={step.action} disabled={isLocked} className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-extrabold transition-colors">{step.cta}</button>
                                    {step.num === 2 && onOpenSkylie && (
                                        <button type="button" onClick={onOpenSkylie} disabled={isLocked} className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-dashed border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-xs font-bold text-left hover:bg-indigo-100 dark:hover:bg-indigo-950/70 disabled:opacity-40 transition-colors">✨ Låt Skylie skapa det åt mig</button>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/50 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    💡 Tips: fyll i ditt <strong>varumärke</strong> först, så skapar AI:n innehåll som ser ut och låter som just din verksamhet.
                </p>
                {onGoToBranding && (
                    <button type="button" onClick={onGoToBranding} className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 whitespace-nowrap">
                        Till Varumärke →
                    </button>
                )}
            </div>
        </div>
    );
};
