import { clipInterval, type Interval, mergeIntervals } from './intervals.js';

export const MIN_ACTIVE_CHECKERS = 2;
export const CHECKER_STALE_MS = 2 * 60 * 1000; // matches consensus 2-minute heartbeat window

export interface HeartbeatPoint {
  checkerId: string;
  recordedAt: Date;
}

export function buildCheckerOnlineIntervals(
  checkerId: string,
  heartbeats: HeartbeatPoint[],
  windowFrom: Date,
  windowTo: Date,
): Interval[] {
  const beats = heartbeats
    .filter((h) => h.checkerId === checkerId)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  let lastBeat: Date | null = null;
  let startBeat: Date | null = null;
  const ret: Interval[] = [];
  for (const beat of beats) {
    if (!lastBeat) {
      lastBeat = beat.recordedAt;
      startBeat = beat.recordedAt;
      continue;
    }
    if (beat.recordedAt.getTime() - lastBeat.getTime() <= CHECKER_STALE_MS)
      lastBeat = beat.recordedAt;
    else {
      if (startBeat && lastBeat)
        ret.push({ start: startBeat, end: new Date(lastBeat.getTime() + CHECKER_STALE_MS) });
      startBeat = beat.recordedAt;
      lastBeat = beat.recordedAt;
    }
  }
  if (startBeat && lastBeat)
    ret.push({ start: startBeat, end: new Date(lastBeat.getTime() + CHECKER_STALE_MS) });
  return ret.map((r) => clipInterval(r, windowFrom, windowTo)).filter((r) => r !== null);
}

export function detectCoverageGaps(
  knownCheckerIds: string[],
  heartbeats: HeartbeatPoint[],
  windowFrom: Date,
  windowTo: Date,
): Interval[] {
  const intervals = knownCheckerIds.flatMap((checker) =>
    buildCheckerOnlineIntervals(checker, heartbeats, windowFrom, windowTo),
  );
  const events: { time: number; emit: number }[] = [];
  for (const i of intervals) {
    events.push({ time: i.start.getTime(), emit: 1 });
    events.push({ time: i.end.getTime(), emit: -1 });
  }
  events.sort((a, b) => a.time - b.time);
  let activeCount: number = 0;
  if (intervals.length === 0) return [{ start: windowFrom, end: windowTo }];
  let cStart: number = windowFrom.getTime();
  let i = 0;
  let t = 0;
  const ret: Interval[] = [];
  while (i < events.length) {
    const first = events[i];
    if (!first) break;
    t = first.time;

    while (i < events.length) {
      const event = events[i];
      if (!event || event.time !== t) break;
      activeCount += event.emit;
      i++;
    }
    if (activeCount < MIN_ACTIVE_CHECKERS && cStart === 0) {
      cStart = t;
    }
    if (activeCount >= MIN_ACTIVE_CHECKERS && cStart !== 0) {
      ret.push({ start: new Date(cStart), end: new Date(t) });
      cStart = 0;
    }
  }
  if (cStart !== 0) ret.push({ start: new Date(cStart), end: new Date(windowTo.getTime()) });
  return mergeIntervals(ret);
}
