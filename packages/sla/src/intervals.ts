export interface Interval {
  start: Date;
  end: Date;
}

export function clipInterval(interval: Interval, from: Date, to: Date): Interval | null {
  if (from.getTime() >= interval.end.getTime() || interval.start.getTime() >= to.getTime()) {
    return null;
  }
  return {
    start: from.getTime() > interval.start.getTime() ? from : interval.start,
    end: to.getTime() < interval.end.getTime() ? to : interval.end,
  };
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  var intervalCopy = structuredClone(intervals);
  intervalCopy.sort((a, b) => a.start.getTime() - b.start.getTime());
  var cur: Interval | null = null;
  const result: Interval[] = [];
  for (const next of intervalCopy) {
    if (!cur) {
      cur = next;
      continue;
    }
    if (next.start.getTime() <= cur.end.getTime()) {
      cur.end = cur.end.getTime() > next.end.getTime() ? cur.end : next.end;
    } else {
      result.push(cur);
      cur = next;
    }
  }
  if (cur) result.push(cur);

  return result;
}

function subtractOne(base: Interval, remove: Interval): Interval[] {
  if (
    remove.start.getTime() >= base.end.getTime() ||
    base.start.getTime() >= remove.end.getTime()
  ) {
    return [base];
  }
  const ret: Interval[] = [];
  if (base.start.getTime() < remove.start.getTime())
    ret.push({ start: base.start, end: remove.start });
  if (remove.end.getTime() < base.end.getTime()) ret.push({ start: remove.end, end: base.end });
  return ret;
}

export function subtractIntervals(base: Interval[], remove: Interval[]): Interval[] {
  const mergedRemove = mergeIntervals(remove);
  let result = [...base];
  for (const r of mergedRemove) {
    result = result.flatMap((interval) => subtractOne(interval, r));
  }
  return result;
}

export function sumDurationMs(intervals: Interval[]): number {
  let sum = 0;
  for (const interval of intervals) {
    sum += interval.end.getTime() - interval.start.getTime();
  }
  return sum;
}

export function sumDurationMinutes(intervals: Interval[]): number {
  return sumDurationMs(intervals) / 60_000;
}
