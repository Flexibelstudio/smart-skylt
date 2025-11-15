import React from 'react';
import ReactDOM from 'react-dom';
import { PrimaryButton } from './Buttons';
import { SparklesIcon, PencilIcon, StarIcon, Cog6ToothIcon, ChatBubbleLeftRightIcon } from './icons';

interface AIGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GuideSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            {icon}
        </div>
        <div>
            <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100">{title}</h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{children}</p>
        </div>
    </div>
);


export const AIGuideModal: React.FC<AIGuideModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-2xl text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-2">Så här fungerar AI-assistenten</h2>
                <p className="text-slate-600 dark:text-slate-300 mb-6">
                    Smart Skylt är din personliga kreativa partner – en AI som lär sig av dina val och hjälper dig skapa engagerande innehåll på ett sätt som passar just ditt varumärke.
                </p>

                <div className="space-y-6">
                    <GuideSection icon={<StarIcon className="w-6 h-6" filled />} title="Bygg din AI-profil">
                        I fliken Varumärke kan du ladda upp referensbilder, skriva exempeltexter och beskriva din verksamhet. AI:n använder detta som inspiration för att förstå din ton, färgskala och visuella stil.
                    </GuideSection>
                    <GuideSection icon={<Cog6ToothIcon className="w-6 h-6" />} title="Planera och automatisera">
                        Under fliken Automation kan du låta AI:n skapa nya inlägg automatiskt utifrån dina scheman. Ju mer du använder den, desto bättre lär den känna din stil och dina preferenser.
                    </GuideSection>
                    <GuideSection icon={<PencilIcon className="w-6 h-6" />} title="AI:n lär sig av dina val">
                        När du redigerar eller godkänner AI-förslag lär sig systemet hur du vill kommunicera – både i text och bild. Dina val används som feedback, så framtida förslag blir mer träffsäkra och personliga.
                    </GuideSection>
                    <GuideSection icon={<ChatBubbleLeftRightIcon className="w-6 h-6" />} title="Chatta (eller prata!) med din AI-coach">
                        Klicka på chatt-ikonen för att öppna Skylie. Här kan du bolla idéer, få hjälp med textförslag eller utveckla kampanjstrategier. Du kan skriva som vanligt eller klicka på mikrofon-ikonen för att prata direkt med henne – perfekt när du har händerna fulla!
                    </GuideSection>
                    <GuideSection icon={<SparklesIcon className="w-6 h-6" />} title="Få förslag som utvecklas över tid">
                        AI-assistenten förbättras kontinuerligt baserat på din feedback. Den analyserar vad du gillar och anpassar sina rekommendationer därefter – steg för steg blir den mer som en del av ditt team.
                    </GuideSection>
                </div>

                <div className="flex justify-end mt-8 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <PrimaryButton onClick={onClose}>Stäng guiden</PrimaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};