import React, { createContext, useState, useContext, useCallback, ReactNode, useEffect } from 'react';
import ReactDOM from 'react-dom';

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
}

interface ToastContextType {
    showToast: (options: { message: string; type: 'success' | 'error' | 'info'; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback(({ message, type, duration = 5000 }: { message: string; type: 'success' | 'error' | 'info'; duration?: number }) => {
        const id = Date.now() + Math.random(); // Add random to prevent duplicate keys on rapid calls
        setToasts(prevToasts => [...prevToasts, { id, message, type, duration }]);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    }, []);

    const value = { showToast };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// --- Toast Components ---

interface ToastContainerProps {
    toasts: Toast[];
    removeToast: (id: number) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
    const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

    useEffect(() => {
        let node = document.getElementById('toast-portal-container');
        if (!node) {
            node = document.createElement('div');
            node.setAttribute('id', 'toast-portal-container');
            document.body.appendChild(node);
        }
        setPortalNode(node);

        // No cleanup needed if we want the portal to persist for the app's lifetime
    }, []);

    if (!portalNode) return null;

    return ReactDOM.createPortal(
        <div className="fixed top-4 right-4 z-[9999] w-full max-w-sm space-y-3 pointer-events-none">
            {toasts.map(toast => (
                <ToastMessage key={toast.id} toast={toast} onDismiss={removeToast} />
            ))}
        </div>,
        portalNode
    );
};

const ToastMessage: React.FC<{ toast: Toast; onDismiss: (id: number) => void }> = ({ toast, onDismiss }) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onDismiss(toast.id), 300); // Match animation duration
        }, toast.duration);

        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onDismiss]);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(() => onDismiss(toast.id), 300);
    };

    const typeClasses = {
        success: 'bg-green-500 border-green-600',
        error: 'bg-red-500 border-red-600',
        info: 'bg-blue-500 border-blue-600',
    };
    
    const icon = {
        success: '✔️',
        error: '❌',
        info: 'ℹ️',
    }

    const animationClass = isExiting
        ? 'animate-[toast-fade-out_0.3s_ease-out_forwards]'
        : 'animate-[toast-in-right_0.4s_cubic-bezier(0.25,1,0.5,1)_forwards]';

    return (
        <div
            className={`flex items-start p-4 rounded-lg shadow-2xl text-white pointer-events-auto border-l-4 ${typeClasses[toast.type]} ${animationClass}`}
            role="alert"
        >
            <div className="flex-shrink-0 text-xl mr-3">{icon[toast.type]}</div>
            <div className="flex-grow font-semibold">{toast.message}</div>
            <button onClick={handleDismiss} className="ml-4 flex-shrink-0 text-white/70 hover:text-white">&times;</button>
        </div>
    );
};
