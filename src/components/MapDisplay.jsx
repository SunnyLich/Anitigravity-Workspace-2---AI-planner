import React, { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet markers in Vite
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Sub-component to fly to bounds when itinerary changes
const RecenterMap = ({ points }) => {
    const map = useMap();
    useEffect(() => {
        if (points && points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [50, 50], animate: true });
        }
    }, [points, map]);
    return null;
};

// Category color palette
const CATEGORY_COLORS = {
    amenity: '#6366f1',  // indigo
    shop: '#10b981',  // emerald
    tourism: '#f59e0b',  // amber
    leisure: '#3b82f6',  // blue
    historic: '#ef4444',  // red
    healthcare: '#14b8a6',  // teal
    office: '#8b5cf6',  // violet
    sport: '#f97316',  // orange
    building: '#94a3b8',  // slate
    natural: '#22c55e',  // green
};

// Category icons (emoji for tooltip)
const CATEGORY_ICONS = {
    amenity: '🏢',
    shop: '🛍️',
    tourism: '📸',
    leisure: '🏖️',
    historic: '🏛️',
    healthcare: '🏥',
    office: '💼',
    sport: '⚽',
    building: '🏗️',
    natural: '🌿',
};

// Format type for display (e.g. 'fast_food' → 'Fast Food')
const formatType = (t) => t ? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

// POI dot component
const PoiDot = ({ poi, zoom }) => {
    const [hovered, setHovered] = useState(false);
    const color = CATEGORY_COLORS[poi.category] || '#6366f1';
    const radius = hovered ? 9 : 6;

    // Hide low-priority POIs at low zoom for performance
    if (zoom < 13 && poi.priority > 2) return null;
    if (zoom < 12 && poi.priority > 1) return null;

    return (
        <CircleMarker
            center={[poi.lat, poi.lon]}
            radius={radius}
            pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: hovered ? 0.95 : 0.7,
                weight: hovered ? 2 : 1,
                opacity: 1,
            }}
            eventHandlers={{
                mouseover: () => setHovered(true),
                mouseout: () => setHovered(false),
            }}
        >
            <Tooltip
                direction="top"
                offset={[0, -8]}
                opacity={1}
                className="poi-tooltip"
            >
                <span className="poi-tooltip-icon">{CATEGORY_ICONS[poi.category]}</span>
                <strong>{poi.name}</strong>
                <span className="poi-tooltip-type">{formatType(poi.type)}</span>
            </Tooltip>
            <Popup className="poi-popup">
                <div className="poi-popup-content">
                    <div className="poi-popup-header" style={{ borderLeftColor: color }}>
                        <span className="poi-popup-icon">{CATEGORY_ICONS[poi.category]}</span>
                        <div>
                            <strong className="poi-popup-name">{poi.name}</strong>
                            <span className="poi-popup-type">{formatType(poi.type)}</span>
                        </div>
                    </div>
                    {poi.address && (
                        <div className="poi-popup-row">📍 {poi.address}</div>
                    )}
                    {poi.hours && (
                        <div className="poi-popup-row">🕐 {poi.hours}</div>
                    )}
                    {poi.phone && (
                        <div className="poi-popup-row">📞 {poi.phone}</div>
                    )}
                    {poi.website && (
                        <div className="poi-popup-row">
                            🌐 <a href={poi.website} target="_blank" rel="noreferrer">{poi.website.replace(/^https?:\/\//, '')}</a>
                        </div>
                    )}
                </div>
            </Popup>
        </CircleMarker>
    );
};

// Component that tracks zoom level
const ZoomTracker = ({ onZoomChange }) => {
    const map = useMap();
    useEffect(() => {
        onZoomChange(map.getZoom());
        map.on('zoomend', () => onZoomChange(map.getZoom()));
        return () => { map.off('zoomend'); };
    }, [map, onZoomChange]);
    return null;
};

// London, Ontario centre
const LONDON_ON = [42.9849, -81.2453];

const MapDisplay = ({ itinerary, pois = [] }) => {
    const points = itinerary.map(item => ({ lat: item.lat, lng: item.lng }));
    const polylinePositions = points.map(p => [p.lat, p.lng]);
    const center = points.length > 0 ? [points[0].lat, points[0].lng] : LONDON_ON;

    const [zoom, setZoom] = useState(13);
    const handleZoomChange = useCallback((z) => setZoom(z), []);

    return (
        <MapContainer
            center={center}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <ZoomTracker onZoomChange={handleZoomChange} />

            {/* London Ontario POI dots */}
            {pois.map(poi => (
                <PoiDot key={poi.id} poi={poi} zoom={zoom} />
            ))}

            {/* Itinerary markers */}
            {itinerary.map((item, idx) => (
                <Marker key={idx} position={[item.lat, item.lng]}>
                    <Popup>
                        <div className="text-bg-deep font-bold">{item.name.split(',')[0]}</div>
                        <div className="text-bg-deep text-xs">{item.arrivalTime}</div>
                    </Popup>
                </Marker>
            ))}

            {polylinePositions.length > 1 && (
                <Polyline
                    positions={polylinePositions}
                    color="#6366f1"
                    weight={4}
                    opacity={0.8}
                    dashArray="10, 10"
                />
            )}

            <RecenterMap points={points} />
        </MapContainer>
    );
};

export default MapDisplay;
