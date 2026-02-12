
import React, { useState, useEffect, useRef } from 'react';
import { DisplayScreen } from '../types';

interface ResolutionScalerProps {
    aspectRatio: DisplayScreen['aspectRatio'];
    children: React.ReactNode;
    className?: string;
}

export const ResolutionScaler: React.FC<ResolutionScalerProps> = ({ aspectRatio, children, className = '' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    // Definiera basupplösningen (TV-standard)
    // Detta är den "sanna" upplösningen som CSS kommer tro att den har.
    const baseWidth = aspectRatio === '9:16' || aspectRatio === '3:4' ? 1080 : 1920;
    const baseHeight = aspectRatio === '9:16' ? 1920 : aspectRatio === '3:4' ? 1440 : aspectRatio === '4:3' ? 1440 : 1080;

    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const parent = containerRef.current.parentElement;
                if (parent) {
                    const availableWidth = parent.clientWidth;
                    const availableHeight = parent.clientHeight;
                    
                    // Beräkna skalfaktorn för att passa in "TV:n" i behållaren (contain)
                    const scaleX = availableWidth / baseWidth;
                    const scaleY = availableHeight / baseHeight;
                    const newScale = Math.min(scaleX, scaleY);
                    
                    setScale(newScale);
                }
            }
        };

        // Kör vid mount och resize
        updateScale();
        const observer = new ResizeObserver(updateScale);
        if (containerRef.current?.parentElement) {
            observer.observe(containerRef.current.parentElement);
        }

        return () => observer.disconnect();
    }, [baseWidth, baseHeight]);

    return (
        <div 
            className={`flex items-center justify-center overflow-hidden w-full h-full ${className}`}
            ref={containerRef}
        >
            <div
                style={{
                    width: baseWidth,
                    height: baseHeight,
                    transform: `scale(${scale})`,
                    transformOrigin: 'center center',
                    // Flex-shrink 0 förhindrar att den trycks ihop av flex-parents
                    flexShrink: 0, 
                }}
                className="bg-black relative shadow-2xl"
            >
                {children}
            </div>
        </div>
    );
};
