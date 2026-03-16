import React, { useMemo, useState } from 'react';
import { Clock, Download, MapPin, CalendarCheck, Train, Play } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { WindowWrapper } from './TripFormWindow';
import { getDefaultRouteColor } from '../utils/routeAppearance';

const DAY_MINUTES = 1440;

const timeToMinutes = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return (hours * 60) + minutes;
};

const minutesToTime = (totalMinutes) => {
    const normalized = ((Math.round(totalMinutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const toDayOffset = (totalMinutes) => Math.floor(totalMinutes / DAY_MINUTES);

const asAbsoluteTimeline = (items) => {
    let previousDeparture = null;

    return items.map((item) => {
        let arrival = Number(item?.arrivalAbsoluteMinutes);
        let departure = Number(item?.departureAbsoluteMinutes);

        if (!Number.isFinite(arrival)) {
            arrival = timeToMinutes(item?.arrivalTime);
        }

        if (!Number.isFinite(departure)) {
            departure = timeToMinutes(item?.departureTime);
        }

        if (!Number.isFinite(arrival)) arrival = previousDeparture ?? 0;
        if (Number.isFinite(previousDeparture)) {
            while (arrival < previousDeparture) arrival += DAY_MINUTES;
        }

        if (!Number.isFinite(departure)) {
            departure = arrival + Math.max(0, Number(item?.duration) || 0);
        }

        while (departure < arrival) departure += DAY_MINUTES;

        previousDeparture = departure;
        return { arrivalAbs: arrival, departureAbs: departure };
    });
};

const closestAbsoluteFromClock = (clockMinutes, referenceAbsolute) => {
    if (!Number.isFinite(clockMinutes)) return null;
    if (!Number.isFinite(referenceAbsolute)) return clockMinutes;

    const baseDay = Math.floor(referenceAbsolute / DAY_MINUTES);
    const candidates = [baseDay - 1, baseDay, baseDay + 1].map(
        (day) => day * DAY_MINUTES + clockMinutes
    );

    return candidates.reduce((best, candidate) => {
        if (best === null) return candidate;
        const bestDistance = Math.abs(best - referenceAbsolute);
        const candidateDistance = Math.abs(candidate - referenceAbsolute);
        return candidateDistance < bestDistance ? candidate : best;
    }, null);
};

const formatDateByOffset = (tripDate, dayOffset) => {
    if (!tripDate) return `Day ${dayOffset + 1}`;
    const parsed = new Date(`${tripDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return `Day ${dayOffset + 1}`;

    parsed.setDate(parsed.getDate() + dayOffset);
    return parsed.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
};

const formatTripDate = (dateValue) => {
    if (!dateValue) return '';
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const formatStatusReason = (statusReason) => {
    const normalized = String(statusReason || '').trim();
    if (!normalized) return 'Unknown issue';

    const labels = {
        'duration-exceeds-opening-window': 'Visit duration exceeds opening window',
        'cannot-finish-before-close': 'Cannot finish before close',
        'opening-window-conflict': 'Outside opening hours',
        'exceeds-time-budget': 'Exceeds time budget',
        'exceeds-time-budget-after-opening-wait': 'Exceeds budget after waiting for opening hours',
        'no-feasible-next-stop': 'No feasible sequence slot',
    };

    return labels[normalized] || normalized.replace(/-/g, ' ');
};

const formatIsoTime = (isoString) => {
    const parsed = new Date(isoString || '');
    if (Number.isNaN(parsed.getTime())) return '';

    return parsed.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
    });
};

const formatDistance = (distanceKm) => {
    const numericDistance = Number(distanceKm);
    if (!Number.isFinite(numericDistance) || numericDistance <= 0) return '';
    return `${numericDistance.toFixed(1)} km`;
};

const formatTransitLegHeading = (leg) => {
    const mode = String(leg?.mode || 'LEG').trim();
    const routeLabel = String(leg?.routeLabel || '').trim();
    return routeLabel ? `${mode} ${routeLabel}` : mode;
};

const getOpeningHoursProvenance = (location) => {
    const source = String(location?.metadata?.openingHoursSource || '').trim();
    const labels = {
        'openingHours-object': { text: 'Source hours', isPlaceholder: false },
        'openingRules-derived': { text: 'Source rules', isPlaceholder: false },
        'hours-text': { text: 'Parsed source text', isPlaceholder: false },
        'user-edit': { text: 'User edited hours', isPlaceholder: false },
        'default-fallback': { text: 'Placeholder default hours', isPlaceholder: true },
    };

    return labels[source] || { text: 'Unknown hours source', isPlaceholder: true };
};

const stopInteraction = (event) => {
    event.stopPropagation();
};

const ItineraryWindow = ({ itinerary, travelMethod, tripDate, onItineraryUpdate, onToggleRouteVisibility, onRouteColorChange, onAnimateRoute, canAnimateRoute, windowStyle, isOpen, onClose, onMinimize }) => {
    const [selectedTransitDetail, setSelectedTransitDetail] = useState(null);
    const [routeColorDrafts, setRouteColorDrafts] = useState({});
    const routeDraftScope = useMemo(() => (Array.isArray(itinerary)
        ? itinerary.map((item, index) => [
            item?.id || `stop-${index}`,
            item?.arrivalAbsoluteMinutes ?? item?.arrivalTime ?? '',
            item?.departureAbsoluteMinutes ?? item?.departureTime ?? '',
        ].join(':')).join('|')
        : 'empty'), [itinerary]);
    const absoluteTimeline = asAbsoluteTimeline(itinerary || []);
    const firstDayOffset = absoluteTimeline.length > 0 ? toDayOffset(absoluteTimeline[0].arrivalAbs) : 0;
    const lastDayOffset = absoluteTimeline.length > 0 ? toDayOffset(absoluteTimeline[absoluteTimeline.length - 1].departureAbs) : 0;
    const totalDays = Math.max(1, (lastDayOffset - firstDayOffset) + 1);

    const openNativeTimePicker = (event) => {
        const input = event.currentTarget;
        if (typeof input.showPicker === 'function') {
            input.showPicker();
        }
    };

    const exportPDF = () => {
        const input = document.getElementById('itinerary-content-inner');
        html2canvas(input, { scale: 2, useCORS: true, backgroundColor: '#0f172a' }).then((canvas) => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save('my-trip-itinerary.pdf');
        });
    };

    const exportJPG = () => {
        const input = document.getElementById('itinerary-content-inner');
        html2canvas(input, { scale: 2, useCORS: true, backgroundColor: '#0f172a' }).then((canvas) => {
            const link = document.createElement('a');
            link.download = 'my-trip-itinerary.jpg';
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        });
    };

    const handleArrivalChange = (index, newArrivalTime) => {
        const clockMinutes = timeToMinutes(newArrivalTime);
        const currentArrivalMinutes = absoluteTimeline[index]?.arrivalAbs;
        const newArrivalMinutes = closestAbsoluteFromClock(clockMinutes, currentArrivalMinutes);

        if (newArrivalMinutes === null || currentArrivalMinutes === null) return;

        const delta = newArrivalMinutes - currentArrivalMinutes;
        const updated = itinerary.map((item, currentIndex) => {
            if (currentIndex < index) return item;

            const baseArrival = absoluteTimeline[currentIndex]?.arrivalAbs ?? 0;
            const baseDeparture = absoluteTimeline[currentIndex]?.departureAbs ?? baseArrival;

            if (currentIndex === index) {
                const currentDepartureMinutes = baseDeparture;
                const shiftedDeparture = currentDepartureMinutes + delta;
                return {
                    ...item,
                    arrivalTime: minutesToTime(newArrivalMinutes),
                    departureTime: minutesToTime(shiftedDeparture),
                    arrivalAbsoluteMinutes: newArrivalMinutes,
                    departureAbsoluteMinutes: shiftedDeparture,
                    duration: Math.max(0, shiftedDeparture - newArrivalMinutes),
                };
            }

            const shiftedArrival = baseArrival + delta;
            const shiftedDeparture = baseDeparture + delta;

            return {
                ...item,
                arrivalTime: minutesToTime(shiftedArrival),
                departureTime: minutesToTime(shiftedDeparture),
                arrivalAbsoluteMinutes: shiftedArrival,
                departureAbsoluteMinutes: shiftedDeparture,
            };
        });

        updated.unscheduledStops = itinerary?.unscheduledStops || [];

        onItineraryUpdate?.(updated);
    };

    const handleDepartureChange = (index, newDepartureTime) => {
        const clockMinutes = timeToMinutes(newDepartureTime);
        const currentDepartureMinutes = absoluteTimeline[index]?.departureAbs;
        const newDepartureMinutes = closestAbsoluteFromClock(clockMinutes, currentDepartureMinutes);

        if (newDepartureMinutes === null || currentDepartureMinutes === null) return;

        const delta = newDepartureMinutes - currentDepartureMinutes;
        const updated = itinerary.map((item, currentIndex) => {
            if (currentIndex < index) return item;

            const baseArrival = absoluteTimeline[currentIndex]?.arrivalAbs ?? 0;
            const baseDeparture = absoluteTimeline[currentIndex]?.departureAbs ?? baseArrival;

            if (currentIndex === index) {
                const currentArrivalMinutes = baseArrival;
                return {
                    ...item,
                    departureTime: minutesToTime(newDepartureMinutes),
                    arrivalAbsoluteMinutes: currentArrivalMinutes,
                    departureAbsoluteMinutes: newDepartureMinutes,
                    duration: Math.max(0, newDepartureMinutes - currentArrivalMinutes),
                };
            }

            const shiftedArrival = baseArrival + delta;
            const shiftedDeparture = baseDeparture + delta;

            return {
                ...item,
                arrivalTime: minutesToTime(shiftedArrival),
                departureTime: minutesToTime(shiftedDeparture),
                arrivalAbsoluteMinutes: shiftedArrival,
                departureAbsoluteMinutes: shiftedDeparture,
            };
        });

        updated.unscheduledStops = itinerary?.unscheduledStops || [];

        onItineraryUpdate?.(updated);
    };

    const openTransitDetail = (item, index, isFromStart = false) => {
        const transitDetail = item?.transitFromPrevious;
        if (!transitDetail) return;

        const originName = isFromStart
            ? 'Start'
            : String(itinerary?.[index - 1]?.name || 'Previous stop').split(',')[0];

        setSelectedTransitDetail({
            ...transitDetail,
            originName,
            destinationName: String(item?.name || 'Next stop').split(',')[0],
            isFromStart,
            travelMinutes: Number(item?.travelFromPrevious) || 0,
        });
    };

    const getRouteDraftKey = (index) => `${routeDraftScope}:${index}`;

    const getRouteDisplayColor = (item, index) => routeColorDrafts[getRouteDraftKey(index)]
        || item?.transitFromPrevious?.mapColor
        || getDefaultRouteColor(index);

    const previewRouteColor = (index, color) => {
        const draftKey = getRouteDraftKey(index);
        setRouteColorDrafts((previous) => ({
            ...previous,
            [draftKey]: color,
        }));
    };

    const commitRouteColor = (index, color) => {
        const draftKey = getRouteDraftKey(index);
        setRouteColorDrafts((previous) => {
            if (!(draftKey in previous)) return previous;

            const nextDrafts = { ...previous };
            delete nextDrafts[draftKey];
            return nextDrafts;
        });

        onRouteColorChange?.(index, color);
    };

    const renderTransitSummary = (item, index, isFromStart = false) => (
        <div
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/5 px-2 py-1.5"
            onClick={stopInteraction}
            onMouseDown={stopInteraction}
            onPointerDown={stopInteraction}
            onWheel={stopInteraction}
        >
            <label className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-text-muted">
                <input
                    type="checkbox"
                    checked={item?.transitFromPrevious?.mapVisible !== false}
                    onChange={(event) => onToggleRouteVisibility?.(index, event.target.checked)}
                    onClick={stopInteraction}
                    onMouseDown={stopInteraction}
                    onPointerDown={stopInteraction}
                    className="h-3.5 w-3.5 accent-primary"
                    aria-label={`Toggle map visibility for ${String(item?.name || 'route').split(',')[0]}`}
                />
                Map
            </label>
            <label
                className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-black uppercase tracking-wider text-text-muted"
                onClick={stopInteraction}
                onMouseDown={stopInteraction}
                onPointerDown={stopInteraction}
                onWheel={stopInteraction}
            >
                <span
                    className="relative h-3.5 w-3.5 overflow-hidden rounded-full border border-white/30"
                    style={{ backgroundColor: getRouteDisplayColor(item, index) }}
                    title={`Current route color: ${getRouteDisplayColor(item, index)}`}
                >
                    <input
                        type="color"
                        value={getRouteDisplayColor(item, index)}
                        onInput={(event) => previewRouteColor(index, event.target.value)}
                        onChange={(event) => commitRouteColor(index, event.target.value)}
                        onClick={stopInteraction}
                        onMouseDown={stopInteraction}
                        onPointerDown={stopInteraction}
                        onWheel={stopInteraction}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label={`Choose route color for ${String(item?.name || 'route').split(',')[0]}`}
                    />
                </span>
                Color
            </label>
            <button
                type="button"
                onClick={() => openTransitDetail(item, index, isFromStart)}
                onMouseDown={stopInteraction}
                onPointerDown={stopInteraction}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/20 hover:shadow-lg hover:shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                title="View transit details"
            >
                <Train size={11} />
                <span>{item.travelFromPrevious} min transit{isFromStart ? ' from start' : ''}</span>
            </button>
        </div>
    );

    if (!isOpen || !itinerary || itinerary.length === 0) return null;

    return (
        <>
            <WindowWrapper
                title="Optimized Schedule"
                icon={CalendarCheck}
                onClose={onClose}
                onMinimize={onMinimize}
                style={windowStyle || { top: '100px', right: '20px' }}
                draggable
            >
                <div className="space-y-4">
                    <div className="glass-card py-2 px-3">
                        <div className="flex items-center gap-4">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Date:</span>
                            <span className="text-xs font-bold">{formatTripDate(tripDate)}</span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-primary/90">
                                {totalDays > 1 ? `${totalDays} days` : '1 day'}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <button onClick={exportJPG} className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold transition-all border border-border-glass">
                            <Download size={14} /> JPG
                        </button>
                        <button onClick={exportPDF} className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold transition-all border border-border-glass">
                            <Download size={14} /> PDF
                        </button>
                        <button
                            onClick={() => onAnimateRoute?.()}
                            disabled={!canAnimateRoute}
                            className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold transition-all border border-border-glass disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Play size={14} /> Animate
                        </button>
                    </div>

                    <div id="itinerary-content-inner" className="space-y-4">
                        {itinerary.map((item, idx) => (
                            <React.Fragment key={idx}>
                                {absoluteTimeline[idx] && idx > 0 && toDayOffset(absoluteTimeline[idx].arrivalAbs) !== toDayOffset(absoluteTimeline[idx - 1].arrivalAbs) && (
                                    <div className="glass-card py-1.5 px-3 border border-primary/30">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                                            Day {toDayOffset(absoluteTimeline[idx].arrivalAbs) + 1} · {formatDateByOffset(tripDate, toDayOffset(absoluteTimeline[idx].arrivalAbs))}
                                        </span>
                                    </div>
                                )}

                                {idx > 0 && (
                                    <div className="ml-4 my-1 opacity-70">
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                            {travelMethod === 'transit'
                                                ? renderTransitSummary(item, idx)
                                                : <span>{item.travelFromPrevious} min {travelMethod}</span>}
                                        </div>
                                        {travelMethod === 'transit' && item.transitFromPrevious?.notice && item.transitFromPrevious.unavailable && (
                                            <p className="text-[10px] font-bold text-accent">
                                                {item.transitFromPrevious.notice}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {idx === 0 && item.firstLegFromStart && Number(item.travelFromPrevious) > 0 && (
                                    <div className="ml-4 my-1 opacity-70">
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                            {travelMethod === 'transit'
                                                ? renderTransitSummary(item, idx, true)
                                                : <span>{item.travelFromPrevious} min {travelMethod} from start</span>}
                                        </div>
                                        {travelMethod === 'transit' && item.transitFromPrevious?.notice && item.transitFromPrevious.unavailable && (
                                            <p className="text-[10px] font-bold text-accent">
                                                {item.transitFromPrevious.notice}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="glass-card p-3 relative hover:border-primary/50 transition-all border border-transparent">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="bg-primary/20 p-1.5 rounded-lg text-primary shrink-0">
                                                <MapPin size={14} />
                                            </div>
                                            <h4 className="font-bold text-sm truncate">{item.name.split(',')[0]}</h4>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 " >
                                            {(() => {
                                                const provenance = getOpeningHoursProvenance(item);
                                                return (
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${provenance.isPlaceholder ? 'bg-warning/10 text-warning' : 'bg-white/5 text-text-muted'}`}>
                                                        {provenance.text}
                                                    </span>
                                                );
                                            })()}
                                            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 mr-1">
                                                <Clock size={10} />
                                                Time
                                            </span>
                                            <input
                                                type="time"
                                                value={minutesToTime(absoluteTimeline[idx]?.arrivalAbs ?? timeToMinutes(item.arrivalTime) ?? 0)}
                                                onChange={(e) => handleArrivalChange(idx, e.target.value)}
                                                onClick={openNativeTimePicker}
                                                onFocus={openNativeTimePicker}
                                                step={900}
                                                className="w-[100px] bg-bg-deep border border-border-glass rounded-md px-2 py-1 text-[10px] font-bold"
                                            />
                                            <span className="text-[10px] font-black text-text-muted">
                                                Day {toDayOffset(absoluteTimeline[idx]?.arrivalAbs ?? 0) + 1}
                                            </span>
                                            <span className="text-[10px] text-text-muted font-bold"> to </span>
                                            <input
                                                type="time"
                                                value={minutesToTime(absoluteTimeline[idx]?.departureAbs ?? timeToMinutes(item.departureTime) ?? 0)}
                                                onChange={(e) => handleDepartureChange(idx, e.target.value)}
                                                onClick={openNativeTimePicker}
                                                onFocus={openNativeTimePicker}
                                                step={900}
                                                className="bg-bg-deep border border-border-glass rounded-md px-2 py-1 text-[10px] font-bold"
                                            />
                                            <span className="text-[10px] font-black text-text-muted">
                                                Day  {toDayOffset(absoluteTimeline[idx]?.departureAbs ?? 0) + 1}
                                            </span>
                                            {item.waitTime > 0 && (
                                                <span className="bg-warning/10 text-warning px-2 py-0.5 rounded-md text-[10px] font-black">
                                                    Wait: {item.waitTime}m
                                                </span>
                                            )}
                                            {item.statusReason && (
                                                <span className="bg-accent/10 text-accent px-2 py-0.5 rounded-md text-[10px] font-black">
                                                    {formatStatusReason(item.statusReason)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        ))}

                        {Array.isArray(itinerary.unscheduledStops) && itinerary.unscheduledStops.length > 0 && (
                            <div className="glass-card p-3 border border-accent/30">
                                <p className="text-[11px] font-black uppercase tracking-wider text-accent mb-2">Unscheduled Stops</p>
                                <div className="space-y-2">
                                    {itinerary.unscheduledStops.map((item, idx) => (
                                        <div key={`unscheduled-${item.id || idx}`} className="bg-white/5 rounded-lg px-2.5 py-2">
                                            <p className="text-xs font-bold truncate">{item.name || 'Unnamed stop'}</p>
                                            {(() => {
                                                const provenance = getOpeningHoursProvenance(item);
                                                return (
                                                    <p className={`text-[10px] font-bold ${provenance.isPlaceholder ? 'text-warning' : 'text-text-muted'}`}>
                                                        {provenance.text}
                                                    </p>
                                                );
                                            })()}
                                            <p className="text-[10px] text-text-muted font-bold">
                                                {formatStatusReason(item.statusReason)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </WindowWrapper>

            {selectedTransitDetail && (
                <WindowWrapper
                    title="Transit Detail"
                    icon={Train}
                    onClose={() => setSelectedTransitDetail(null)}
                    onMinimize={() => setSelectedTransitDetail(null)}
                    draggable
                    style={{ top: 132, left: 468, zIndex: 520 }}
                >
                    <div className="space-y-3">
                        <div className="glass-card p-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-wider text-text-muted">Segment</p>
                                    <h4 className="text-sm font-bold text-text-main">
                                        {selectedTransitDetail.originName} -&gt; {selectedTransitDetail.destinationName}
                                    </h4>
                                </div>
                                {selectedTransitDetail.isScheduleAware && (
                                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
                                        Live transit
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                <span className="rounded-full bg-white/5 px-2 py-1">{selectedTransitDetail.travelMinutes} min total</span>
                                <span className="rounded-full bg-white/5 px-2 py-1">{selectedTransitDetail.provider || 'transit'} provider</span>
                                {selectedTransitDetail.departureTimeIso && selectedTransitDetail.arrivalTimeIso && (
                                    <span className="rounded-full bg-white/5 px-2 py-1">
                                        {formatIsoTime(selectedTransitDetail.departureTimeIso)} - {formatIsoTime(selectedTransitDetail.arrivalTimeIso)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {selectedTransitDetail.notice && (
                            <div className={`glass-card p-3 ${selectedTransitDetail.unavailable ? 'border border-accent/30' : ''}`}>
                                <p className={`text-xs font-bold ${selectedTransitDetail.unavailable ? 'text-accent' : 'text-text-muted'}`}>
                                    {selectedTransitDetail.notice}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                            <div className="glass-card p-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Transfers</p>
                                <p className="mt-1 text-sm font-bold">{Number(selectedTransitDetail.transferCount) || 0}</p>
                            </div>
                            <div className="glass-card p-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Walk</p>
                                <p className="mt-1 text-sm font-bold">{Number(selectedTransitDetail.walkMinutes) || 0} min</p>
                            </div>
                            <div className="glass-card p-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Wait</p>
                                <p className="mt-1 text-sm font-bold">{Number(selectedTransitDetail.waitMinutes) || 0} min</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-[11px] font-black uppercase tracking-wider text-text-muted">Legs</p>
                            {Array.isArray(selectedTransitDetail.transitLegs) && selectedTransitDetail.transitLegs.length > 0 ? (
                                selectedTransitDetail.transitLegs.map((leg, legIndex) => (
                                    <div key={`transit-detail-leg-${legIndex}`} className="glass-card p-3 space-y-1.5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-bold text-text-main">{formatTransitLegHeading(leg)}</p>
                                                {leg.headsign && (
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Headsign: {leg.headsign}</p>
                                                )}
                                            </div>
                                            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
                                                {Math.max(0, Math.round(Number(leg?.durationMinutes) || 0))} min
                                            </span>
                                        </div>
                                        {(leg.from || leg.to) && (
                                            <p className="text-[11px] font-semibold text-text-muted">
                                                {leg.from || 'Unknown start'} -&gt; {leg.to || 'Unknown end'}
                                            </p>
                                        )}
                                        {(leg.startTimeIso || leg.endTimeIso) && (
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                                {formatIsoTime(leg.startTimeIso) || 'Unknown'} - {formatIsoTime(leg.endTimeIso) || 'Unknown'}
                                            </p>
                                        )}
                                        {formatDistance(leg.distanceKm) && (
                                            <p className="text-[10px] font-bold text-text-muted">
                                                {formatDistance(leg.distanceKm)}
                                            </p>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="glass-card p-3">
                                    <p className="text-xs font-bold text-text-muted">No per-leg transit detail is available for this segment.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </WindowWrapper>
            )}
        </>
    );
};

export default ItineraryWindow;
