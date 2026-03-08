import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Minus, MapPin, Search, Footprints, Car, Train, Calendar, Trash2, Star } from 'lucide-react';
import { searchLocations } from '../services/nominatim';
import { dedupeLocations, locationSearchText, normalizeLocation } from '../utils/locationModel';
import { buildLocalSearchIndex, matchesLondonHint, searchLocalIndex } from '../utils/localSearch';

const WindowWrapper = ({ title, icon: Icon, children, onClose, onMinimize, style, draggable = false }) => {
    const initialTop = Number.isFinite(Number(style?.top)) ? Number(style.top) : 100;
    const initialLeft = Number.isFinite(Number(style?.left)) ? Number(style.left) : 20;

    const [position, setPosition] = useState({ top: initialTop, left: initialLeft });
    const [dragging, setDragging] = useState(false);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (dragging) {
            document.body.classList.add('dragging-window');
        } else {
            document.body.classList.remove('dragging-window');
        }

        return () => {
            document.body.classList.remove('dragging-window');
        };
    }, [dragging]);

    useEffect(() => {
        if (!dragging) return undefined;

        const handleMouseMove = (event) => {
            const nextLeft = Math.max(8, event.clientX - dragOffsetRef.current.x);
            const nextTop = Math.max(8, event.clientY - dragOffsetRef.current.y);
            setPosition({ left: nextLeft, top: nextTop });
        };

        const handleMouseUp = () => {
            setDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging]);

    const handleDragStart = (event) => {
        if (!draggable) return;
        if (event.target.closest('button')) return;

        event.preventDefault();

        dragOffsetRef.current = {
            x: event.clientX - position.left,
            y: event.clientY - position.top,
        };
        setDragging(true);
    };

    const wrapperStyle = draggable
        ? {
            ...style,
            left: `${position.left}px`,
            top: `${position.top}px`,
            right: 'auto',
            maxHeight: '85vh',
        }
        : style;

    return (
        <div className="glass-panel workspace-window animate-in fade-in zoom-in-95 duration-200" style={wrapperStyle}>
            <div className="window-header" onMouseDown={handleDragStart}>
                <div className="flex items-center gap-2">
                    {Icon && <Icon size={16} className="text-primary" />}
                    <span className="text-sm font-bold tracking-tight">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={onMinimize} className="p-1.5 hover:bg-white/10 rounded-md text-text-muted transition-colors">
                        <Minus size={14} />
                    </button>
                    <button onClick={onClose} className="p-1.5 hover:bg-accent/20 text-accent rounded-md transition-colors">
                        <X size={14} />
                    </button>
                </div>
            </div>
            <div className="window-content custom-scrollbar" onWheel={(event) => event.stopPropagation()}>
                {children}
            </div>
        </div>
    );
};

const formatCoordinate = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return number.toFixed(5);
};

const toMinutes = (timeValue) => {
    const [h, m] = String(timeValue || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h * 60) + m;
};

const combineDateTime = (dateValue, timeValue) => {
    if (!dateValue || !timeValue) return null;
    const parsed = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
};

const computeConstrainedMinutes = ({ tripStartDate, tripStartTime, tripEndDate, tripEndTime, wakeTime, sleepTime }) => {
    const rangeStart = combineDateTime(tripStartDate, tripStartTime);
    const rangeEnd = combineDateTime(tripEndDate, tripEndTime);

    if (!rangeStart || !rangeEnd || rangeEnd <= rangeStart) {
        return { valid: false, totalMinutes: 0 };
    }

    const wakeMinutes = toMinutes(wakeTime);
    const sleepMinutes = toMinutes(sleepTime);
    if (!Number.isFinite(wakeMinutes) || !Number.isFinite(sleepMinutes) || wakeMinutes === sleepMinutes) {
        return { valid: false, totalMinutes: 0 };
    }

    const cursor = new Date(rangeStart);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(rangeEnd);
    endDay.setHours(0, 0, 0, 0);

    let totalMinutes = 0;

    while (cursor <= endDay) {
        const dayStart = new Date(cursor);
        const nextDay = new Date(cursor);
        nextDay.setDate(nextDay.getDate() + 1);

        const windows = wakeMinutes < sleepMinutes
            ? [
                [new Date(dayStart.getTime() + wakeMinutes * 60000), new Date(dayStart.getTime() + sleepMinutes * 60000)],
            ]
            : [
                [new Date(dayStart.getTime() + wakeMinutes * 60000), nextDay],
                [dayStart, new Date(dayStart.getTime() + sleepMinutes * 60000)],
            ];

        windows.forEach(([windowStart, windowEnd]) => {
            const effectiveStart = windowStart > rangeStart ? windowStart : rangeStart;
            const effectiveEnd = windowEnd < rangeEnd ? windowEnd : rangeEnd;
            totalMinutes += Math.max(0, Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000));
        });

        cursor.setDate(cursor.getDate() + 1);
    }

    return { valid: totalMinutes > 0, totalMinutes };
};

