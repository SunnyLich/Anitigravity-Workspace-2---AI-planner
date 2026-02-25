import React, { useState } from 'react';
import { X, Minus, MapPin, Search, Footprints, Car, Train, Calendar, Trash2 } from 'lucide-react';
import { searchLocations } from '../services/nominatim';

const WindowWrapper = ({ title, icon: Icon, children, onClose, onMinimize, style }) => {
    return (
        <div className="glass-panel workspace-window animate-in fade-in zoom-in-95 duration-200" style={style}>
            <div className="window-header">
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
            <div className="window-content custom-scrollbar">
                {children}
            </div>
        </div>
    );
};

const TripFormWindow = ({
    isOpen,
    onClose,
    onOptimize,
    onMinimize,
    onEstimateRoute,
    routeEstimate,
    isRouting,
}) => {
    const [locations, setLocations] = useState([]);
    const [travelMethod, setTravelMethod] = useState('walk');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    if (!isOpen) return null;

    const handleSearch = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (query.length > 2) {
            const results = await searchLocations(query);
            setSearchResults(results);
        } else {
            setSearchResults([]);
        }
    };

    const addLocation = (loc) => {
        setLocations([...locations, {
            ...loc,
            openingHours: { start: "09:00", end: "18:00" },
            duration: 60
        }]);
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
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Travel Method</label>
                    <div className="flex bg-bg-deep p-1 rounded-xl border border-border-glass">
                        {['walk', 'car', 'transit'].map(m => (
                            <button
                                key={m}
                                onClick={() => setTravelMethod(m)}
                                className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all ${travelMethod === m ? 'bg-primary text-white shadow-lg' : 'hover:bg-white/5 text-text-muted'
                                    }`}
                            >
                                {m === 'walk' && <Footprints size={16} />}
                                {m === 'car' && <Car size={16} />}
                                {m === 'transit' && <Train size={16} />}
                                <span className="ml-2 text-xs font-bold capitalize">{m}</span>
                            </button>
                        ))}
                    </div>
                </div>

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
                                    <span className="text-xs truncate font-medium">{res.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">Locations ({locations.length})</label>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {locations.map((loc) => (
                            <div key={loc.id} className="glass-card flex items-center justify-between gap-3 p-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">{loc.name.split(',')[0]}</p>
                                    <p className="text-[10px] text-text-muted truncate">{loc.name.split(',').slice(1, 3).join(',')}</p>
                                </div>
                                <button
                                    onClick={() => setLocations(locations.filter(l => l.id !== loc.id))}
                                    className="text-accent/60 hover:text-accent p-1.5 rounded-md hover:bg-accent/10 transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                        {locations.length === 0 && (
                            <div className="text-center py-6 border-2 border-dashed border-border-glass rounded-xl text-text-muted text-xs">
                                No locations added yet
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={() => onOptimize(locations, travelMethod)}
                    disabled={locations.length < 2}
                    className="w-full bg-primary hover:bg-primary-hover py-3.5 rounded-xl font-bold text-sm shadow-xl shadow-primary/20 transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <Calendar size={16} />
                    Optimize Schedule
                </button>

                <button
                    onClick={() => onEstimateRoute(locations, travelMethod)}
                    disabled={locations.length < 2 || isRouting}
                    className="w-full bg-white/5 hover:bg-white/10 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-border-glass"
                >
                    <MapPin size={16} />
                    {isRouting ? 'Estimating Route...' : 'Estimate Route Time'}
                </button>

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
                            </>
                        )}
                    </div>
                )}
            </div>
        </WindowWrapper>
    );
};

export { TripFormWindow, WindowWrapper };
