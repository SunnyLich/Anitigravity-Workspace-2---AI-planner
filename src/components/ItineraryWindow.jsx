import React from 'react';
import { Clock, Navigation, Download, Share2, MapPin, CalendarCheck } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { WindowWrapper } from './TripFormWindow';

const timeToMinutes = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return (hours * 60) + minutes;
};

const minutesToTime = (totalMinutes) => {
    const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
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
        const newArrivalMinutes = timeToMinutes(newArrivalTime);
        const currentArrivalMinutes = timeToMinutes(itinerary[index]?.arrivalTime);

        if (newArrivalMinutes === null || currentArrivalMinutes === null) return;

        const delta = newArrivalMinutes - currentArrivalMinutes;
        const updated = itinerary.map((item, currentIndex) => {
            if (currentIndex < index) return item;

            if (currentIndex === index) {
                const currentDepartureMinutes = timeToMinutes(item.departureTime) ?? newArrivalMinutes;
                return {
                    ...item,
                    arrivalTime: minutesToTime(newArrivalMinutes),
                    departureTime: minutesToTime(currentDepartureMinutes + delta),
                    duration: Math.max(0, (currentDepartureMinutes + delta) - newArrivalMinutes),
                };
            }

            const shiftedArrival = (timeToMinutes(item.arrivalTime) ?? 0) + delta;
            const shiftedDeparture = (timeToMinutes(item.departureTime) ?? shiftedArrival) + delta;

            return {
                ...item,
                arrivalTime: minutesToTime(shiftedArrival),
                departureTime: minutesToTime(shiftedDeparture),
            };
        });

        onItineraryUpdate?.(updated);
    };

    const handleDepartureChange = (index, newDepartureTime) => {
        const newDepartureMinutes = timeToMinutes(newDepartureTime);
        const currentDepartureMinutes = timeToMinutes(itinerary[index]?.departureTime);

        if (newDepartureMinutes === null || currentDepartureMinutes === null) return;

        const delta = newDepartureMinutes - currentDepartureMinutes;
        const updated = itinerary.map((item, currentIndex) => {
            if (currentIndex < index) return item;

            if (currentIndex === index) {
                const currentArrivalMinutes = timeToMinutes(item.arrivalTime) ?? newDepartureMinutes;
                return {
                    ...item,
                    departureTime: minutesToTime(newDepartureMinutes),
                    duration: Math.max(0, newDepartureMinutes - currentArrivalMinutes),
                };
            }

            const shiftedArrival = (timeToMinutes(item.arrivalTime) ?? 0) + delta;
            const shiftedDeparture = (timeToMinutes(item.departureTime) ?? shiftedArrival) + delta;

            return {
                ...item,
                arrivalTime: minutesToTime(shiftedArrival),
                departureTime: minutesToTime(shiftedDeparture),
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
                                            value={item.arrivalTime}
                                            onChange={(e) => handleArrivalChange(idx, e.target.value)}
                                            onClick={openNativeTimePicker}
                                            onFocus={openNativeTimePicker}
                                            step={900}
                                            className="bg-bg-deep border border-border-glass rounded-md px-2 py-1 text-[10px] font-bold"
                                        />
                                        <span className="text-[10px] text-text-muted font-bold">to</span>
                                        <input
                                            type="time"
                                            value={item.departureTime}
                                            onChange={(e) => handleDepartureChange(idx, e.target.value)}
                                            onClick={openNativeTimePicker}
                                            onFocus={openNativeTimePicker}
                                            step={900}
                                            className="bg-bg-deep border border-border-glass rounded-md px-2 py-1 text-[10px] font-bold"
                                        />
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
