import React from 'react';
import { Clock, Navigation, Download, Share2, MapPin, CalendarCheck } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { WindowWrapper } from './TripFormWindow';

const ItineraryWindow = ({ itinerary, travelMethod, isOpen, onClose, onMinimize }) => {
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

                            <div className="glass-card flex gap-3 p-3 relative hover:border-primary/50 transition-all border border-transparent">
                                <div className="flex flex-col items-center">
                                    <div className="bg-primary/20 p-2 rounded-lg text-primary">
                                        <MapPin size={16} />
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex justify-between items-start gap-2">
                                        <h4 className="font-bold text-sm truncate">{item.name.split(',')[0]}</h4>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1">
                                            <Clock size={10} />
                                            {item.arrivalTime} - {item.departureTime}
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
