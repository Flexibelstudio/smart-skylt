// FIX: Imported `useCallback` from React to resolve a 'Cannot find name' error.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InstagramStory } from '../types';
import { listenToInstagramStories } from '../services/firebaseService';

const StoryProgressBar: React.FC<{ duration: number; isActive: boolean; onFinished: () => void }> = ({ duration, isActive, onFinished }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (isActive) {
            setProgress(0); // Reset on active
            const startTime = Date.now();
            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const p = Math.min(100, (elapsed / (duration * 1000)) * 100);
                setProgress(p);
                if (p >= 100) {
                    clearInterval(interval);
                    onFinished();
                }
            }, 50); // update every 50ms for smooth animation
            return () => clearInterval(interval);
        } else {
            setProgress(0);
        }
    }, [isActive, duration, onFinished]);

    return (
        <div className="w-full bg-white/30 rounded-full h-1">
            <div
                className="bg-white h-1 rounded-full"
                style={{ width: `${isActive ? progress : 0}%`, transition: isActive && progress > 0 ? 'width 50ms linear' : 'none' }}
            ></div>
        </div>
    );
};

export const InstagramStoryPost: React.FC<{ organizationId: string }> = ({ organizationId }) => {
    const [stories, setStories] = useState<InstagramStory[]>([]);
    const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const unsubscribe = listenToInstagramStories(organizationId, (fetchedStories) => {
            setStories(fetchedStories);
            setCurrentStoryIndex(0);
        });
        return () => unsubscribe();
    }, [organizationId]);
    
    const advanceStory = useCallback(() => {
        if (stories.length === 0) return;
        setCurrentStoryIndex(prev => (prev + 1) % stories.length);
    }, [stories.length]);
    
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(e => console.error("Video autoplay failed:", e));
        }
    }, [currentStoryIndex]);


    if (stories.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white p-4 text-center">
                <div className="w-20 h-20 rounded-full border-4 border-pink-500 flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                </div>
                <h3 className="font-bold text-xl">Inga Instagram Stories</h3>
                <p className="text-slate-400 mt-1">Inga aktiva händelser hittades för det anslutna kontot.</p>
            </div>
        );
    }

    const currentStory = stories[currentStoryIndex];
    const storyDuration = currentStory.mediaType === 'VIDEO' ? (videoRef.current?.duration || 15) : 7; // 7 seconds for images

    return (
        <div className="w-full h-full bg-black relative">
            {/* Media */}
            {stories.map((story, index) => {
                const isActive = index === currentStoryIndex;
                if (story.mediaType === 'VIDEO') {
                    return (
                        <video
                            key={story.id}
                            ref={isActive ? videoRef : null}
                            src={story.mediaUrl}
                            playsInline
                            muted
                            autoPlay
                            // FIX: The onEnded handler incorrectly passed an event to advanceStory, which expects no arguments. This caused a bug in state updates. The call is now wrapped in an arrow function to prevent this.
                            onEnded={() => advanceStory()}
                            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${isActive ? 'opacity-100 z-10' : 'opacity-0'}`}
                        />
                    );
                } else { // IMAGE
                    return (
                        <img
                            key={story.id}
                            src={story.mediaUrl}
                            alt="Instagram Story"
                            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${isActive ? 'opacity-100 z-10' : 'opacity-0'}`}
                        />
                    );
                }
            })}

            {/* Overlay UI */}
            <div className="absolute inset-0 z-20 p-3 flex flex-col justify-between pointer-events-none">
                <div className="flex gap-1.5">
                    {stories.map((_, index) => (
                        <StoryProgressBar
                            key={index}
                            duration={storyDuration}
                            isActive={index === currentStoryIndex}
                            onFinished={advanceStory}
                        />
                    ))}
                </div>
                <div>{/* Potential for user info overlay */}</div>
            </div>
        </div>
    );
};