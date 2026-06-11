import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Organization, DisplayScreen, DisplayPost, CustomEvent, CampaignIdea } from '../../types';
import { getSwedishHolidays, Holiday } from '../../data/holidays';
import { useToast } from '../../context/ToastContext';
import { SparklesIcon, PencilIcon, TrashIcon } from '../icons';
import { PrimaryButton } from '../Buttons';
import { parseToDate } from '../../utils/dateUtils';

const EventEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (event: CustomEvent) => void;
    event: CustomEvent | null;
}> = ({ isOpen, onClose, onSave, event }) => {
    const [name, setName] = useState('');
    const [date, setDate] = useState('');
    const [icon, setIcon] = useState('📅');

    useEffect(() => {
        if (isOpen) {
            if (event) {
                setName(event.name);
                setDate(event.date);
                setIcon(event.icon);
            } else {
                setName('');
                setDate(new Date().toISOString().split('T')[0]);
                setIcon('📅');
            }
        }
    }, [event, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (name.trim() && date) {
            onSave({ id: event?.id || `event-${Date.now()}`, name: name.trim(), date, icon });
        }
    };
    
    let portalRoot = document.getElementById('modal-root');
    if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = 'modal-root';
        document.body.appendChild(portalRoot);
    }

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 w-full max-w-md text-slate-900 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4">{event ? 'Redigera händelse' : 'Skapa ny händelse'}</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Namn</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Datum</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white dark-date-input" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Ikon</label>
                            <input type="text" value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} className="w-full bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-center text-xl" />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onClose} className="bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-white font-semibold py-2 px-4 rounded-lg">Avbryt</button>
                    <PrimaryButton onClick={handleSave}>Spara</PrimaryButton>
                </div>
            </div>
        </div>,
        portalRoot
    );
};

interface PlanningViewProps {
    screen: DisplayScreen;
    posts: DisplayPost[];
    organization: Organization;
    onUpdateOrganization: (orgId: string, data: Partial<Organization>) => void;
    onGetCampaignIdeas: (event: Holiday | { date: Date; name: string; icon: string; }) => void;
    isAIAssistantEnabled: boolean;
    onUpdatePosts: (posts: DisplayPost[]) => void;
}

