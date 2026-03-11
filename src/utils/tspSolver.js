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
        this.startDateTime = options.startDateTime || '';
        this.travelTimeProvider = typeof options.travelTimeProvider === 'function'
            ? options.travelTimeProvider
            : null;
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

    getDateTimeForAbsoluteMinutes(absoluteMinutes) {
        const parsed = new Date(this.startDateTime);
        if (Number.isNaN(parsed.getTime())) return '';

        const startMinutes = this.timeToMinutes(this.startTime);
        if (!Number.isFinite(startMinutes) || !Number.isFinite(Number(absoluteMinutes))) {
            return parsed.toISOString();
        }

        const deltaMinutes = Math.round(Number(absoluteMinutes) - startMinutes);
        return new Date(parsed.getTime() + (deltaMinutes * 60000)).toISOString();
    }

    async getTravelTime(p1, p2, departureAbsoluteMinutes = null) {
        if (this.travelTimeProvider) {
            try {
                const provided = await this.travelTimeProvider({
                    origin: p1,
                    destination: p2,
                    departureAbsoluteMinutes,
                    departureDateTimeIso: this.getDateTimeForAbsoluteMinutes(departureAbsoluteMinutes),
                });

                if (Number.isFinite(Number(provided))) {
                    return Math.max(0, Math.round(Number(provided)));
                }
            } catch (error) {
                console.warn('Falling back to heuristic travel time:', error);
            }
        }

        const distance = this.getDistance(p1, p2);
        return Math.round((distance / this.travelSpeed) * 60); // returns whole minutes
    }

    getTimeframeBudgetMinutes(startTime, endTime, fallbackMinutes = 240) {
        const start = this.timeToMinutes(startTime);
        const end = this.timeToMinutes(endTime);

        if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) {
            return Math.max(1, Math.round(Number(fallbackMinutes) || 240));
        }

        if (end > start) return end - start;
        return (end + 1440) - start;
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
            return { isValid: true, arrival: Math.round(arrivalMinutes), wait: 0, statusReason: null };
        }

        const duration = this.getDuration(candidate);
        const windowLength = closeMin > openMin ? closeMin - openMin : (closeMin + 1440) - openMin;
        if (duration > windowLength) {
            return { isValid: false, arrival: 0, wait: 0, statusReason: 'duration-exceeds-opening-window' };
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
            return { isValid: false, arrival: 0, wait: 0, statusReason: 'cannot-finish-before-close' };
        }

        return {
            isValid: true,
            arrival: Math.round(adjustedArrival),
            wait: Math.round(wait),
            statusReason: null,
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

    async evaluateCandidate(currentPos, currentTime, candidate) {
        const travelTime = await this.getTravelTime(currentPos, candidate, currentTime);
        const baseArrival = currentTime + travelTime + this.bufferTime;
        const windowResult = this.alignArrivalToOpeningWindow(baseArrival, candidate);

        if (!windowResult.isValid) {
            return {
                isValid: false,
                travelTime,
                waitTime: 0,
                arrival: baseArrival,
                duration: this.getDuration(candidate),
                addedTime: 0,
                statusReason: windowResult.statusReason || 'opening-window-conflict',
            };
        }

        const duration = this.getDuration(candidate);
        const addedTime = (windowResult.arrival - currentTime) + duration;

        return {
            isValid: true,
            travelTime,
            waitTime: windowResult.wait,
            arrival: windowResult.arrival,
            duration,
            addedTime,
            statusReason: null,
        };
    }

    getBudgetOverflowReason(evaluated, remainingBudget) {
        if (!evaluated?.isValid) return evaluated?.statusReason || 'opening-window-conflict';

        const remaining = Math.max(0, Math.round(Number(remainingBudget) || 0));
        if (evaluated.addedTime <= remaining) return null;

        if (evaluated.waitTime > 0) {
            return 'exceeds-time-budget-after-opening-wait';
        }

        return 'exceeds-time-budget';
    }

    async solveShortestFeasible() {
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
            let nextTravelTime = 0;
            const candidateReasons = new Map();

            for (let i = 0; i < unvisited.length; i++) {
                const candidate = unvisited[i];
                const evaluated = await this.evaluateCandidate(currentPos, currentTime, candidate);

                if (evaluated?.isValid) {
                    // Cost function: travel time + wait time (greedy)
                    const cost = evaluated.travelTime + evaluated.waitTime;
                    if (cost < minCost) {
                        minCost = cost;
                        bestNext = i;
                        nextArrivalTime = evaluated.arrival;
                        nextWaitTime = evaluated.waitTime;
                        nextTravelTime = evaluated.travelTime;
                    }
                } else if (evaluated?.statusReason) {
                    candidateReasons.set(candidate.id, evaluated.statusReason);
                }
            }

            if (bestNext === null) {
                // No valid next location found that respects time windows
                console.warn("Could not find a valid next stop respecting opening hours.");

                const unscheduledStops = unvisited.map((stop) => ({
                    ...stop,
                    statusReason: candidateReasons.get(stop.id) || 'opening-window-conflict',
                }));

                this.lastSolveMeta = {
                    mode: 'shortest-feasible',
                    completedCount: itinerary.length,
                    droppedCount: unvisited.length,
                    totalPriority: itinerary.reduce((sum, stop) => sum + this.getPriority(stop), 0),
                    unscheduledStops,
                };
                itinerary.unscheduledStops = unscheduledStops;
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
                travelFromPrevious: nextTravelTime
            });

            currentTime = nextArrivalTime + nextDuration;
            currentPos = nextNode;
        }

        if (!this.lastSolveMeta || this.lastSolveMeta.mode !== 'shortest-feasible') {
            this.lastSolveMeta = {
                mode: 'shortest-feasible',
                completedCount: itinerary.length,
                droppedCount: unvisited.length,
                totalPriority: itinerary.reduce((sum, stop) => sum + this.getPriority(stop), 0),
                unscheduledStops: [],
            };
            itinerary.unscheduledStops = [];
        }

        return itinerary;
    }

    async solveMaxPriorityWithinBudget(timeBudgetMinutes = 240) {
        if (this.locations.length === 0) return [];

        const budgetLimit = Math.max(1, Math.round(Number(timeBudgetMinutes) || 240));
        const startAnchor = this.locations[0];
        const tripStartMinutes = this.timeToMinutes(this.startTime);
        const locations = [...this.locations];

        const createStateKey = (currentPos, currentTime, budgetUsed, remaining) => {
            const timeBucket = Math.floor(currentTime / 15);
            const remainingIds = remaining.map((loc) => loc.id).sort().join('|');
            return `${currentPos?.id || 'none'}::${timeBucket}::${Math.round(budgetUsed)}::${remainingIds}`;
        };

        const getOptimisticPriorityBound = (remaining, remainingBudget) => {
            if (remainingBudget <= 0 || remaining.length === 0) return 0;

            const sortedPriorities = remaining
                .map((stop) => ({
                    priority: this.getPriority(stop),
                    minCost: Math.max(1, this.getDuration(stop)),
                }))
                .sort((a, b) => b.priority - a.priority);

            let budget = remainingBudget;
            let optimisticPriority = 0;

            for (let i = 0; i < sortedPriorities.length; i++) {
                const item = sortedPriorities[i];
                if (item.minCost > budget) continue;
                optimisticPriority += item.priority;
                budget -= item.minCost;
                if (budget <= 0) break;
            }

            return optimisticPriority;
        };

        const isBetterSolution = (candidate, incumbent) => {
            if (!incumbent) return true;
            if (candidate.totalPriority !== incumbent.totalPriority) {
                return candidate.totalPriority > incumbent.totalPriority;
            }
            if (candidate.path.length !== incumbent.path.length) {
                return candidate.path.length > incumbent.path.length;
            }
            return candidate.budgetUsed < incumbent.budgetUsed;
        };

        const visitedStatePriority = new Map();
        let best = null;

        const dfs = async (currentPos, currentTime, budgetUsed, totalPriority, remaining, path) => {
            const partial = { totalPriority, budgetUsed, path };
            if (isBetterSolution(partial, best)) {
                best = {
                    totalPriority,
                    budgetUsed,
                    path: [...path],
                    currentPos,
                    currentTime,
                    remaining: [...remaining],
                };
            }

            if (remaining.length === 0) return;

            const remainingBudget = Math.max(0, budgetLimit - budgetUsed);
            const optimisticUpperBound = totalPriority + getOptimisticPriorityBound(remaining, remainingBudget);
            if (best && optimisticUpperBound < best.totalPriority) {
                return;
            }

            const stateKey = createStateKey(currentPos, currentTime, budgetUsed, remaining);
            const bestSeenPriority = visitedStatePriority.get(stateKey);
            if (Number.isFinite(bestSeenPriority) && bestSeenPriority >= totalPriority) {
                return;
            }
            visitedStatePriority.set(stateKey, totalPriority);

            const moves = [];

            for (let i = 0; i < remaining.length; i++) {
                const candidate = remaining[i];
                const evaluated = await this.evaluateCandidate(currentPos, currentTime, candidate);
                if (!evaluated?.isValid) continue;

                const projectedBudget = budgetUsed + evaluated.addedTime;
                if (projectedBudget > budgetLimit) continue;

                const priority = this.getPriority(candidate);
                const score = (priority / Math.max(1, evaluated.addedTime)) - (evaluated.waitTime * 0.0005);

                moves.push({
                    index: i,
                    candidate,
                    evaluated,
                    projectedBudget,
                    projectedPriority: totalPriority + priority,
                    score,
                });
            }

            // Explore likely-strong branches first so pruning can cut more of the tree.
            moves.sort((a, b) => b.score - a.score);

            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                const nextRemaining = [
                    ...remaining.slice(0, move.index),
                    ...remaining.slice(move.index + 1),
                ];

                await dfs(
                    move.candidate,
                    move.evaluated.arrival + move.evaluated.duration,
                    move.projectedBudget,
                    move.projectedPriority,
                    nextRemaining,
                    [...path, { node: move.candidate, evaluated: move.evaluated }]
                );
            }
        };

        for (let i = 0; i < locations.length; i++) {
            const first = locations[i];
            const firstTravelMinutes = (startAnchor && startAnchor.id !== first.id)
                ? await this.getTravelTime(startAnchor, first, tripStartMinutes)
                : 0;

            const baseArrival = tripStartMinutes + firstTravelMinutes;
            const firstWindow = this.alignArrivalToOpeningWindow(baseArrival, first);
            if (!firstWindow.isValid) continue;

            const firstDuration = this.getDuration(first);
            const firstAddedTime = firstTravelMinutes + firstWindow.wait + firstDuration;
            if (firstAddedTime > budgetLimit) continue;

            const firstEvaluated = {
                isValid: true,
                travelTime: firstTravelMinutes,
                waitTime: firstWindow.wait,
                arrival: firstWindow.arrival,
                duration: firstDuration,
                addedTime: firstAddedTime,
                statusReason: null,
            };

            const remaining = [
                ...locations.slice(0, i),
                ...locations.slice(i + 1),
            ];

            await dfs(
                first,
                firstEvaluated.arrival + firstEvaluated.duration,
                firstAddedTime,
                this.getPriority(first),
                remaining,
                [{ node: first, evaluated: firstEvaluated }]
            );
        }

        if (!best || best.path.length === 0) {
            const unscheduledStops = locations.map((stop) => ({
                ...stop,
                statusReason: 'no-feasible-start-stop',
            }));

            this.lastSolveMeta = {
                mode: 'max-priority-budget',
                searchStrategy: 'dfs-backtracking-pruning',
                budgetLimitMinutes: budgetLimit,
                budgetUsedMinutes: 0,
                budgetRemainingMinutes: budgetLimit,
                completedCount: 0,
                droppedCount: locations.length,
                totalPriority: 0,
                droppedStopIds: locations.map((stop) => stop.id),
                unscheduledStops,
            };

            const empty = [];
            empty.unscheduledStops = unscheduledStops;
            return empty;
        }

        const acceptedPath = [];
        const overflowPath = [];
        let strictBudgetUsed = 0;

        for (let i = 0; i < best.path.length; i++) {
            const step = best.path[i];
            const projectedBudget = strictBudgetUsed + step.evaluated.addedTime;

            if (projectedBudget > budgetLimit) {
                overflowPath.push(...best.path.slice(i));
                break;
            }

            acceptedPath.push(step);
            strictBudgetUsed = projectedBudget;
        }

        const itinerary = acceptedPath.map((step, index) => ({
            ...step.node,
            arrivalTime: this.minutesToTime(step.evaluated.arrival),
            departureTime: this.minutesToTime(step.evaluated.arrival + step.evaluated.duration),
            arrivalAbsoluteMinutes: step.evaluated.arrival,
            departureAbsoluteMinutes: step.evaluated.arrival + step.evaluated.duration,
            waitTime: step.evaluated.waitTime,
            travelFromPrevious: step.evaluated.travelTime,
            firstLegFromStart: index === 0 && step.evaluated.travelTime > 0,
        }));

        const scheduledIds = new Set(acceptedPath.map((step) => step.node.id));
        const overflowIds = new Set(overflowPath.map((step) => step.node.id));
        const hasScheduled = acceptedPath.length > 0;
        const lastAcceptedStep = hasScheduled ? acceptedPath[acceptedPath.length - 1] : null;
        const referencePos = hasScheduled ? lastAcceptedStep.node : startAnchor;
        const referenceTime = hasScheduled
            ? (lastAcceptedStep.evaluated.arrival + lastAcceptedStep.evaluated.duration)
            : tripStartMinutes;

        const unscheduledStops = await Promise.all(locations
            .filter((stop) => !scheduledIds.has(stop.id))
            .map(async (stop) => {
                if (overflowIds.has(stop.id)) {
                    const overflowStep = overflowPath.find((step) => step.node.id === stop.id);
                    const overflowReason = this.getBudgetOverflowReason(
                        overflowStep?.evaluated,
                        Math.max(0, budgetLimit - strictBudgetUsed)
                    );

                    return {
                        ...stop,
                        statusReason: overflowReason || 'exceeds-time-budget',
                    };
                }

                const evaluated = await this.evaluateCandidate(referencePos, referenceTime, stop);

                let statusReason = 'not-selected-by-priority-search';
                if (!evaluated?.isValid) {
                    statusReason = evaluated?.statusReason || 'opening-window-conflict';
                } else if ((strictBudgetUsed + evaluated.addedTime) > budgetLimit) {
                    statusReason = this.getBudgetOverflowReason(
                        evaluated,
                        Math.max(0, budgetLimit - strictBudgetUsed)
                    ) || 'exceeds-time-budget';
                }

                return {
                    ...stop,
                    statusReason,
                };
            }));

        this.lastSolveMeta = {
            mode: 'max-priority-budget',
            searchStrategy: 'dfs-backtracking-pruning',
            budgetLimitMinutes: budgetLimit,
            budgetUsedMinutes: Math.round(strictBudgetUsed),
            budgetRemainingMinutes: Math.max(0, Math.round(budgetLimit - strictBudgetUsed)),
            completedCount: itinerary.length,
            droppedCount: unscheduledStops.length,
            totalPriority: itinerary.reduce((sum, stop) => sum + this.getPriority(stop), 0),
            droppedStopIds: unscheduledStops.map((stop) => stop.id),
            unscheduledStops,
        };
        itinerary.unscheduledStops = unscheduledStops;
        return itinerary;
    }

    async solve(options = {}) {
        const mode = options?.mode || 'shortest-feasible';
        const startTime = options?.tripStartTime || this.startTime;
        this.startTime = startTime;
        if (options?.tripStartDate && options?.tripStartTime) {
            this.startDateTime = `${options.tripStartDate}T${options.tripStartTime}:00`;
        }

        if (mode === 'time-constrained-fit') {
            const budget = this.getTimeframeBudgetMinutes(options?.tripStartTime, options?.tripEndTime, options?.timeBudgetMinutes);
            return this.solveMaxPriorityWithinBudget(budget);
        }

        if (mode === 'max-priority-budget') {
            return this.solveMaxPriorityWithinBudget(options?.timeBudgetMinutes);
        }

        return this.solveShortestFeasible();
    }
}