const scoreSearchResult = (location, query) => {
    const normalizedQuery = String(query || '').toLowerCase().trim();
    const name = String(location?.name || '').toLowerCase();
    const address = String(location?.address || '').toLowerCase();

    let score = 0;

    if (!normalizedQuery) return Number(location?.importance) || 0;

    if (name === normalizedQuery) score += 100;
    if (name.startsWith(normalizedQuery)) score += 60;
    if (name.includes(normalizedQuery)) score += 35;
    if (address.includes(normalizedQuery)) score += 20;

    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
        if (name.includes(token)) score += 8;
        if (address.includes(token)) score += 4;
    }

    score += (Number(location?.importance) || 0) * 30;

    return score;
};

const TripFormWindow = ({
    isOpen,
    onClose,
    locations,
    travelMethod,
    setTravelMethod,
    onAddLocation,
    onRemoveLocation,
    onOptimize,
    optimizerMode,
    onOptimizerModeChange,
    timeBudgetMinutes,
    onTimeBudgetMinutesChange,
    onUpdateLocationPriority,
    onUpdateLocationDuration,
    onMinimize,
    routeEstimate,
    pois,
    customNodes,
    selectedStartId,
    selectedDestinationId,
    onSetStart,
    onSetDestination,
    onEditLocation,
    onDeleteLocation,
    onSaveLocation,
    isLocationSaved,
    tripDate,
    onTripDateChange,
    tripStartDate,
    tripEndDate,
    tripStartTime,
    tripEndTime,
    wakeTime,
    sleepTime,
    onTripStartDateChange,
    onTripEndDateChange,
    onTripStartTimeChange,
    onTripEndTimeChange,
    onWakeTimeChange,
    onSleepTimeChange,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSavedNodes, setShowSavedNodes] = useState(true);

    const selectableLocations = useMemo(() => {
        const merged = [...locations, ...customNodes];
        const seen = new Set();

        return merged.filter((loc) => {
            const key = `${String(loc?.name || '').toLowerCase()}|${Number(loc?.lat).toFixed(5)}|${Number(loc?.lng).toFixed(5)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [locations, customNodes]);

    const localSearchIndex = useMemo(
        () => buildLocalSearchIndex({ pois, customNodes }),
        [pois, customNodes]
    );

    const isTimeConstrainedMode = optimizerMode === 'time-constrained-fit';
    const timeframe = useMemo(() => {
        if (!isTimeConstrainedMode) return 0;
        return computeConstrainedMinutes({
            tripStartDate,
            tripStartTime,
            tripEndDate,
            tripEndTime,
            wakeTime,
            sleepTime,
        });
    }, [isTimeConstrainedMode, tripStartDate, tripStartTime, tripEndDate, tripEndTime, wakeTime, sleepTime]);
    const timeframeMinutes = isTimeConstrainedMode ? timeframe.totalMinutes : 0;
    const hasValidTimeframe = !isTimeConstrainedMode || timeframe.valid;

    if (!isOpen) return null;

    const handleSearch = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);

        if (query.length <= 2) {
            setSearchResults([]);
            return;
        }

        const localMatches = searchLocalIndex(localSearchIndex, query, 8);

        let externalMatches = [];
        if (localMatches.length < 8) {
            const remainingSlots = 8 - localMatches.length;

            const strictExternal = await searchLocations(query, {
                limit: remainingSlots,
                countryCode: 'ca',
                bounded: true,
            });

            const strictMatches = strictExternal
                .map(item => normalizeLocation(item, 'nominatim'))
                .filter(Boolean)
                .sort((a, b) => Number(matchesLondonHint(b)) - Number(matchesLondonHint(a)));

            externalMatches = strictMatches;

            if (externalMatches.length === 0) {
                const fallbackExternal = await searchLocations(query, {
                    limit: remainingSlots,
                    countryCode: '',
                    bounded: false,
                    viewbox: null,
                });

                externalMatches = fallbackExternal
                    .map(item => normalizeLocation(item, 'nominatim'))
                    .filter(Boolean);
            }
        }

        const merged = dedupeLocations([...localMatches, ...externalMatches])
            .sort((a, b) => scoreSearchResult(b, query) - scoreSearchResult(a, query))
            .slice(0, 8);

        setSearchResults(merged);
    };

    const addLocation = (loc) => {
        onAddLocation(loc, { focusOnMap: true });
        setSearchQuery('');
        setSearchResults([]);
    };

    return (
        <WindowWrapper
            title="Plan Trip"
            icon={Search}
            onClose={onClose}
            onMinimize={onMinimize}
            style={{ top: '100px', left: '20px' }}
            draggable={true}
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Optimization Mode</label>
                    <div className="flex bg-bg-deep p-1 rounded-xl border border-border-glass">
                        {[
                            { key: 'shortest-feasible', label: 'Current Mode' },
                            { key: 'time-constrained-fit', label: 'Time Constrained' },
                        ].map((mode) => (
                            <button
                                key={mode.key}
                                onClick={() => onOptimizerModeChange(mode.key)}
                                className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all border ${optimizerMode === mode.key
                                    ? 'bg-primary text-white shadow-lg border-primary ring-2 ring-primary/40 scale-[1.02]'
                                    : 'hover:bg-white/5 text-text-muted border-transparent'
                                    }`}
                                style={optimizerMode === mode.key
                                    ? {
                                        backgroundColor: 'var(--primary)',
                                        color: '#ffffff',
                                        borderColor: 'var(--primary)',
                                        boxShadow: '0 0 0 2px rgba(99,102,241,0.45), 0 6px 16px rgba(99,102,241,0.35)',
                                        fontWeight: 800,
                                    }
                                    : {
                                        color: 'var(--text-muted)',
                                        borderColor: 'transparent',
                                    }
                                }
                            >
                                <span className="text-xs font-bold">{mode.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {!isTimeConstrainedMode && (
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Trip Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                            <input
                                type="date"
                                value={tripDate}
                                onChange={(e) => onTripDateChange(e.target.value)}
                                className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                            />
                        </div>
                    </div>
                )}

                {isTimeConstrainedMode && (
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Trip Timeframe</label>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="date"
                                value={tripStartDate}
                                onChange={(e) => onTripStartDateChange(e.target.value)}
                                className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                aria-label="Trip start date"
                            />
                            <input
                                type="date"
                                value={tripEndDate}
                                onChange={(e) => onTripEndDateChange(e.target.value)}
                                className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                aria-label="Trip end date"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="time"
                                value={tripStartTime}
                                onChange={(e) => onTripStartTimeChange(e.target.value)}
                                className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                aria-label="Trip start time"
                            />
                            <input
                                type="time"
                                value={tripEndTime}
                                onChange={(e) => onTripEndTimeChange(e.target.value)}
                                className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                aria-label="Trip end time"
                            />
                        </div>
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Daily Availability</label>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="time"
                                value={wakeTime}
                                onChange={(e) => onWakeTimeChange(e.target.value)}
                                className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                aria-label="Wake time"
                            />
                            <input
                                type="time"
                                value={sleepTime}
                                onChange={(e) => onSleepTimeChange(e.target.value)}
                                className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                aria-label="Sleep time"
                            />
                        </div>
                        <p className={`text-[11px] ${hasValidTimeframe ? 'text-text-muted' : 'text-accent font-bold'}`}>
                            {hasValidTimeframe
                                ? `Available planning time: ${timeframeMinutes} minutes (within wake-to-sleep windows)`
                                : 'Set a valid multi-day range and daily wake/sleep window'}
                        </p>
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Travel Method</label>
                    <div className="flex bg-bg-deep p-1 rounded-xl border border-border-glass">
                        {['walk', 'car', 'transit'].map(m => (
                            <button
                                key={m}
                                onClick={() => setTravelMethod(m)}
                                className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all border ${travelMethod === m
                                    ? 'bg-primary text-white shadow-lg border-primary ring-2 ring-primary/40 scale-[1.02]'
                                    : 'hover:bg-white/5 text-text-muted border-transparent'
                                    }`}
                                style={travelMethod === m
                                    ? {
                                        backgroundColor: 'var(--primary)',
                                        color: '#ffffff',
                                        borderColor: 'var(--primary)',
                                        boxShadow: '0 0 0 2px rgba(99,102,241,0.45), 0 6px 16px rgba(99,102,241,0.35)',
                                        fontWeight: 800,
                                    }
                                    : {
                                        color: 'var(--text-muted)',
                                        borderColor: 'transparent',
                                    }
                                }
                            >
                                {m === 'walk' && <Footprints size={16} />}
                                {m === 'car' && <Car size={16} />}
                                {m === 'transit' && <Train size={16} />}
                                <span className="ml-2 text-xs font-bold capitalize">{m}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {optimizerMode === 'max-priority-budget' && (
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Time Budget (minutes)</label>
                        <input
                            type="number"
                            min={30}
                            max={1440}
                            step={15}
                            value={timeBudgetMinutes}
                            onChange={(e) => {
                                const next = Math.min(1440, Math.max(30, Math.round(Number(e.target.value) || 30)));
                                onTimeBudgetMinutesChange(next);
                            }}
                            className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                        />
                    </div>
                )}

                <div className="relative">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2 block">Search Sights</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={handleSearch}
                            className="w-full bg-bg-deep border border-border-glass rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                            placeholder="Louvre, Eiffel Tower..."
                        />
                    </div>

                    {searchResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-2 glass-panel overflow-hidden border border-primary/20">
                            {searchResults.map(res => (
                                <button
                                    key={res.id}
                                    onClick={() => addLocation(res)}
                                    className="w-full text-left px-4 py-3 hover:bg-primary/10 flex items-center gap-3 border-b border-border-glass last:border-0"
                                >
                                    <MapPin size={14} className="text-primary shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs truncate font-medium">{res.name}</p>
                                        {res.address && (
                                            <p className="text-[10px] text-text-muted truncate">{res.address}</p>
                                        )}
                                        <p className="text-[10px] text-text-muted">
                                            Lat {formatCoordinate(res.lat)} • Lng {formatCoordinate(res.lng)}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">Locations ({locations.length})</label>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {locations.map((loc) => (
                            <div key={loc.id} className="glass-card p-3">
                                <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold truncate" title={loc.name}>{loc.name}</p>
                                        {loc.note && <p className="text-[10px] text-text-muted truncate">{loc.note}</p>}
                                        {isTimeConstrainedMode && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Duration(min)</label>
                                                <input
                                                    type="number"
                                                    min={5}
                                                    max={360}
                                                    step={5}
                                                    value={Math.min(360, Math.max(5, Math.round(Number(loc.duration) || 60)))}
                                                    onChange={(e) => onUpdateLocationDuration(loc.id, Number(e.target.value))}
                                                    className="w-[78px] bg-bg-deep border border-border-glass rounded-md px-2 py-1 text-[10px] font-bold outline-none"
                                                    aria-label={`Visit duration for ${loc.name}`}
                                                />
                                                
                                                <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Priority</label>
                                                <select
                                                    value={Math.min(5, Math.max(1, Number(loc.userPriority ?? loc.priority) || 1))}
                                                    onChange={(e) => onUpdateLocationPriority(loc.id, Number(e.target.value))}
                                                    className="bg-bg-deep border border-border-glass rounded-md px-2 py-1 text-[10px] font-bold outline-none"
                                                >
                                                    {[1, 2, 3, 4, 5].map((value) => (
                                                        <option key={`${loc.id}-priority-${value}`} value={value}>{value}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1">
                                        <button
                                            onClick={() => onSaveLocation(loc)}
                                            disabled={isLocationSaved(loc)}
                                            className="text-primary/70 hover:text-primary p-1.5 rounded-md hover:bg-primary/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                            title={isLocationSaved(loc) ? 'Already saved' : 'Save as location'}
                                        >
                                            <Star size={14} fill={isLocationSaved(loc) ? 'currentColor' : 'none'} />
                                        </button>
                                        <button
                                            onClick={() => onRemoveLocation(loc.id)}
                                            className="text-accent/60 hover:text-accent p-1.5 rounded-md hover:bg-accent/10 transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {locations.length === 0 && (
                            <div className="text-center py-6 border-2 border-dashed border-border-glass rounded-xl text-text-muted text-xs">
                                No locations added yet
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <table className="w-full border-separate" style={{ borderSpacing: '0 8px' }}>
                        <tbody>
                            <tr>
                                <td className="w-[110px] align-middle pr-5">
                                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Start</label>
                                </td>
                                <td>
                                    <div className="flex justify-end">
                                        <select
                                            value={selectedStartId}
                                            onChange={(e) => onSetStart(e.target.value)}
                                            className="w-[94%] min-w-0 bg-bg-deep border border-border-glass rounded-xl py-2.5 px-3 text-xs font-bold outline-none"
                                        >
                                            <option value="">Auto start (first location)</option>
                                            {selectableLocations.map((loc) => (
                                                <option key={`start-${loc.id}`} value={loc.id}>{loc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td className="w-[110px] align-middle pr-5">
                                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Destination</label>
                                </td>
                                <td>
                                    <div className="flex justify-end">
                                        <select
                                            value={selectedDestinationId}
                                            onChange={(e) => onSetDestination(e.target.value)}
                                            className="w-[94%] min-w-0 bg-bg-deep border border-border-glass rounded-xl py-2.5 px-3 text-xs font-bold outline-none"
                                        >
                                            <option value="">Auto destination (last location)</option>
                                            {selectableLocations.map((loc) => (
                                                <option key={`destination-${loc.id}`} value={loc.id}>{loc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <button
                    onClick={() => onOptimize({
                        locations,
                        travelMethod,
                        tripDate,
                        optimizerMode,
                        timeBudgetMinutes,
                        tripStartDate,
                        tripEndDate,
                        tripStartTime,
                        tripEndTime,
                        wakeTime,
                        sleepTime,
                    })}
                    disabled={locations.length < 2 || !hasValidTimeframe}
                    className="w-full bg-primary hover:bg-primary-hover py-3.5 rounded-xl font-bold text-sm shadow-xl shadow-primary/20 transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <Calendar size={16} />
                    {isTimeConstrainedMode ? 'Optimize Time-Constrained Fit' : 'Optimize Schedule'}
                </button>

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">Saved Locations ({customNodes.length})</label>
                        <button
                            onClick={() => setShowSavedNodes(prev => !prev)}
                            className="text-[10px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-border-glass"
                            title={showSavedNodes ? 'Collapse saved locations' : 'Expand saved locations'}
                        >
                            {showSavedNodes ? '▾' : '▸'}
                        </button>
                    </div>

                    {showSavedNodes && (
                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {customNodes.map((node) => (
                            <div key={node.id} className="glass-card p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-bold truncate flex-1">{node.name}</p>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => {
                                                const editedName = window.prompt('Rename saved location', node.name);
                                                if (!editedName) return;
                                                onEditLocation(node.id, { name: editedName.trim() });
                                            }}
                                            className="text-[10px] px-2 py-1 rounded-md hover:bg-white/10"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => onDeleteLocation(node.id)}
                                            className="text-[10px] px-2 py-1 rounded-md hover:bg-accent/20 text-accent"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-2 flex gap-1.5">
                                    <button
                                        onClick={() => onSetStart(node.id)}
                                        className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10"
                                    >
                                        Set Start
                                    </button>
                                    <button
                                        onClick={() => onSetDestination(node.id)}
                                        className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10"
                                    >
                                        Set Destination
                                    </button>
                                    <button
                                        onClick={() => onAddLocation(node)}
                                        className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10"
                                    >
                                        Add To Trip
                                    </button>
                                </div>
                            </div>
                        ))}
                        {customNodes.length === 0 && (
                            <div className="text-center py-4 border border-dashed border-border-glass rounded-xl text-text-muted text-xs">
                                No saved locations
                            </div>
                        )}
                        </div>
                    )}
                </div>

                {routeEstimate && (
                    <div className="glass-card space-y-1">
                        {routeEstimate.provider === 'error' ? (
                            <p className="text-xs font-bold text-accent">{routeEstimate.message}</p>
                        ) : (
                            <>
                                <p className="text-xs font-bold">Route estimate ({routeEstimate.provider})</p>
                                <p className="text-[11px] text-text-muted">
                                    {routeEstimate.durationMinutes} min • {routeEstimate.distanceKm} km • {travelMethod}
                                </p>
                                {routeEstimate.stopCount > 1 && (
                                    <p className="text-[11px] text-text-muted">Stops in route: {routeEstimate.stopCount}</p>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </WindowWrapper>
    );
};

export { TripFormWindow, WindowWrapper };
