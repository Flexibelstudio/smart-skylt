
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { CubeIcon, XCircleIcon, ArrowsPointingOutIcon, MoveIcon } from './icons';

interface RealityCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    aspectRatio: string;
}

// Base configurations for environments
const environments = [
    {
        id: 'shop',
        name: 'Butik (Ljust)',
        bgImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1600&auto=format&fit=crop',
        baseTop: 25,
        baseLeft: 40,
        perspective: 1200,
        rotateY: 0,
        rotateX: 0,
        scaleModifier: 0.9,
        brightness: 1.05
    },
    {
        id: 'cafe',
        name: 'Café (Mysigt)',
        bgImage: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=1600&auto=format&fit=crop',
        baseTop: 30, 
        baseLeft: 35,
        perspective: 1000,
        rotateY: -5,
        rotateX: 2,
        scaleModifier: 1.0, 
        brightness: 0.9
    },
    {
        id: 'office',
        name: 'Kontor (Modernt)',
        bgImage: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=1600&auto=format&fit=crop',
        baseTop: 35,
        baseLeft: 25,
        perspective: 1500,
        rotateY: 15,
        rotateX: 0,
        scaleModifier: 0.8,
        brightness: 0.95
    },
    {
        id: 'street',
        name: 'Gata (Kväll)',
        bgImage: 'https://images.unsplash.com/photo-1517672651691-24622a91b550?q=80&w=1600&auto=format&fit=crop',
        baseTop: 20,
        baseLeft: 50,
        perspective: 800,
        rotateY: -10,
        rotateX: 0,
        scaleModifier: 1.1,
        brightness: 1.2
    }
];

