import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeOffIcon } from './icons';
import { PasswordResetModal } from './PasswordResetModal';

export const LoginScreen: React.FC = () => {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);


    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await signIn(email, password);
        } catch (err) {
            setError('Inloggningen misslyckades. Kontrollera e-post och lösenord.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
            <div className="w-full max-w-md">
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold">Logga in som administratör</h2>
                        <p className="text-gray-400 mt-1">För systemägare och organisationsadmin</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="sr-only">E-post</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="E-postadress"
                                required
                                className="w-full bg-black text-white p-4 rounded-md border border-gray-700 focus:ring-2 focus:ring-primary focus:outline-none transition"
                            />
                        </div>
                        <div className="relative">
                            <label htmlFor="password-input" className="sr-only">Lösenord</label>
                            <input
                                id="password-input"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Lösenord"
                                required
                                className="w-full bg-black text-white p-4 rounded-md border border-gray-700 focus:ring-2 focus:ring-primary focus:outline-none transition pr-12"
                            />
                             <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-400 hover:text-gray-200"
                                title="Visa/Dölj lösenord"
                            >
                                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                        
                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary hover:brightness-95 text-white font-bold py-4 rounded-lg transition-colors disabled:bg-gray-600"
                            >
                                {loading ? 'Loggar in...' : 'Logga in'}
                            </button>
                        </div>
                    </form>
                     <div className="text-center mt-6">
                        <button
                            onClick={() => setIsResetModalOpen(true)}
                            className="text-sm text-gray-400 hover:underline"
                        >
                            Glömt lösenord?
                        </button>
                    </div>
                </div>
            </div>
             {isResetModalOpen && <PasswordResetModal onClose={() => setIsResetModalOpen(false)} />}
        </div>
    );
};