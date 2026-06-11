import React, { createContext, useState, useContext, useCallback, ReactNode, useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ToastAction {
    label: string;
    onClick: () => void;
}

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
    action?: ToastAction;
}

interface ToastContextType {
    showToast: (options: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((options: Omit<Toast, 'id'>) => {
        const id = Date.now() + Math.random();
        setToasts(prevToasts => [...prevToasts, { ...options, id, duration: options.duration || 5000 }]);
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
    const timerRef = React.useRef<number | null>(null);

    const handleDismiss = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setIsExiting(true);
        setTimeout(() => onDismiss(toast.id), 300); // Match animation duration
    }, [onDismiss, toast.id]);

    useEffect(() => {
        timerRef.current = window.setTimeout(handleDismiss, toast.duration);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [toast.duration, handleDismiss]);

    const handleActionClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (toast.action) {
            toast.action.onClick();
        }
        handleDismiss();
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
            <div className="flex-grow">
                <p className="font-semibold">{toast.message}</p>
                {toast.action && (
                    <button
                        onClick={handleActionClick}
                        className="mt-2 font-bold text-sm text-white underline hover:text-white/80"
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button onClick={handleDismiss} className="ml-4 flex-shrink-0 text-white/70 hover:text-white">&times;</button>
        </div>
    );
};