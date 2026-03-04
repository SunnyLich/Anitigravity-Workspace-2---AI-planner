import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
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

const FocusMapTarget = ({ target }) => {
    const map = useMap();

    useEffect(() => {
        if (!target) return;
        const zoom = Math.max(map.getZoom(), 15);
        map.flyTo([target.lat, target.lng], zoom, { animate: true, duration: 0.75 });
    }, [target, map]);

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

function hexToRgb(hex) {
    const normalized = hex.replace('#', '');
    const expanded = normalized.length === 3
        ? normalized.split('').map(char => char + char).join('')
        : normalized;

    return {
        r: parseInt(expanded.slice(0, 2), 16),
        g: parseInt(expanded.slice(2, 4), 16),
        b: parseInt(expanded.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }) {
    const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
    return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function interpolateColor(startHex, endHex, ratio) {
    const start = hexToRgb(startHex);
    const end = hexToRgb(endHex);

    return rgbToHex({
        r: start.r + (end.r - start.r) * ratio,
        g: start.g + (end.g - start.g) * ratio,
        b: start.b + (end.b - start.b) * ratio,
    });
}

const MapInteractionLayer = ({ onMapContextMenu, onMapClick }) => {
    useMapEvents({
        contextmenu(event) {
            if (event?.originalEvent?.__poiContextHandled) return;
            event.originalEvent.preventDefault();
            if (!onMapContextMenu) return;

            onMapContextMenu({
                lat: event.latlng.lat,
                lng: event.latlng.lng,
                x: event.containerPoint.x,
                y: event.containerPoint.y,
            });
        },
        click() {
            if (onMapClick) onMapClick();
        },
    });

    return null;
};

const MapDisplay = ({
    itinerary,
    routeGeometry = [],
    origin,
    destination,
    focusTarget,
    pois = [],
    customNodes = [],
    onMapContextMenu,
    onMapClick,
}) => {
    const points = itinerary.map(item => ({ lat: item.lat, lng: item.lng }));
    const polylinePositions = points.map(p => [p.lat, p.lng]);
    const hasRouteGeometry = Array.isArray(routeGeometry) && routeGeometry.length > 1;
    const routeSegmentCount = hasRouteGeometry ? routeGeometry.length - 1 : 0;
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

            <MapInteractionLayer onMapContextMenu={onMapContextMenu} onMapClick={onMapClick} />

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
                        eventHandlers={{
                            contextmenu: (event) => {
                                if (!onMapContextMenu) return;
                                event.originalEvent.__poiContextHandled = true;
                                event.originalEvent.preventDefault();
                                event.originalEvent.stopPropagation();

                                onMapContextMenu({
                                    lat: poi.lat,
                                    lng: poi.lon,
                                    x: event.containerPoint.x,
                                    y: event.containerPoint.y,
                                    sourceType: 'poi',
                                    sourceId: poi.id,
                                    sourceName: poi.name || 'POI',
                                });
                            },
                        }}
                    >
                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                            <strong>{title}</strong>
                        </Tooltip>
                    </CircleMarker>
                );
            })}

            {customNodes.map((node) => (
                <CircleMarker
                    key={node.id}
                    center={[node.lat, node.lng]}
                    radius={7}
                    pathOptions={{
                        color: '#f97316',
                        fillColor: '#f97316',
                        fillOpacity: 0.85,
                        weight: 2,
                        opacity: 1,
                    }}
                >
                    <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                        <strong>{node.name}</strong>
                    </Tooltip>
                    <Popup>
                        <div className="text-bg-deep font-bold">{node.name}</div>
                        <div className="text-bg-deep text-xs">Custom location</div>
                        {node.note && <div className="text-bg-deep text-xs mt-1">{node.note}</div>}
                    </Popup>
                </CircleMarker>
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
                routeGeometry.slice(1).map((point, index) => {
                    const startPoint = routeGeometry[index];
                    const endPoint = point;
                    const ratio = routeSegmentCount <= 1 ? 1 : index / (routeSegmentCount - 1);
                    const segmentColor = interpolateColor('#6366f1', '#10b981', ratio);

                    return (
                        <Polyline
                            key={`route-segment-${index}`}
                            positions={[startPoint, endPoint]}
                            color={segmentColor}
                            weight={5}
                            opacity={0.92}
                        />
                    );
                })
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

            <FocusMapTarget target={focusTarget} />
            <RecenterMap points={points} />
        </MapContainer>
    );
};

export default MapDisplay;
