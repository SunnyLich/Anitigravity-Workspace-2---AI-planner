import React from 'react';
import { Clock, Navigation, Download, Share2, MapPin, CalendarCheck } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { WindowWrapper } from './TripFormWindow';

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

const ItineraryWindow = ({ itinerary, travelMethod, tripDate, onItineraryUpdate, isOpen, onClose, onMinimize }) => {
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

        onItineraryUpdate?.(updated);
    };

    if (!isOpen || !itinerary || itinerary.length === 0) return null;

    return (
        <WindowWrapper
            title="Optimized Schedule"
            icon={CalendarCheck}
            onClose={onClose}
            onMinimize={onMinimize}
            style={{ top: '100px', right: '20px' }}
        >
            <div className="space-y-4">
                <div className="glass-card py-2 px-3">
                    <div className="flex items-center gap-4">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Date</span>
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
                        <Share2 size={14} /> PDF
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
                                <div className="flex items-center gap-3 ml-4 my-1 opacity-60">
                                    <div className="w-0.5 h-6 border-l border-dashed border-primary"></div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                        <Navigation size={12} className="text-primary" />
                                        <span>{item.travelFromPrevious} min {travelMethod}</span>
                                    </div>
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
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1">
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
                                            className="bg-bg-deep border border-border-glass rounded-md px-2 py-1 text-[10px] font-bold"
                                        />
                                        <span className="text-[10px] font-black text-text-muted">
                                            D{toDayOffset(absoluteTimeline[idx]?.arrivalAbs ?? 0) + 1}
                                        </span>
                                        <span className="text-[10px] text-text-muted font-bold">to</span>
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
                                            D{toDayOffset(absoluteTimeline[idx]?.departureAbs ?? 0) + 1}
                                        </span>
                                        {item.waitTime > 0 && (
                                            <span className="bg-warning/10 text-warning px-2 py-0.5 rounded-md text-[10px] font-black">
                                                Wait: {item.waitTime}m
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </WindowWrapper>
    );
};

export default ItineraryWindow;
