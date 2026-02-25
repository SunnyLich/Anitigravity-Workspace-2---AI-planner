import React, { useEffect } from 'react';
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

// London, Ontario centre
const LONDON_ON = [42.9849, -81.2453];

const CATEGORY_COLORS = {
    amenity: '#6366f1',
    shop: '#10b981',
    tourism: '#f59e0b',
    leisure: '#3b82f6',
    historic: '#ef4444',
    healthcare: '#14b8a6',
    office: '#8b5cf6',
    sport: '#f97316',
    building: '#94a3b8',
    natural: '#22c55e',
};

const MapDisplay = ({ itinerary, routeGeometry = [], origin, destination, pois = [] }) => {
    const points = itinerary.map(item => ({ lat: item.lat, lng: item.lng }));
    const polylinePositions = points.map(p => [p.lat, p.lng]);
    const hasRouteGeometry = Array.isArray(routeGeometry) && routeGeometry.length > 1;
    const center = points.length > 0 ? [points[0].lat, points[0].lng] : LONDON_ON;

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

            {pois.map((poi) => {
                const color = CATEGORY_COLORS[poi.category] || '#6366f1';
                const title = poi.name || 'Unnamed Place';

                return (
                    <CircleMarker
                        key={poi.id}
                        center={[poi.lat, poi.lon]}
                        radius={5}
                        pathOptions={{
                            color,
                            fillColor: color,
                            fillOpacity: 0.72,
                            weight: 1,
                            opacity: 1,
                        }}
                    >
                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                            <strong>{title}</strong>
                        </Tooltip>
                    </CircleMarker>
                );
            })}

            {/* Itinerary markers */}
            {itinerary.map((item, idx) => (
                <Marker key={idx} position={[item.lat, item.lng]}>
                    <Popup>
                        <div className="text-bg-deep font-bold">{item.name.split(',')[0]}</div>
                        <div className="text-bg-deep text-xs">{item.arrivalTime}</div>
                    </Popup>
                </Marker>
            ))}

            {polylinePositions.length > 1 && !hasRouteGeometry && (
                <Polyline
                    positions={polylinePositions}
                    color="#6366f1"
                    weight={4}
                    opacity={0.8}
                    dashArray="10, 10"
                />
            )}

            {hasRouteGeometry && (
                <Polyline
                    positions={routeGeometry}
                    color="#22c55e"
                    weight={5}
                    opacity={0.85}
                />
            )}

            {origin && (
                <Marker position={[origin.lat, origin.lng]}>
                    <Popup>
                        <div className="text-bg-deep font-bold">Start</div>
                        <div className="text-bg-deep text-xs">{origin.name?.split(',')[0] || `${origin.lat}, ${origin.lng}`}</div>
                    </Popup>
                </Marker>
            )}

            {destination && (
                <Marker position={[destination.lat, destination.lng]}>
                    <Popup>
                        <div className="text-bg-deep font-bold">Destination</div>
                        <div className="text-bg-deep text-xs">{destination.name?.split(',')[0] || `${destination.lat}, ${destination.lng}`}</div>
                    </Popup>
                </Marker>
            )}

            <RecenterMap points={points} />
        </MapContainer>
    );
};

export default MapDisplay;
