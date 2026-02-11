import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface ReAuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const ReAuthModal: React.FC<ReAuthModalProps> = ({ onClose, onSuccess }) => {
  const { reauthenticate } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsAuthenticating(true);

    try {
      await reauthenticate(password);
      onSuccess();
    } catch (err) {
      console.error("Re-authentication failed", err);
      // Firebase provides specific error codes, e.g. 'auth/wrong-password'
      setError('Fel lösenord. Försök igen.');
      setPassword('');
    } finally {
        setIsAuthenticating(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="reauth-modal-title">
      <div 
        className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-sm text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <h2 id="reauth-modal-title" className="text-2xl font-bold mb-4">Bekräfta din identitet</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Ange ditt personliga lösenord för att återgå till adminvyn.
          </p>
          <div>
            <label htmlFor="reauth-password-input" className="sr-only">Lösenord</label>
            <input
              id="reauth-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-900/50 p-3 rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none transition font-semibold text-center text-lg"
              autoFocus
              disabled={isAuthenticating}
            />
          </div>
          {error && <p className="text-red-400 mt-3 text-sm text-center">{error}</p>}
          <div className="mt-6 flex gap-4">
            <button type="button" onClick={onClose} disabled={isAuthenticating} className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
              Avbryt
            </button>
            <button type="submit" disabled={isAuthenticating || !password} className="flex-1 bg-primary hover:brightness-95 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
              {isAuthenticating ? 'Bekräftar...' : 'Fortsätt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};