export const RealityCheckModal: React.FC<RealityCheckModalProps> = ({ isOpen, onClose, children, aspectRatio }) => {
    const [selectedEnvId, setSelectedEnvId] = useState('shop');
    const [screenSize, setScreenSize] = useState(55); // Inches
    const [viewingDistance, setViewingDistance] = useState(2); // Meters
    const [scale, setScale] = useState(1);
    
    // We use a ref to measure the actual pixel size of the container in the DOM
    const containerRef = useRef<HTMLDivElement>(null);

    const activeEnv = environments.find(e => e.id === selectedEnvId) || environments[0];
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';

    // 1. Define the "Virtual Resolution" - This is what the content *thinks* it has.
    // Setting this to Full HD (1920x1080) ensures text wraps exactly like a real TV.
    const VIRTUAL_WIDTH = isPortrait ? 1080 : 1920;
    const VIRTUAL_HEIGHT = isPortrait ? 1920 : 1080;

    // 2. Calculate the "Visual Size" on screen based on distance/size sliders.
    // This determines how big the 3D box appears to the user.
    const sizeFactor = screenSize / 55; // Normalize to 55"
    const distanceFactor = 2 / Math.max(0.5, viewingDistance); // Normalize to 2m
    const computedScaleModifier = activeEnv.scaleModifier * sizeFactor * distanceFactor;
    
    // Base width percentage for the container in the specific environment image
    const baseContainerWidthPercent = isPortrait ? 12 : 22; 
    const containerWidthPercent = baseContainerWidthPercent * computedScaleModifier;

    // 3. ResizeObserver: Calculate the scale transform needed to fit the 
    //    1920px content into the current pixel width of the container.
    useEffect(() => {
        if (!isOpen || !containerRef.current) return;

        const updateScale = () => {
            if (containerRef.current) {
                const actualWidth = containerRef.current.offsetWidth;
                // Calculate ratio: available pixels / 1920
                const newScale = actualWidth / VIRTUAL_WIDTH;
                setScale(newScale);
            }
        };

        const observer = new ResizeObserver(updateScale);
        observer.observe(containerRef.current);
        
        // Initial call
        updateScale();

        return () => observer.disconnect();
    }, [isOpen, containerWidthPercent, VIRTUAL_WIDTH]);

    if (!isOpen) return null;

    const portalRoot = document.getElementById('modal-root') || document.body;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center p-4 bg-slate-900 border-b border-slate-700 text-white z-20 gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 rounded-lg">
                        <CubeIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Reality Check</h2>
                        <p className="text-xs text-slate-400 hidden sm:block">Simulera läsbarhet i verklig miljö</p>
                    </div>
                </div>

                <div className="flex bg-slate-800 rounded-lg p-1 overflow-x-auto max-w-[90vw] scrollbar-hide">
                    {environments.map(env => (
                        <button
                            key={env.id}
                            onClick={() => setSelectedEnvId(env.id)}
                            className={`px-3 py-1.5 text-sm whitespace-nowrap rounded-md transition-colors ${selectedEnvId === env.id ? 'bg-primary text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        >
                            {env.name}
                        </button>
                    ))}
                </div>

                <button onClick={onClose} className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-colors">
                    <XCircleIcon className="w-8 h-8" />
                </button>
            </div>

            {/* Main Stage */}
            <div className="flex-grow relative overflow-hidden bg-black flex items-center justify-center cursor-move">
                {/* Background Image */}
                <div 
                    className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out"
                    style={{ backgroundImage: `url(${activeEnv.bgImage})`, filter: 'brightness(0.7)' }}
                />
                
                {/* 3D Container Wrapper (The "TV") */}
                <div 
                    ref={containerRef}
                    className="absolute transition-all duration-500 ease-out will-change-transform bg-black"
                    style={{
                        top: `${activeEnv.baseTop}%`,
                        left: `${activeEnv.baseLeft}%`,
                        width: `${containerWidthPercent}%`,
                        // Force aspect ratio on the container itself
                        aspectRatio: `${VIRTUAL_WIDTH}/${VIRTUAL_HEIGHT}`,
                        transform: `
                            perspective(${activeEnv.perspective}px) 
                            rotateY(${activeEnv.rotateY}deg) 
                            rotateX(${activeEnv.rotateX}deg) 
                            translateX(-50%)
                        `,
                        transformOrigin: 'center center',
                        boxShadow: activeEnv.id === 'street' 
                            ? '0 0 50px rgba(255,255,255,0.1), 0 0 20px rgba(0,0,0,0.8)' 
                            : '2px 10px 40px rgba(0,0,0,0.5)',
                        border: '2px solid #1a1a1a', // TV Bezel
                        borderRadius: '2px',
                        overflow: 'hidden'
                    }}
                >
                    {/* 
                        CONTENT SCALER 
                        This div is forced to be exactly 1920x1080 (or portrait equivalent).
                        We then scale it down to fit the parent container using the calculated `scale`.
                    */}
                    <div 
                        style={{
                            width: `${VIRTUAL_WIDTH}px`,
                            height: `${VIRTUAL_HEIGHT}px`,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                            filter: `brightness(${activeEnv.brightness}) contrast(1.1)`,
                            backgroundColor: 'black', // Ensure no transparency bleed
                        }}
                    >
                        {children}
                    </div>

                    {/* Glare/Reflection Overlay (On top of content) */}
                    <div 
                        className="absolute inset-0 pointer-events-none z-50"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.05) 100%)',
                            mixBlendMode: 'overlay'
                        }}
                    />
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="bg-slate-900 border-t border-slate-700 p-6 z-20">
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Screen Size Control */}
                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <ArrowsPointingOutIcon className="w-4 h-4" />
                                Skärmstorlek
                            </label>
                            <span className="text-indigo-400 font-bold">{screenSize}"</span>
                        </div>
                        <input 
                            type="range" 
                            min="32" 
                            max="85" 
                            step="1" 
                            value={screenSize} 
                            onChange={(e) => setScreenSize(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
                            <span>32"</span>
                            <span>55"</span>
                            <span>85"</span>
                        </div>
                    </div>

                    {/* Viewing Distance Control */}
                    <div>
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <MoveIcon className="w-4 h-4" />
                                Betraktelseavstånd
                            </label>
                            <span className="text-teal-400 font-bold">{viewingDistance} meter</span>
                        </div>
                        <input 
                            type="range" 
                            min="0.5" 
                            max="10" 
                            step="0.5" 
                            value={viewingDistance} 
                            onChange={(e) => setViewingDistance(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
                            <span>0.5m</span>
                            <span>5m</span>
                            <span>10m</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        portalRoot
    );
};