export const PlanningView: React.FC<PlanningViewProps> = ({ screen, posts, organization, onUpdateOrganization, onGetCampaignIdeas, isAIAssistantEnabled, onUpdatePosts }) => {
    const [localPosts, setLocalPosts] = useState(posts);
     useEffect(() => { setLocalPosts(posts); }, [posts]);

    const [draggedPostInfo, setDraggedPostInfo] = useState<{ post: DisplayPost; type: 'move' | 'resize-start' | 'resize-end'; initialX: number; initialStart: Date; initialEnd: Date; } | null>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<CustomEvent | null>(null);

    const timelineRange = useMemo(() => {
        const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
        const end = new Date(start); end.setMonth(end.getMonth() + 12); end.setDate(0); end.setHours(23, 59, 59, 999);
        const monthDetails: { name: string; year: string; days: number; startDayOffset: number }[] = [];
        let current = new Date(start); let dayOffset = 0;
        while (current < end) {
            const year = current.getFullYear(); const month = current.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            monthDetails.push({ name: current.toLocaleString('sv-SE', { month: 'short' }), year: `'${year.toString().slice(2)}`, days: daysInMonth, startDayOffset: dayOffset });
            dayOffset += daysInMonth; current.setMonth(month + 1);
        }
        return { start, end, totalDays: dayOffset, months: monthDetails };
    }, []);
    
    const daysIntoRange = useCallback((date: Date) => {
        if (date < timelineRange.start) return 0;
        if (date > timelineRange.end) return timelineRange.totalDays;
        return Math.floor((date.getTime() - timelineRange.start.getTime()) / (1000 * 3600 * 24));
    }, [timelineRange]);

    const todayDayIndex = daysIntoRange(new Date());

    useEffect(() => {
        if (timelineRef.current) {
            const scrollPosition = (todayDayIndex / timelineRange.totalDays) * timelineRef.current.scrollWidth - (timelineRef.current.clientWidth / 2);
            timelineRef.current.scrollTo({ left: scrollPosition, behavior: 'smooth' });
        }
    }, [todayDayIndex, timelineRange.totalDays]);
    
    const allCalendarEvents = useMemo(() => {
        const startYear = timelineRange.start.getFullYear();
        const endYear = timelineRange.end.getFullYear();
        let holidays = getSwedishHolidays(startYear);
        if(startYear !== endYear) holidays = holidays.concat(getSwedishHolidays(endYear));
        const allEvents = [ ...holidays, ...(organization.customEvents || []).map(ce => ({ date: new Date(`${ce.date}T12:00:00Z`), name: ce.name, icon: ce.icon })) ];
        return allEvents.filter(event => event.date >= timelineRange.start && event.date <= timelineRange.end);
    }, [organization.customEvents, timelineRange]);

    const scheduledPosts = useMemo(() => {
        const getDates = (p: DisplayPost) => {
            let start: Date | null = null;
            let end: Date | null = timelineRange.end;
            if (p.isExpressPost === true) {
                let ts = Date.now();
                if (p.id && p.id.startsWith('express_')) {
                    const parts = p.id.split('_');
                    if (parts[1]) {
                        const parsedTs = parseInt(parts[1], 10);
                        if (!isNaN(parsedTs)) {
                            ts = parsedTs;
                        }
                    }
                }
                start = new Date(ts);
                end = new Date();
            } else if (p.startDate) {
                start = parseToDate(p.startDate);
                end = parseToDate(p.endDate) || timelineRange.end;
            }
            return { start, end };
        };

        return localPosts.filter(p => {
            const { start, end } = getDates(p);
            if (!start || !end) return false;
            return start <= timelineRange.end && end >= timelineRange.start;
        }).sort((a, b) => {
            const startA = getDates(a).start?.getTime() || 0;
            const startB = getDates(b).start?.getTime() || 0;
            return startA - startB;
        });
    }, [localPosts, timelineRange]);
    
    const postLayout = useMemo(() => {
        const getDates = (p: DisplayPost) => {
            let start: Date | null = null;
            let end: Date | null = timelineRange.end;
            if (p.isExpressPost === true) {
                let ts = Date.now();
                if (p.id && p.id.startsWith('express_')) {
                    const parts = p.id.split('_');
                    if (parts[1]) {
                        const parsedTs = parseInt(parts[1], 10);
                        if (!isNaN(parsedTs)) {
                            ts = parsedTs;
                        }
                    }
                }
                start = new Date(ts);
                end = new Date();
            } else if (p.startDate) {
                start = parseToDate(p.startDate);
                end = parseToDate(p.endDate) || timelineRange.end;
            }
            return { start, end };
        };

        const lanes: Date[] = [];
        const layout: { post: DisplayPost; lane: number }[] = [];
        scheduledPosts.forEach(post => {
            const { start, end } = getDates(post);
            if (!start || !end) return;
            let placed = false;
            for (let i = 0; i < lanes.length; i++) {
                if (start >= lanes[i]) { lanes[i] = end; layout.push({ post, lane: i }); placed = true; break; }
            }
            if (!placed) { lanes.push(end); layout.push({ post, lane: lanes.length - 1 }); }
        });
        return { layout, laneCount: lanes.length };
    }, [scheduledPosts, timelineRange.end]);
        
    const handleSaveEvents = (updatedEvents: CustomEvent[]) => onUpdateOrganization(organization.id, { customEvents: updatedEvents });

    const handleSaveEvent = (eventToSave: CustomEvent) => {
        const currentEvents = organization.customEvents || [];
        const isNew = !currentEvents.some(e => e.id === eventToSave.id);
        const updatedEvents = isNew ? [...currentEvents, eventToSave] : currentEvents.map(e => e.id === eventToSave.id ? eventToSave : e);
        handleSaveEvents(updatedEvents);
        setIsEventModalOpen(false); setEditingEvent(null);
    };

    const handleDeleteEvent = (eventId: string) => {
        if (window.confirm("Är du säker?")) {
            const updatedEvents = (organization.customEvents || []).filter(e => e.id !== eventId);
            handleSaveEvents(updatedEvents);
        }
    };
    
    const addDays = (date: Date, days: number) => { const newDate = new Date(date); newDate.setDate(newDate.getDate() + days); return newDate; };
    
    const handleMouseDown = (e: React.MouseEvent, post: DisplayPost, type: 'move' | 'resize-start' | 'resize-end') => {
        e.preventDefault(); e.stopPropagation(); if (!post.startDate) return;
        setDraggedPostInfo({ post, type, initialX: e.clientX, initialStart: parseToDate(post.startDate)!, initialEnd: parseToDate(post.endDate) || addDays(parseToDate(post.startDate)!, 1) });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!draggedPostInfo || !timelineRef.current) return;
        const currentDayWidth = (timelineRef.current.scrollWidth / timelineRange.totalDays) || 1;
        const dx = e.clientX - draggedPostInfo.initialX; const dayDelta = Math.round(dx / currentDayWidth);
        setLocalPosts(currentPosts => currentPosts.map(p => {
            if (p.id === draggedPostInfo.post.id) {
                const duration = draggedPostInfo.initialEnd.getTime() - draggedPostInfo.initialStart.getTime();
                let newStart = draggedPostInfo.initialStart; let newEnd = draggedPostInfo.initialEnd;
                if (draggedPostInfo.type === 'move') {
                    newStart = addDays(draggedPostInfo.initialStart, dayDelta); newEnd = new Date(newStart.getTime() + duration);
                } else if (draggedPostInfo.type === 'resize-start') {
                    newStart = addDays(draggedPostInfo.initialStart, dayDelta); if (newStart.getTime() >= newEnd.getTime()) newStart = addDays(newEnd, -1);
                } else if (draggedPostInfo.type === 'resize-end') {
                    newEnd = addDays(draggedPostInfo.initialEnd, dayDelta); if (newEnd.getTime() <= newStart.getTime()) newEnd = addDays(newStart, 1);
                }
                return { ...p, startDate: newStart.toISOString(), endDate: newEnd.toISOString() };
            }
            return p;
        }));
    }, [draggedPostInfo, timelineRange.totalDays]);

    const handleMouseUp = useCallback(() => {
        if (draggedPostInfo) { onUpdatePosts(localPosts); setDraggedPostInfo(null); }
    }, [draggedPostInfo, localPosts, onUpdatePosts]);

    useEffect(() => {
        const currentCursor = document.body.style.cursor;
        if (draggedPostInfo) {
            document.body.style.cursor = draggedPostInfo.type === 'move' ? 'grabbing' : 'ew-resize';
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp, { once: true });
        }
        return () => { document.body.style.cursor = currentCursor; window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }, [draggedPostInfo, handleMouseMove, handleMouseUp]);

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm animate-fade-in">
                <div className="flex justify-between items-center mb-5">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Egna händelser</h3>
                        <p className="text-xs text-slate-500 mt-1">Skapa lokala milstolpar eller kampanjmål för din verksamhet.</p>
                    </div>
                    <PrimaryButton onClick={() => { setEditingEvent(null); setIsEventModalOpen(true); }} className="text-sm font-semibold shadow-sm">
                        Lägg till händelse
                    </PrimaryButton>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(organization.customEvents || []).map(event => (
                        <div key={event.id} className="bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl flex justify-between items-center border border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl p-1.5 bg-white dark:bg-slate-700 shadow-sm rounded-lg border border-slate-100 dark:border-slate-600">{event.icon}</span>
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-slate-100">{event.name}</p>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{new Date(`${event.date}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button 
                                    onClick={() => onGetCampaignIdeas({ name: event.name, date: new Date(`${event.date}T12:00:00Z`), icon: event.icon })} 
                                    disabled={!isAIAssistantEnabled} 
                                    title="Få smarta AI-idéer för denna händelse" 
                                    className="p-2 rounded-lg bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300 transition-colors disabled:opacity-50 border border-yellow-200/30"
                                >
                                    <SparklesIcon className="h-4 w-4" />
                                </button>
                                <button onClick={() => { setEditingEvent(event); setIsEventModalOpen(true); }} title="Redigera händelse" className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-primary transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                                    <PencilIcon className="h-4 w-4" />
                                </button>
                                <button onClick={() => handleDeleteEvent(event.id)} title="Ta bort händelse" className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-500 transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-900/40">
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                 <div className="flex justify-between items-center mb-4">
                     <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Rullande 12-månadersplanering</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400">Dra i inläggen för att ändra deras schemaläggning.</p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm" ref={timelineRef}>
                    <div className="relative min-w-[1200px] select-none bg-slate-50 dark:bg-slate-900/40 p-2">
                        {/* Month Headers */}
                        <div className="flex h-10 items-center border-b border-slate-200 dark:border-slate-700/80 mb-2">
                            {timelineRange.months.map((month) => {
                                const isCurrentMonth = todayDayIndex >= month.startDayOffset && todayDayIndex < (month.startDayOffset + month.days);
                                return (
                                    <div 
                                        key={month.name+month.year} 
                                        style={{ width: `${(month.days / timelineRange.totalDays) * 100}%` }} 
                                        className="text-center border-r border-slate-200/80 dark:border-slate-700/80 last:border-r-0 whitespace-nowrap h-full flex flex-col justify-center px-1"
                                    >
                                        <div className={`px-2 py-1 rounded-md inline-block text-xs uppercase font-extrabold tracking-wider ${
                                            isCurrentMonth 
                                                ? 'bg-red-500 text-white shadow-sm ring-2 ring-red-400/20' 
                                                : 'text-slate-600 dark:text-slate-400'
                                        }`}>
                                            {month.name} {month.year}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="relative bg-slate-50 dark:bg-slate-800/50 rounded-lg" style={{ height: `${Math.max(1, postLayout.laneCount) * 40 + 40}px` }}>
                            {timelineRange.months.slice(1).map((month) => <div key={month.name+month.year} style={{ left: `${(month.startDayOffset / timelineRange.totalDays) * 100}%` }} className="absolute top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />)}
                            <div style={{ left: `${(todayDayIndex / timelineRange.totalDays) * 100}%` }} className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"><div className="absolute -top-5 -translate-x-1/2 text-xs font-bold text-red-500">IDAG</div></div>
                            <div className="absolute top-0 left-0 right-0 h-8 flex items-center">
                                 {allCalendarEvents.map((event, i) => (
                                    <div key={event.name + i} className="absolute top-1/2 -translate-y-1/2 group z-10" style={{ left: `${(daysIntoRange(event.date) / timelineRange.totalDays) * 100}%` }}>
                                        <button onClick={() => onGetCampaignIdeas(event)} disabled={!isAIAssistantEnabled} title="Få AI-idéer" className="flex items-center gap-1 bg-white dark:bg-slate-700/80 backdrop-blur-sm p-1 rounded-full shadow-md border border-slate-200 dark:border-slate-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/50 hover:border-yellow-400 disabled:opacity-60">
                                            <span className="text-base pl-1">{event.icon}</span><SparklesIcon className={`w-5 h-5 transition-colors ${isAIAssistantEnabled ? 'text-yellow-400' : 'text-slate-400'}`} />
                                        </button>
                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded py-1 px-2 pointer-events-none opacity-0 group-hover:opacity-100 whitespace-nowrap">{event.name}</div>
                                    </div>
                                 ))}
                            </div>
                            {postLayout.layout.map(({ post, lane }) => {
                                const isExpress = post.isExpressPost === true;
                                const start = isExpress 
                                    ? (() => {
                                        let ts = Date.now();
                                        if (post.id && post.id.startsWith('express_')) {
                                            const parts = post.id.split('_');
                                            if (parts[1]) {
                                                const parsedTs = parseInt(parts[1], 10);
                                                if (!isNaN(parsedTs)) {
                                                    ts = parsedTs;
                                                }
                                            }
                                        }
                                        return new Date(ts);
                                      })()
                                    : parseToDate(post.startDate!);
                                const end = isExpress ? new Date() : (parseToDate(post.endDate) || timelineRange.end);
                                if (!start) return null;
                                const startDay = daysIntoRange(start);
                                const endDay = daysIntoRange(end);
                                const left = (startDay / timelineRange.totalDays) * 100;
                                const width = (Math.max(1, endDay - startDay) / timelineRange.totalDays) * 100;
                                const isDragged = draggedPostInfo?.post.id === post.id;
                                const daysActive = isExpress ? Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 3600 * 24))) : 0;
                                
                                return (
                                    <div 
                                        key={post.id} 
                                        className={`absolute h-8 rounded-lg text-white flex items-center justify-between px-3 text-xs font-bold whitespace-nowrap transition-all duration-100 shadow-md border hover:brightness-105 hover:shadow group ${
                                            isExpress
                                                ? 'bg-gradient-to-r from-amber-500/90 to-orange-600/95 border-amber-400/20 shadow-orange-500/10'
                                                : 'bg-gradient-to-r from-blue-500/90 to-blue-600/95 border-blue-400/20'
                                        } ${
                                            isDragged 
                                                ? 'opacity-60 scale-[1.01] ring-4 ring-blue-500/30 z-30' 
                                                : 'hover:z-30'
                                        }`}
                                        style={{ top: `${lane * 40 + 32}px`, left: `${left}%`, width: `${width}%`, cursor: isExpress ? 'default' : 'grab' }}
                                        onMouseDown={(e) => {
                                            if (isExpress) return;
                                            handleMouseDown(e, post, 'move');
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-4 overflow-hidden select-none">
                                             {!isExpress && (
                                                 <span className="flex flex-col gap-0.5 opacity-60 flex-shrink-0 cursor-grab active:cursor-grabbing">
                                                     <span className="w-1 h-0.5 bg-white rounded-full"></span>
                                                     <span className="w-1 h-0.5 bg-white rounded-full"></span>
                                                     <span className="w-1 h-0.5 bg-white rounded-full"></span>
                                                 </span>
                                             )}
                                             {isExpress && <span className="text-sm mr-0.5">⚡</span>}
                                             <span className="truncate" title={post.internalTitle}>{post.internalTitle}</span>
                                        </div>
                                        {!isExpress && (
                                            <>
                                                <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 transition-colors rounded-l-lg" onMouseDown={(e) => handleMouseDown(e, post, 'resize-start')} title="Ändra startdatum" />
                                                <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 transition-colors rounded-r-lg" onMouseDown={(e) => handleMouseDown(e, post, 'resize-end')} title="Ändra slutdatum" />
                                            </>
                                        )}
                                        
                                        {/* Dynamic Floating Date Tooltip on Hover or Drag/Resize */}
                                        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none transition-all duration-150 flex flex-col items-center ${
                                            isDragged 
                                                ? 'visible opacity-100 translate-y-0 scale-100' 
                                                : 'invisible opacity-0 translate-y-1 scale-95 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100'
                                        }`}>
                                            <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white font-semibold text-[10px] tracking-wide py-1 px-2.5 rounded-lg shadow-xl border border-slate-700/80 dark:border-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                                                {isExpress ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-orange-400">⚡ SNABBINLÄGG (TILLSVIDARE)</span>
                                                        <span className="text-slate-400">|</span>
                                                        <span>Skapat {new Date(start).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                        {daysActive >= 0 && (
                                                            <>
                                                                <span className="text-slate-400">•</span>
                                                                <span className="text-orange-300 font-bold">Aktivt i {daysActive} {daysActive === 1 ? 'dag' : 'dagar'}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-blue-300">FRÅN:</span>
                                                        <span>{new Date(start).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                        <span className="text-slate-400 font-normal">→</span>
                                                        <span className="font-extrabold text-blue-300">TILL:</span>
                                                        <span>{new Date(end).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Tooltip caret pointing down */}
                                            <div className="w-2 h-2 bg-slate-900/95 dark:bg-slate-950/95 border-r border-b border-slate-700/80 dark:border-slate-800 rotate-45 -mt-1 shadow-sm" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            <EventEditorModal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} onSave={handleSaveEvent} event={editingEvent} />
        </div>
    );
};