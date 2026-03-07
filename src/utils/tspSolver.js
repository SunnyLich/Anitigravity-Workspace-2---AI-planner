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
        this.lastSolveMeta = null;
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
        return Math.round((distance / this.travelSpeed) * 60); // returns whole minutes
    }

    timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    minutesToTime(minutes) {
        const wholeMinutes = Math.round(minutes);
        const normalized = ((wholeMinutes % 1440) + 1440) % 1440;
        const h = Math.floor(normalized / 60);
        const m = normalized % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    alignArrivalToOpeningWindow(arrivalMinutes, candidate) {
        const openMin = this.timeToMinutes(candidate?.openingHours?.start || '09:00');
        const closeMin = this.timeToMinutes(candidate?.openingHours?.end || '18:00');

        if (!Number.isFinite(openMin) || !Number.isFinite(closeMin)) {
            return { isValid: true, arrival: Math.round(arrivalMinutes), wait: 0 };
        }

        const duration = this.getDuration(candidate);
        const windowLength = closeMin > openMin ? closeMin - openMin : (closeMin + 1440) - openMin;
        if (duration > windowLength) {
            return { isValid: false, arrival: 0, wait: 0 };
        }

        const dayBase = Math.floor(arrivalMinutes / 1440) * 1440;
        let openAbsolute = dayBase + openMin;
        let closeAbsolute = dayBase + closeMin;

        if (closeMin <= openMin) {
            closeAbsolute += 1440;
        }

        let adjustedArrival = arrivalMinutes;

        while (adjustedArrival > closeAbsolute - duration) {
            openAbsolute += 1440;
            closeAbsolute += 1440;
        }

        const wait = adjustedArrival < openAbsolute ? openAbsolute - adjustedArrival : 0;
        adjustedArrival += wait;

        if (adjustedArrival + duration > closeAbsolute) {
            return { isValid: false, arrival: 0, wait: 0 };
        }

        return {
            isValid: true,
            arrival: Math.round(adjustedArrival),
            wait: Math.round(wait),
        };
    }

    getDuration(location) {
        const duration = Number(location?.duration);
        if (!Number.isFinite(duration) || duration <= 0) return 60;
        return Math.round(duration);
    }

    getPriority(location) {
        const priority = Number(location?.userPriority ?? location?.priority);
        if (!Number.isFinite(priority)) return 1;
        return Math.min(5, Math.max(1, Math.round(priority)));
    }

    evaluateCandidate(currentPos, currentTime, candidate) {
        const travelTime = this.getTravelTime(currentPos, candidate);
        const baseArrival = currentTime + travelTime + this.bufferTime;
        const windowResult = this.alignArrivalToOpeningWindow(baseArrival, candidate);

        if (!windowResult.isValid) return null;

        const duration = this.getDuration(candidate);
        const addedTime = (windowResult.arrival - currentTime) + duration;

        return {
            travelTime,
            waitTime: windowResult.wait,
            arrival: windowResult.arrival,
            duration,
            addedTime,
        };
    }

    solveShortestFeasible() {
        if (this.locations.length === 0) return [];

        let unvisited = [...this.locations];
        let currentPos = unvisited.shift(); // Start from the first location (usually hotel/start point)
        let currentTime = this.timeToMinutes(this.startTime);
        const firstDuration = this.getDuration(currentPos);

        const itinerary = [{
            ...currentPos,
            arrivalTime: this.startTime,
            departureTime: this.minutesToTime(currentTime + firstDuration),
            arrivalAbsoluteMinutes: currentTime,
            departureAbsoluteMinutes: currentTime + firstDuration,
            waitTime: 0
        }];

        currentTime += firstDuration;

        while (unvisited.length > 0) {
            let bestNext = null;
            let minCost = Infinity;
            let nextArrivalTime = 0;
            let nextWaitTime = 0;

            for (let i = 0; i < unvisited.length; i++) {
                const candidate = unvisited[i];
                const evaluated = this.evaluateCandidate(currentPos, currentTime, candidate);

                if (evaluated) {
                    // Cost function: travel time + wait time (greedy)
                    const cost = evaluated.travelTime + evaluated.waitTime;
                    if (cost < minCost) {
                        minCost = cost;
                        bestNext = i;
                        nextArrivalTime = evaluated.arrival;
                        nextWaitTime = evaluated.waitTime;
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
            const nextDuration = this.getDuration(nextNode);
            itinerary.push({
                ...nextNode,
                arrivalTime: this.minutesToTime(nextArrivalTime),
                departureTime: this.minutesToTime(nextArrivalTime + nextDuration),
                arrivalAbsoluteMinutes: nextArrivalTime,
                departureAbsoluteMinutes: nextArrivalTime + nextDuration,
                waitTime: nextWaitTime,
                travelFromPrevious: this.getTravelTime(currentPos, nextNode)
            });

            currentTime = nextArrivalTime + nextDuration;
            currentPos = nextNode;
        }

        this.lastSolveMeta = {
            mode: 'shortest-feasible',
            completedCount: itinerary.length,
            droppedCount: unvisited.length,
            totalPriority: itinerary.reduce((sum, stop) => sum + this.getPriority(stop), 0),
        };

        return itinerary;
    }

    solveMaxPriorityWithinBudget(timeBudgetMinutes = 240) {
        if (this.locations.length === 0) return [];

        const budgetLimit = Math.min(24 * 60, Math.max(30, Math.round(Number(timeBudgetMinutes) || 240)));

        let unvisited = [...this.locations];
        let currentPos = unvisited.shift();
        let currentTime = this.timeToMinutes(this.startTime);

        const firstDuration = this.getDuration(currentPos);
        let budgetUsed = firstDuration;

        const itinerary = [{
            ...currentPos,
            arrivalTime: this.startTime,
            departureTime: this.minutesToTime(currentTime + firstDuration),
            arrivalAbsoluteMinutes: currentTime,
            departureAbsoluteMinutes: currentTime + firstDuration,
            waitTime: 0,
            travelFromPrevious: 0,
        }];

        currentTime += firstDuration;

        while (unvisited.length > 0) {
            let bestIndex = null;
            let bestScore = -Infinity;
            let bestEvaluated = null;

            for (let i = 0; i < unvisited.length; i++) {
                const candidate = unvisited[i];
                const evaluated = this.evaluateCandidate(currentPos, currentTime, candidate);
                if (!evaluated) continue;

                const projectedBudgetUse = budgetUsed + evaluated.addedTime;
                if (projectedBudgetUse > budgetLimit) continue;

                const priority = this.getPriority(candidate);
                const valueDensity = priority / Math.max(1, evaluated.addedTime);
                const tieBreaker = (priority * 0.05) - (evaluated.waitTime * 0.002);
                const score = valueDensity + tieBreaker;

                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = i;
                    bestEvaluated = evaluated;
                }
            }

            if (bestIndex === null || !bestEvaluated) {
                break;
            }

            const nextNode = unvisited.splice(bestIndex, 1)[0];
            itinerary.push({
                ...nextNode,
                arrivalTime: this.minutesToTime(bestEvaluated.arrival),
                departureTime: this.minutesToTime(bestEvaluated.arrival + bestEvaluated.duration),
                arrivalAbsoluteMinutes: bestEvaluated.arrival,
                departureAbsoluteMinutes: bestEvaluated.arrival + bestEvaluated.duration,
                waitTime: bestEvaluated.waitTime,
                travelFromPrevious: bestEvaluated.travelTime,
            });

            budgetUsed += bestEvaluated.addedTime;
            currentTime = bestEvaluated.arrival + bestEvaluated.duration;
            currentPos = nextNode;
        }

        this.lastSolveMeta = {
            mode: 'max-priority-budget',
            budgetLimitMinutes: budgetLimit,
            budgetUsedMinutes: Math.round(budgetUsed),
            budgetRemainingMinutes: Math.max(0, Math.round(budgetLimit - budgetUsed)),
            completedCount: itinerary.length,
            droppedCount: unvisited.length,
            totalPriority: itinerary.reduce((sum, stop) => sum + this.getPriority(stop), 0),
            droppedStopIds: unvisited.map((stop) => stop.id),
        };

        return itinerary;
    }

    solve(options = {}) {
        const mode = options?.mode || 'shortest-feasible';

        if (mode === 'max-priority-budget') {
            return this.solveMaxPriorityWithinBudget(options?.timeBudgetMinutes);
        }

        return this.solveShortestFeasible();
    }
}
