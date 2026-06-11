import React, { useState, useEffect, useMemo } from 'react';
import { verifyPasswordResetToken, confirmPasswordReset } from '../services/firebaseService';
import { useToast } from '../context/ToastContext';
import { EyeIcon, EyeOffIcon, LoadingSpinnerIcon } from './icons';
import { PrimaryButton } from './Buttons';
import { LoginScreen } from './LoginScreen';

interface ResetPasswordScreenProps {
  oobCode: string;
}

interface ValidationState {
  minLength: boolean;
  uppercase: boolean;
  number: boolean;
}

const ValidationRequirement: React.FC<{ text: string; isValid: boolean }> = ({ text, isValid }) => (
  <span className={`text-xs transition-colors ${isValid ? 'text-green-400' : 'text-gray-400'}`}>
    {isValid ? '✓' : '•'} {text}
  </span>
);

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ oobCode }) => {
  const { showToast } = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  
  const [email, setEmail] = useState<string | null>(null);
  const [redirectToLogin, setRedirectToLogin] = useState(false);
  
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const userEmail = await verifyPasswordResetToken(oobCode);
        setEmail(userEmail);
      } catch (err) {
        setError('Länken för återställning är ogiltig eller har gått ut. Begär en ny återställningslänk.');
        console.error(err);
      } finally {
        setIsValidatingToken(false);
      }
    };
    verifyToken();
  }, [oobCode]);

  const validation: ValidationState = useMemo(() => ({
    minLength: newPassword.length >= 8,
    uppercase: /[A-Z]/.test(newPassword),
    number: /\d/.test(newPassword),
  }), [newPassword]);

  const passwordsMatch = useMemo(() => newPassword && newPassword === confirmPassword, [newPassword, confirmPassword]);
  const isFormValid = useMemo(() => validation.minLength && validation.uppercase && validation.number && passwordsMatch, [validation, passwordsMatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);
    setError(null);
    try {
      await confirmPasswordReset(oobCode, newPassword);
      showToast({ message: 'Ditt lösenord har uppdaterats. Du kan nu logga in.', type: 'success' });
      // Redirect to login after a short delay
      setTimeout(() => {
        // Clear query params and trigger redirect
        window.history.replaceState(null, '', window.location.pathname);
        setRedirectToLogin(true);
      }, 1500);
    } catch (err) {
      setError('Ett fel inträffade. Försök igen eller begär en ny återställningslänk.');
      console.error(err);
      setLoading(false);
    }
  };

  if (redirectToLogin) {
    return <LoginScreen />;
  }
  
  if (isValidatingToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
        <LoadingSpinnerIcon className="h-8 w-8" />
        <p className="mt-4">Verifierar länk...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">Ange nytt lösenord</h2>
            {email ? (
              <p className="text-gray-400 mt-1">Återställer lösenord för <span className="font-semibold text-gray-200">{email}</span></p>
            ) : null}
          </div>
          
          {email ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="new-password-input" className="sr-only">Nytt lösenord</label>
                <div className="relative">
                  <input
                    id="new-password-input"
                    type={showPassword1 ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nytt lösenord"
                    required
                    className="w-full bg-black text-white p-4 rounded-md border border-gray-700 focus:ring-2 focus:ring-primary focus:outline-none transition pr-12"
                  />
                  <button type="button" onClick={() => setShowPassword1(!showPassword1)} className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-400 hover:text-gray-200">
                    {showPassword1 ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 px-1">
                  <ValidationRequirement text="8+ tecken" isValid={validation.minLength} />
                  <ValidationRequirement text="1 versal" isValid={validation.uppercase} />
                  <ValidationRequirement text="1 siffra" isValid={validation.number} />
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password-input" className="sr-only">Bekräfta lösenord</label>
                <div className="relative">
                   <input
                    id="confirm-password-input"
                    type={showPassword2 ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Bekräfta lösenord"
                    required
                    className={`w-full bg-black text-white p-4 rounded-md border focus:ring-2 focus:outline-none transition pr-12 ${
                      confirmPassword && !passwordsMatch ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-primary'
                    }`}
                  />
                  <button type="button" onClick={() => setShowPassword2(!showPassword2)} className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-400 hover:text-gray-200">
                    {showPassword2 ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-red-400 text-xs mt-1 px-1">Lösenorden matchar inte.</p>
                )}
              </div>

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <div>
                <PrimaryButton type="submit" disabled={!isFormValid || loading} loading={loading} className="w-full !py-4">
                  Spara nytt lösenord
                </PrimaryButton>
              </div>
            </form>
          ) : (
            <div className="text-center">
              <p className="text-red-400 mb-6">{error}</p>
              <PrimaryButton onClick={() => setRedirectToLogin(true)} className="w-full !py-4">
                Tillbaka till inloggning
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
