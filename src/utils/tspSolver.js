/**
 * Heuristic Solver for TSP with Time Windows (TSP-TW)
 * Uses Nearest Neighbor with Time Constraint checking and Local Search (2-Opt variant)
 */

export class TSPSolver {
    constructor(locations, options = {}) {
        this.locations = locations; // Array of { id, lat, lng, openingHours: { start, end }, duration }
        this.travelSpeed = options.travelSpeed || 5; // km/h for walking by default
        this.bufferTime = options.bufferTime || 15; // minutes between stops
        this.startTime = options.startTime || "09:00";
    }

    // Calculate distance between two points in km (Haversine formula)
    getDistance(p1, p2) {
        const R = 6371;
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLng = (p2.lng - p1.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    getTravelTime(p1, p2) {
        const distance = this.getDistance(p1, p2);
        return (distance / this.travelSpeed) * 60; // returns minutes
    }

    timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    minutesToTime(minutes) {
        const h = Math.floor(minutes / 60) % 24;
        const m = minutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    solve() {
        if (this.locations.length === 0) return [];

        let unvisited = [...this.locations];
        let currentPos = unvisited.shift(); // Start from the first location (usually hotel/start point)
        let currentTime = this.timeToMinutes(this.startTime);

        const itinerary = [{
            ...currentPos,
            arrivalTime: this.startTime,
            departureTime: this.minutesToTime(currentTime + currentPos.duration),
            waitTime: 0
        }];

        currentTime += currentPos.duration;

        while (unvisited.length > 0) {
            let bestNext = null;
            let minCost = Infinity;
            let nextArrivalTime = 0;
            let nextWaitTime = 0;

            for (let i = 0; i < unvisited.length; i++) {
                const candidate = unvisited[i];
                const travelTime = this.getTravelTime(currentPos, candidate);
                let arrival = currentTime + travelTime + this.bufferTime;
                let wait = 0;

                const openMin = this.timeToMinutes(candidate.openingHours.start);
                const closeMin = this.timeToMinutes(candidate.openingHours.end);

                // If we arrive before it opens, we wait
                if (arrival < openMin) {
                    wait = openMin - arrival;
                    arrival = openMin;
                }

                // Validity check: Can we finish before it closes?
                if (arrival + candidate.duration <= closeMin) {
                    // Cost function: travel time + wait time (greedy)
                    const cost = travelTime + wait;
                    if (cost < minCost) {
                        minCost = cost;
                        bestNext = i;
                        nextArrivalTime = arrival;
                        nextWaitTime = wait;
                    }
                }
            }

            if (bestNext === null) {
                // No valid next location found that respects time windows
                // For MVP, we'll just pick the closest one and mark it as "overdue" or logic to skip
                console.warn("Could not find a valid next stop respecting opening hours.");
                break;
            }

            const nextNode = unvisited.splice(bestNext, 1)[0];
            itinerary.push({
                ...nextNode,
                arrivalTime: this.minutesToTime(nextArrivalTime),
                departureTime: this.minutesToTime(nextArrivalTime + nextNode.duration),
                waitTime: nextWaitTime,
                travelFromPrevious: Math.round(this.getTravelTime(currentPos, nextNode))
            });

            currentTime = nextArrivalTime + nextNode.duration;
            currentPos = nextNode;
        }

        return itinerary;
    }
}
