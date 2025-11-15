import React, { useState } from 'react';
import { requestPasswordReset } from '../services/firebaseService';

interface PasswordResetModalProps {
  onClose: () => void;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({ onClose }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSuccessMessage('');

    try {
      await requestPasswordReset(email);
      setSuccessMessage('Om en användare med den e-postadressen finns har instruktioner för återställning skickats.');
    } catch (err) {
      // For security, we show a generic message even on error.
      // The specific error is logged to console for debugging.
      console.error("Password reset error:", err);
      setSuccessMessage('Om en användare med den e-postadressen finns har instruktioner för återställning skickats.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8 w-full max-w-md text-slate-900 dark:text-white shadow-2xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4 text-center">Återställ lösenord</h2>
        
        {successMessage ? (
          <div className="text-center">
            <p className="text-green-400 mb-6">{successMessage}</p>
            <button
              onClick={onClose}
              className="w-full bg-primary hover:brightness-95 text-white font-bold py-3 rounded-lg transition-colors"
            >
              Tillbaka till inloggning
            </button>
          </div>
        ) : (
          <form onSubmit={handleResetRequest}>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-center">
              Ange din e-postadress så skickar vi en länk för att återställa ditt lösenord.
            </p>
            <div>
              <label htmlFor="reset-email" className="sr-only">E-post</label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-postadress"
                required
                className="w-full bg-slate-100 dark:bg-slate-900/50 p-4 rounded-md border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none transition"
                disabled={loading}
              />
            </div>
            
            {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}

            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="w-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full bg-primary hover:brightness-95 text-white font-bold py-3 rounded-lg transition-colors disabled:bg-gray-600"
              >
                {loading ? 'Skickar...' : 'Skicka återställningslänk'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};