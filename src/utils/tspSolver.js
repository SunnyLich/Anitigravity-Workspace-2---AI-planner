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
        this.shouldCancel = typeof options.shouldCancel === 'function'
            ? options.shouldCancel
            : null;
        this.travelTimeProvider = typeof options.travelTimeProvider === 'function'
            ? options.travelTimeProvider
            : null;
        this.lastSolveMeta = null;
    }

    throwIfCancelled() {
        if (this.shouldCancel?.()) {
            throw new Error('optimization-cancelled');
        }
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
        this.throwIfCancelled();

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

    materializePath(path, options = {}) {
        const includeFirstLegFromStart = Boolean(options?.includeFirstLegFromStart);

        return (Array.isArray(path) ? path : []).map((step, index) => ({
            ...step.node,
            arrivalTime: this.minutesToTime(step.evaluated.arrival),
            departureTime: this.minutesToTime(step.evaluated.arrival + step.evaluated.duration),
            arrivalAbsoluteMinutes: step.evaluated.arrival,
            departureAbsoluteMinutes: step.evaluated.arrival + step.evaluated.duration,
            waitTime: step.evaluated.waitTime,
            travelFromPrevious: step.evaluated.travelTime,
            firstLegFromStart: includeFirstLegFromStart && index === 0 && step.evaluated.travelTime > 0,
        }));
    }

    buildCandidateRecord({
        mode,
        path,
        totalPriority = 0,
        totalTravelMinutes = 0,
        totalWaitMinutes = 0,
        budgetUsed = null,
        budgetLimit = null,
        remaining = [],
        includeFirstLegFromStart = false,
    }) {
        if (!Array.isArray(path) || path.length === 0) {
            return null;
        }

        const itinerary = this.materializePath(path, { includeFirstLegFromStart });
        const sequenceKey = path.map((step) => step.node?.id || 'unknown').join('>');
        const startMinutes = this.timeToMinutes(this.startTime);
        const lastStep = path[path.length - 1];
        const elapsedMinutes = Number.isFinite(startMinutes)
            ? Math.max(0, Math.round((lastStep.evaluated.arrival + lastStep.evaluated.duration) - startMinutes))
            : Math.max(0, Math.round(Number(budgetUsed) || 0));

        return {
            id: `${mode}-${sequenceKey}`,
            sequenceKey,
            mode,
            completedCount: itinerary.length,
            totalPriority: Math.max(0, Math.round(Number(totalPriority) || 0)),
            totalTravelMinutes: Math.max(0, Math.round(Number(totalTravelMinutes) || 0)),
            totalWaitMinutes: Math.max(0, Math.round(Number(totalWaitMinutes) || 0)),
            elapsedMinutes,
            budgetUsedMinutes: Number.isFinite(Number(budgetUsed))
                ? Math.max(0, Math.round(Number(budgetUsed)))
                : elapsedMinutes,
            budgetRemainingMinutes: Number.isFinite(Number(budgetLimit))
                ? Math.max(0, Math.round(Number(budgetLimit) - (Number.isFinite(Number(budgetUsed)) ? Number(budgetUsed) : elapsedMinutes)))
                : null,
            unscheduledCount: Array.isArray(remaining) ? remaining.length : 0,
            itinerary,
        };
    }

    compareShortestCandidates(a, b) {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;

        if (a.completedCount !== b.completedCount) {
            return b.completedCount - a.completedCount;
        }

        if (a.elapsedMinutes !== b.elapsedMinutes) {
            return a.elapsedMinutes - b.elapsedMinutes;
        }

        if (a.totalWaitMinutes !== b.totalWaitMinutes) {
            return a.totalWaitMinutes - b.totalWaitMinutes;
        }

        if (a.totalTravelMinutes !== b.totalTravelMinutes) {
            return a.totalTravelMinutes - b.totalTravelMinutes;
        }

        return a.sequenceKey.localeCompare(b.sequenceKey);
    }

    compareBudgetCandidates(a, b) {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;

        if (a.totalPriority !== b.totalPriority) {
            return b.totalPriority - a.totalPriority;
        }

        if (a.completedCount !== b.completedCount) {
            return b.completedCount - a.completedCount;
        }

        if (a.budgetUsedMinutes !== b.budgetUsedMinutes) {
            return a.budgetUsedMinutes - b.budgetUsedMinutes;
        }

        if (a.totalTravelMinutes !== b.totalTravelMinutes) {
            return a.totalTravelMinutes - b.totalTravelMinutes;
        }

        if (a.totalWaitMinutes !== b.totalWaitMinutes) {
            return a.totalWaitMinutes - b.totalWaitMinutes;
        }

        return a.sequenceKey.localeCompare(b.sequenceKey);
    }

    upsertCandidate(registry, candidate, compareCandidates, limit = 12) {
        if (!(registry instanceof Map) || !candidate || typeof compareCandidates !== 'function') {
            return;
        }

        const existing = registry.get(candidate.sequenceKey);
        if (!existing || compareCandidates(candidate, existing) < 0) {
            registry.set(candidate.sequenceKey, candidate);
        }

        const ranked = Array.from(registry.values()).sort((left, right) => compareCandidates(left, right));
        while (ranked.length > limit) {
            const removed = ranked.pop();
            if (removed) {
                registry.delete(removed.sequenceKey);
            }
        }
    }

    getAlternativeCandidates(registry, selectedSequenceKey, compareCandidates, limit = 5) {
        if (!(registry instanceof Map) || typeof compareCandidates !== 'function') {
            return [];
        }

        return Array.from(registry.values())
            .filter((candidate) => candidate.sequenceKey !== selectedSequenceKey)
            .sort((left, right) => compareCandidates(left, right))
            .slice(0, limit);
    }

    async evaluateCandidate(currentPos, currentTime, candidate) {
        this.throwIfCancelled();
        const travelTime = await this.getTravelTime(currentPos, candidate, currentTime);
        this.throwIfCancelled();
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
        this.throwIfCancelled();

        const startAnchor = this.locations[0];
        const tripStartMinutes = this.timeToMinutes(this.startTime);
        const firstDuration = this.getDuration(startAnchor);
        const initialPath = [{
            node: startAnchor,
            evaluated: {
                isValid: true,
                travelTime: 0,
                waitTime: 0,
                arrival: tripStartMinutes,
                duration: firstDuration,
                addedTime: firstDuration,
                statusReason: null,
            },
        }];

        const remaining = this.locations.slice(1);
        const compareCandidates = this.compareShortestCandidates.bind(this);
        const candidateRegistry = new Map();
        const visitedStateQuality = new Map();

        let bestState = {
            currentPos: startAnchor,
            currentTime: tripStartMinutes + firstDuration,
            remaining,
            path: initialPath,
            totalTravelMinutes: 0,
            totalWaitMinutes: 0,
            totalPriority: this.getPriority(startAnchor),
        };

        const registerState = (state) => {
            const candidate = this.buildCandidateRecord({
                mode: 'shortest-feasible',
                path: state.path,
                totalPriority: state.totalPriority,
                totalTravelMinutes: state.totalTravelMinutes,
                totalWaitMinutes: state.totalWaitMinutes,
                remaining: state.remaining,
            });

            this.upsertCandidate(candidateRegistry, candidate, compareCandidates, 12);

            const bestCandidate = this.buildCandidateRecord({
                mode: 'shortest-feasible',
                path: bestState.path,
                totalPriority: bestState.totalPriority,
                totalTravelMinutes: bestState.totalTravelMinutes,
                totalWaitMinutes: bestState.totalWaitMinutes,
                remaining: bestState.remaining,
            });

            if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
                bestState = {
                    currentPos: state.currentPos,
                    currentTime: state.currentTime,
                    remaining: [...state.remaining],
                    path: [...state.path],
                    totalTravelMinutes: state.totalTravelMinutes,
                    totalWaitMinutes: state.totalWaitMinutes,
                    totalPriority: state.totalPriority,
                };
            }
        };

        const dfs = async (state) => {
            this.throwIfCancelled();
            registerState(state);

            if (state.remaining.length === 0) {
                return;
            }

            const stateKey = `${state.currentPos?.id || 'none'}::${Math.floor(state.currentTime / 15)}::${state.remaining.map((loc) => loc.id).sort().join('|')}`;
            const stateScore = (state.path.length * 100000) - (state.totalWaitMinutes * 100) - state.totalTravelMinutes;
            const bestSeenScore = visitedStateQuality.get(stateKey);

            if (Number.isFinite(bestSeenScore) && bestSeenScore >= stateScore) {
                return;
            }

            visitedStateQuality.set(stateKey, stateScore);

            const moves = [];
            for (let index = 0; index < state.remaining.length; index++) {
                this.throwIfCancelled();
                const candidate = state.remaining[index];
                const evaluated = await this.evaluateCandidate(state.currentPos, state.currentTime, candidate);
                if (!evaluated?.isValid) continue;

                moves.push({
                    index,
                    candidate,
                    evaluated,
                    score: evaluated.travelTime + evaluated.waitTime,
                });
            }

            moves.sort((left, right) => {
                if (left.score !== right.score) return left.score - right.score;
                return left.evaluated.duration - right.evaluated.duration;
            });

            const branchLimit = Math.min(moves.length, 8);
            for (let index = 0; index < branchLimit; index++) {
                this.throwIfCancelled();
                const move = moves[index];
                const nextRemaining = [
                    ...state.remaining.slice(0, move.index),
                    ...state.remaining.slice(move.index + 1),
                ];

                await dfs({
                    currentPos: move.candidate,
                    currentTime: move.evaluated.arrival + move.evaluated.duration,
                    remaining: nextRemaining,
                    path: [...state.path, { node: move.candidate, evaluated: move.evaluated }],
                    totalTravelMinutes: state.totalTravelMinutes + move.evaluated.travelTime,
                    totalWaitMinutes: state.totalWaitMinutes + move.evaluated.waitTime,
                    totalPriority: state.totalPriority + this.getPriority(move.candidate),
                });
            }
        };

        await dfs(bestState);
        this.throwIfCancelled();

        const itinerary = this.materializePath(bestState.path);
        const scheduledIds = new Set(bestState.path.map((step) => step.node.id));
        const referenceStep = bestState.path[bestState.path.length - 1];
        const referencePos = referenceStep?.node || startAnchor;
        const referenceTime = referenceStep
            ? referenceStep.evaluated.arrival + referenceStep.evaluated.duration
            : tripStartMinutes;

        const unscheduledStops = await Promise.all(this.locations
            .filter((stop) => !scheduledIds.has(stop.id))
            .map(async (stop) => {
                this.throwIfCancelled();
                const evaluated = await this.evaluateCandidate(referencePos, referenceTime, stop);
                return {
                    ...stop,
                    statusReason: evaluated?.isValid
                        ? 'not-selected-by-feasible-search'
                        : (evaluated?.statusReason || 'opening-window-conflict'),
                };
            }));

        const selectedCandidate = this.buildCandidateRecord({
            mode: 'shortest-feasible',
            path: bestState.path,
            totalPriority: bestState.totalPriority,
            totalTravelMinutes: bestState.totalTravelMinutes,
            totalWaitMinutes: bestState.totalWaitMinutes,
            remaining: bestState.remaining,
        });

        this.lastSolveMeta = {
            mode: 'shortest-feasible',
            searchStrategy: 'depth-first-feasible-search',
            completedCount: itinerary.length,
            droppedCount: unscheduledStops.length,
            totalPriority: itinerary.reduce((sum, stop) => sum + this.getPriority(stop), 0),
            totalTravelMinutes: bestState.totalTravelMinutes,
            totalWaitMinutes: bestState.totalWaitMinutes,
            selectedCandidate,
            topCandidates: this.getAlternativeCandidates(candidateRegistry, selectedCandidate?.sequenceKey, compareCandidates, 5),
            unscheduledStops,
        };
        itinerary.unscheduledStops = unscheduledStops;

        return itinerary;
    }

    async solveMaxPriorityWithinBudget(timeBudgetMinutes = 240) {
        if (this.locations.length === 0) return [];
        this.throwIfCancelled();

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

        const compareCandidates = this.compareBudgetCandidates.bind(this);
        const candidateRegistry = new Map();

        const isBetterSolution = (candidate, incumbent) => {
            if (!incumbent) return true;
            if (candidate.totalPriority !== incumbent.totalPriority) {
                return candidate.totalPriority > incumbent.totalPriority;
            }
            if (candidate.path.length !== incumbent.path.length) {
                return candidate.path.length > incumbent.path.length;
            }
            if (candidate.budgetUsed !== incumbent.budgetUsed) {
                return candidate.budgetUsed < incumbent.budgetUsed;
            }
            if (candidate.totalTravelMinutes !== incumbent.totalTravelMinutes) {
                return candidate.totalTravelMinutes < incumbent.totalTravelMinutes;
            }
            return candidate.totalWaitMinutes < incumbent.totalWaitMinutes;
        };

        const visitedStatePriority = new Map();
        let best = null;

        const dfs = async (currentPos, currentTime, budgetUsed, totalPriority, remaining, path, totalTravelMinutes, totalWaitMinutes) => {
            this.throwIfCancelled();
            const partial = { totalPriority, budgetUsed, path, totalTravelMinutes, totalWaitMinutes };
            if (isBetterSolution(partial, best)) {
                best = {
                    totalPriority,
                    budgetUsed,
                    path: [...path],
                    currentPos,
                    currentTime,
                    remaining: [...remaining],
                    totalTravelMinutes,
                    totalWaitMinutes,
                };
            }

            this.upsertCandidate(candidateRegistry, this.buildCandidateRecord({
                mode: 'max-priority-budget',
                path,
                totalPriority,
                totalTravelMinutes,
                totalWaitMinutes,
                budgetUsed,
                budgetLimit,
                remaining,
                includeFirstLegFromStart: true,
            }), compareCandidates, 12);

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
                this.throwIfCancelled();
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
                    projectedTravelMinutes: totalTravelMinutes + evaluated.travelTime,
                    projectedWaitMinutes: totalWaitMinutes + evaluated.waitTime,
                    score,
                });
            }

            // Explore likely-strong branches first so pruning can cut more of the tree.
            moves.sort((a, b) => b.score - a.score);

            for (let i = 0; i < moves.length; i++) {
                this.throwIfCancelled();
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
                    [...path, { node: move.candidate, evaluated: move.evaluated }],
                    move.projectedTravelMinutes,
                    move.projectedWaitMinutes,
                );
            }
        };

        for (let i = 0; i < locations.length; i++) {
            this.throwIfCancelled();
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
                [{ node: first, evaluated: firstEvaluated }],
                firstEvaluated.travelTime,
                firstEvaluated.waitTime,
            );
        }
        this.throwIfCancelled();

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
                selectedCandidate: null,
                topCandidates: [],
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

        const itinerary = this.materializePath(acceptedPath, { includeFirstLegFromStart: true });

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
                this.throwIfCancelled();
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

        const selectedCandidate = this.buildCandidateRecord({
            mode: 'max-priority-budget',
            path: acceptedPath,
            totalPriority: itinerary.reduce((sum, stop) => sum + this.getPriority(stop), 0),
            totalTravelMinutes: best.totalTravelMinutes,
            totalWaitMinutes: best.totalWaitMinutes,
            budgetUsed: strictBudgetUsed,
            budgetLimit,
            remaining: unscheduledStops,
            includeFirstLegFromStart: true,
        });

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
            totalTravelMinutes: best.totalTravelMinutes,
            totalWaitMinutes: best.totalWaitMinutes,
            selectedCandidate,
            topCandidates: this.getAlternativeCandidates(candidateRegistry, selectedCandidate?.sequenceKey, compareCandidates, 5),
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
