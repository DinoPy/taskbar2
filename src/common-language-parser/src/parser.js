/**
 * Natural Language Reminder Parser
 * Converts natural language text into RRule recurrence patterns
 */

import * as chrono from 'chrono-node';
import pkg from 'rrule';
const RRule = pkg.default?.RRule || pkg.RRule;

// Configuration constants
export const ZONE = 'Europe/Bucharest';
export const DEFAULT_HOUR = 9;
const WORD_NUMBER_MAP = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
};
const WORD_NUMBER_PATTERN = '(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const MONTH_MAP = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};

const MONTH_ALIAS_MAP = {
  jan: 'january',
  feb: 'february',
  mar: 'march',
  apr: 'april',
  jun: 'june',
  jul: 'july',
  aug: 'august',
  sep: 'september',
  sept: 'september',
  oct: 'october',
  nov: 'november',
  dec: 'december'
};

const OFFSET_UNIT_ORDER = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];

const ORDINAL_TOKEN_MAP = {
  first: 1,
  '1': 1,
  '1st': 1,
  second: 2,
  '2': 2,
  '2nd': 2,
  third: 3,
  '3': 3,
  '3rd': 3,
  fourth: 4,
  '4': 4,
  '4th': 4,
  fifth: 5,
  '5': 5,
  '5th': 5,
  sixth: 6,
  '6': 6,
  '6th': 6,
  seventh: 7,
  '7': 7,
  '7th': 7,
  eighth: 8,
  '8': 8,
  '8th': 8,
  ninth: 9,
  '9': 9,
  '9th': 9,
  tenth: 10,
  '10': 10,
  '10th': 10,
  eleventh: 11,
  '11': 11,
  '11th': 11,
  twelfth: 12,
  '12': 12,
  '12th': 12,
  last: -1,
  other: 2
};

const WEEKDAY_NAME_INDEX = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6
};

function normalizeWordNumber(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/^\d+$/.test(lower)) {
    return parseInt(lower, 10);
  }
  return WORD_NUMBER_MAP[lower] ?? null;
}

function resolveMonthToken(token) {
  if (!token) return null;
  const lower = token.toLowerCase();
  const canonical = MONTH_ALIAS_MAP[lower] || lower;
  return MONTH_MAP[canonical] ?? null;
}

function resolveOrdinalToken(token) {
  if (!token) return NaN;
  const lower = token.toLowerCase();
  const direct = ORDINAL_TOKEN_MAP[lower];
  if (direct != null) return direct;

  if (/(st|nd|rd|th)$/.test(lower)) {
    const stripped = lower.replace(/(st|nd|rd|th)$/, '');
    if (ORDINAL_TOKEN_MAP[stripped] != null) return ORDINAL_TOKEN_MAP[stripped];
    const numericWithSuffix = Number(stripped);
    if (!Number.isNaN(numericWithSuffix)) return numericWithSuffix;
  }

  if (WORD_NUMBER_MAP[lower] != null) return WORD_NUMBER_MAP[lower];

  const numeric = Number(lower);
  if (!Number.isNaN(numeric)) return numeric;

  return NaN;
}

function computeOrdinalWeekdayDate(year, monthNumber, weekdayIndex, ordinalValue) {
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber) || !Number.isFinite(weekdayIndex) || Number.isNaN(ordinalValue)) {
    return null;
  }
  if (ordinalValue === 0) return null;

  if (ordinalValue === -1) {
    const lastDay = new Date(year, monthNumber, 0, 0, 0, 0, 0);
    const diff = (lastDay.getDay() - weekdayIndex + 7) % 7;
    lastDay.setDate(lastDay.getDate() - diff);
    return lastDay;
  }

  const firstDay = new Date(year, monthNumber - 1, 1, 0, 0, 0, 0);
  const offset = (weekdayIndex - firstDay.getDay() + 7) % 7;
  firstDay.setDate(1 + offset + (ordinalValue - 1) * 7);
  if (firstDay.getMonth() !== monthNumber - 1) {
    return null;
  }
  return firstDay;
}

function parseOrdinalMonthPhrase(phrase, reference) {
  if (!phrase) return null;
  const lower = phrase.toLowerCase();
  const patterns = [
    /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|eleventh|11th|twelfth|12th|last)\s+([a-z]+day)\s+of\s+(?:the\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/,
    /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|eleventh|11th|twelfth|12th|last)\s+([a-z]+day)\s+in\s+(?:the\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (!match) continue;
    const ordinalValue = resolveOrdinalToken(match[1]);
    const weekdayIndex = WEEKDAY_NAME_INDEX[match[2]];
    const monthNumber = MONTH_MAP[match[3]];
    if (Number.isNaN(ordinalValue) || weekdayIndex == null || monthNumber == null) {
      continue;
    }
    const yearToken = match[4];
    const baseYear = yearToken ? parseInt(yearToken, 10) : reference.getFullYear();
    if (Number.isNaN(baseYear)) continue;

    let candidate = computeOrdinalWeekdayDate(baseYear, monthNumber, weekdayIndex, ordinalValue);
    if (!candidate) continue;

    if (!yearToken && candidate < reference) {
      candidate = computeOrdinalWeekdayDate(baseYear + 1, monthNumber, weekdayIndex, ordinalValue);
    }
    if (!candidate) continue;

    const timeInfo = extractExplicitTime(phrase);
    let hasExplicitTime = false;
    if (timeInfo) {
      if (timeInfo.type === 'time' || timeInfo.type === 'hour-only') {
        hasExplicitTime = true;
        candidate.setHours(
          timeInfo.hour ?? candidate.getHours(),
          timeInfo.minute ?? 0,
          0,
          0
        );
      } else if (timeInfo.type === 'minute-offset') {
        hasExplicitTime = true;
        candidate.setMinutes(timeInfo.minute);
        candidate.setSeconds(0, 0);
      }
    }
    return { date: candidate, hasTime: hasExplicitTime };
  }

  return null;
}

function normalizeOffsetUnit(token) {
  if (!token) return null;
  const lower = token.toLowerCase();
  if (/^mins?/.test(lower) || /^minutes?/.test(lower)) return 'minute';
  if (/^hours?/.test(lower)) return 'hour';
  if (/^days?/.test(lower)) return 'day';
  if (/^weeks?/.test(lower)) return 'week';
  if (/^months?/.test(lower)) return 'month';
  if (/^quarters?/.test(lower)) return 'quarter';
  if (/^years?/.test(lower)) return 'year';
  return null;
}

function applyTimeOffset(reference, amount, unit) {
  if (!reference || amount == null || Number.isNaN(amount)) return null;
  const date = new Date(reference.getTime());
  switch (unit) {
    case 'minute':
      date.setMinutes(date.getMinutes() + amount);
      break;
    case 'hour':
      date.setHours(date.getHours() + amount);
      break;
    case 'day':
      date.setDate(date.getDate() + amount);
      break;
    case 'week':
      date.setDate(date.getDate() + amount * 7);
      break;
    case 'month':
      date.setMonth(date.getMonth() + amount);
      break;
    case 'quarter':
      date.setMonth(date.getMonth() + amount * 3);
      break;
    case 'year':
      date.setFullYear(date.getFullYear() + amount);
      break;
    default:
      return null;
  }
  return date;
}

function extractOffsetInstruction(text) {
  if (!text) return { cleanedText: text, offsets: null };
  const lower = text.toLowerCase();
  const offsetIndex = lower.indexOf('offset');
  if (offsetIndex === -1) {
    return { cleanedText: text, offsets: null };
  }

  let cursor = offsetIndex + 'offset'.length;
  const length = text.length;
  const offsets = {};

  while (cursor < length) {
    const separatorMatch = text.slice(cursor).match(/^[\s,:-]+/);
    if (separatorMatch) {
      cursor += separatorMatch[0].length;
    }

    const segment = text.slice(cursor);
    const pairMatch = segment.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(minutes?|mins?|hours?|days?|weeks?|months?|quarters?|years?))?/i);
    if (!pairMatch) {
      break;
    }

    const amount = normalizeWordNumber(pairMatch[1]);
    const rawUnit = pairMatch[2];
    const unit = normalizeOffsetUnit(rawUnit) ?? 'minute';
    if (amount != null) {
      offsets[unit] = (offsets[unit] ?? 0) + amount;
    }

    cursor += pairMatch[0].length;
  }

  if (Object.keys(offsets).length === 0) {
    return { cleanedText: text, offsets: null };
  }

  const remaining = text.slice(cursor).trim();
  let cleaned = text.slice(0, offsetIndex).trim();
  if (remaining.length > 0) {
    cleaned = cleaned ? `${cleaned} ${remaining}` : remaining;
  }

  return { cleanedText: cleaned, offsets };
}

function getAllowedOffsetUnits(freq) {
  switch (freq) {
    case RRule.MINUTELY:
      return ['minute'];
    case RRule.HOURLY:
      return ['hour', 'minute'];
    case RRule.DAILY:
      return ['day', 'hour', 'minute'];
    case RRule.WEEKLY:
      return ['week', 'day', 'hour', 'minute'];
    case RRule.MONTHLY:
      return ['month', 'week', 'day', 'hour', 'minute', 'quarter'];
    case RRule.YEARLY:
    default:
      return ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute'];
  }
}

function applyCompositeOffsets(date, offsets, allowedUnits) {
  if (!date || !offsets || !allowedUnits || allowedUnits.length === 0) return date;
  let current = new Date(date.getTime());
  const allowedSet = new Set(allowedUnits);
  OFFSET_UNIT_ORDER.forEach((unit) => {
    if (!allowedSet.has(unit)) return;
    const value = offsets[unit];
    if (!value) return;
    const adjusted = applyTimeOffset(current, value, unit);
    if (adjusted) {
      current = adjusted;
    }
  });
  return current;
}

function preprocessEndingInstruction(text, reference = null) {
  if (!text) return { cleanedText: text, untilDate: null };

  let working = text;
  let untilDate = null;
  let isRelative = false;
  const baseReference = reference ?? new Date();

  const endingInPattern = /\bending\s+in\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minutes?|mins?|hours?|days?|weeks?|months?|quarters?|years?)(?:\s*(?:,|\.)\s*|\s+)?/i;
  const matchIn = endingInPattern.exec(working);
  if (matchIn) {
    const amount = normalizeWordNumber(matchIn[1]);
    const unit = normalizeOffsetUnit(matchIn[2]);
    if (amount != null && unit) {
      untilDate = applyTimeOffset(baseReference, amount, unit);
      if (untilDate) {
        isRelative = true;
      }
    }
    working = `${working.slice(0, matchIn.index)}${working.slice(matchIn.index + matchIn[0].length)}`.trim();
  }

  if (!untilDate) {
    const endingOnPattern = /\bending\s+on\s+([^,\.]+)(?=[,\.]|$)/i;
    const matchOn = endingOnPattern.exec(working);
    if (matchOn) {
      const phrase = matchOn[1].trim();
      if (phrase.length > 0) {
        const parsed = chrono.parse(phrase, baseReference);
        if (parsed && parsed.length > 0) {
          untilDate = parsed[0].date();
        }
      }
      working = `${working.slice(0, matchOn.index)}${working.slice(matchOn.index + matchOn[0].length)}`.trim();
    }
  }

  working = working.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim();

  return { cleanedText: working, untilDate, isRelative };
}

function preprocessStartingInstruction(text, reference = null) {
  if (!text) {
    return { cleanedText: text, reference: null, offsetDate: null, offsetUnit: null, offsetAmount: null };
  }

  const baseReference = reference ?? new Date();
  let working = text;
  let newReference = null;
  let offsetUnit = null;
  let offsetAmount = null;
  let offsetDate = null;
  let referenceHasTime = false;

  const startingInPattern =
    /^\s*starting\s+in\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minutes?|mins?|hours?|days?|weeks?|months?|quarters?|years?)(?:\s*(?:,|\.)\s*|\s+)?/i;
  const matchIn = working.match(startingInPattern);
  if (matchIn) {
    const amount = normalizeWordNumber(matchIn[1]);
    const unit = normalizeOffsetUnit(matchIn[2]);
    if (amount != null && unit) {
      const computed = applyTimeOffset(baseReference, amount, unit);
      if (computed) {
        offsetDate = computed;
        newReference = computed;
        offsetUnit = unit;
        offsetAmount = amount;
        if (unit === 'minute' || unit === 'hour') {
          referenceHasTime = true;
        }
      }
    }
    working = working.slice(matchIn[0].length);
    working = working.replace(/^(?:,|\band\b|\bthen\b|\s)+/i, '');
    working = working.trim();
  } else {
    const startingInAnywherePattern =
      /\bstarting\s+in\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minutes?|mins?|hours?|days?|weeks?|months?|quarters?|years?)(?:\s*(?:,|\.)\s*|\s+)?/i;
    const matchInAnywhere = startingInAnywherePattern.exec(working);
      if (matchInAnywhere) {
        const amount = normalizeWordNumber(matchInAnywhere[1]);
        const unit = normalizeOffsetUnit(matchInAnywhere[2]);
        if (amount != null && unit) {
          const computed = applyTimeOffset(newReference ?? baseReference, amount, unit);
          if (computed) {
            offsetDate = computed;
            newReference = computed;
            offsetUnit = unit;
            offsetAmount = amount;
            if (unit === 'minute' || unit === 'hour') {
              referenceHasTime = true;
            }
          }
        }
      const startIndex = matchInAnywhere.index;
      const endIndex = startIndex + matchInAnywhere[0].length;
      const before = working.slice(0, startIndex).replace(/\s+(?:,|\band\b|\bthen\b)\s*$/i, '').trim();
      const after = working.slice(endIndex).replace(/^(?:,|\band\b|\bthen\b|\s)+/i, '').trim();
      if (before && after) {
        working = `${before} ${after}`;
      } else if (before) {
        working = before;
      } else {
        working = after;
      }
    }
  }

  const startingOnPattern = /\bstarting\s+on\s+/i;
  const matchOn = startingOnPattern.exec(working);
  if (matchOn) {
    const baseIndex = matchOn.index;
    const afterIndex = matchOn.index + matchOn[0].length;
    const remainder = working.slice(afterIndex);
    let phrase = remainder;
    const terminator = remainder.match(/\b(every|each|ending|offset|starting|daily|weekly|monthly|yearly)\b/i);
    if (terminator && terminator.index !== undefined) {
      phrase = remainder.slice(0, terminator.index).trim();
    }
    phrase = phrase.trim();
    if (phrase.length > 0) {
      const parsed = chrono.parse(phrase, newReference ?? baseReference, { forwardDate: true });
      let startDate = null;
      if (parsed && parsed.length > 0) {
        startDate = parsed[0].date();
        if (parsed[0].start && parsed[0].start.isCertain('hour')) {
          referenceHasTime = true;
        }
      }
      const manualStart = parseOrdinalMonthPhrase(phrase, newReference ?? baseReference);
      if (manualStart) {
        startDate = manualStart.date;
        if (manualStart.hasTime) {
          referenceHasTime = true;
        }
      }
      if (startDate) {
        offsetDate = startDate;
        newReference = startDate;
        const consumedText = parsed && parsed.length > 0 ? (parsed[0].text ?? phrase) : phrase;
        const consumedLength = consumedText.length;
        const cutStart = baseIndex;
        const cutEnd = afterIndex + consumedLength;
        working = `${working.slice(0, cutStart)}${working.slice(cutEnd)}`.trim();
        working = working.replace(/\s{2,}/g, ' ');
      }
    }
  }

  return {
    cleanedText: working,
    reference: newReference,
    offsetDate,
    offsetUnit,
    offsetAmount,
    referenceHasTime
  };
}

function createSyntheticChronoResult(initialDate, certainComponents = ['year', 'month', 'day']) {
  let internal = new Date(initialDate.getTime());
  const certain = new Set(certainComponents);

  const componentHandlers = {
    year: {
      get: () => internal.getFullYear(),
      set: (value) => internal.setFullYear(value)
    },
    month: {
      get: () => internal.getMonth() + 1,
      set: (value) => internal.setMonth(value - 1)
    },
    day: {
      get: () => internal.getDate(),
      set: (value) => internal.setDate(value)
    },
    hour: {
      get: () => internal.getHours(),
      set: (value) => internal.setHours(value)
    },
    minute: {
      get: () => internal.getMinutes(),
      set: (value) => internal.setMinutes(value)
    },
    second: {
      get: () => internal.getSeconds(),
      set: (value) => internal.setSeconds(value)
    },
    millisecond: {
      get: () => internal.getMilliseconds(),
      set: (value) => internal.setMilliseconds(value)
    }
  };

  const start = {
    isCertain: (component) => certain.has(component),
    get: (component) => {
      return componentHandlers[component]?.get() ?? null;
    },
    assign: (component, value) => {
      const handler = componentHandlers[component];
      if (!handler) return;
      handler.set(value);
      certain.add(component);
    }
  };

  return {
    date: () => new Date(internal.getTime()),
    start
  };
}

function getNextOccurrenceOfDay(day, reference) {
  if (day < 1 || day > 31) return null;

  let year = reference.getFullYear();
  let month = reference.getMonth();

  const constructDate = (y, m, d) => {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    if (d > daysInMonth) return null;
    return new Date(y, m, d, 0, 0, 0, 0);
  };

  let candidate = constructDate(year, month, day);
  if (!candidate || candidate <= reference) {
    do {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      candidate = constructDate(year, month, day);
    } while (!candidate);
  }

  return candidate;
}

function parseFallbackDayOfMonth(text, reference) {
  const match = text.trim().match(/^(?:on\s+)?(?:the\s+)?(\d{1,2})(st|nd|rd|th)\b/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const next = getNextOccurrenceOfDay(day, reference);
  if (!next) return null;
  const result = createSyntheticChronoResult(next);
  const explicit = extractExplicitTime(text);
  if (explicit) {
    if (explicit.type === 'time' || explicit.type === 'hour-only') {
      result.start.assign('hour', explicit.hour);
      result.start.assign('minute', explicit.minute ?? 0);
      result.start.assign('second', 0);
      result.start.assign('millisecond', 0);
    }
    if (explicit.minuteOffset != null && explicit.type !== 'time') {
      result.start.assign('minute', explicit.minuteOffset);
      result.start.assign('second', 0);
      result.start.assign('millisecond', 0);
    }
  }

  return result;
}

function getDateInFutureMonths(reference, monthsAhead, day) {
  if (day < 1 || day > 31) return null;
  const base = new Date(reference.getTime());
  const target = new Date(base.getFullYear(), base.getMonth() + monthsAhead, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, daysInMonth);
  target.setDate(safeDay);
  target.setHours(reference.getHours(), reference.getMinutes(), reference.getSeconds(), reference.getMilliseconds());
  return target;
}

function getWeekdayInFutureWeeks(reference, weeksAhead, weekdayName) {
  const weekdayMap = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 0
  };
  const targetDay = weekdayMap[weekdayName.toLowerCase()];
  if (targetDay === undefined) return null;

  const base = new Date(reference.getTime());
  base.setDate(base.getDate() + weeksAhead * 7);

  const daysUntilTarget = (targetDay - base.getDay() + 7) % 7;
  const candidate = new Date(base.getTime());
  candidate.setDate(candidate.getDate() + daysUntilTarget);
  return candidate;
}

function parseFallbackNextMonthDay(text, reference) {
  const match = text.trim().match(/next\s+month\s+on\s+(?:the\s+)?(\d{1,2})(st|nd|rd|th)?\b/i);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const next = getDateInFutureMonths(reference, 1, day);
  if (!next) return null;
  const result = createSyntheticChronoResult(next);
  const explicit = extractExplicitTime(text);
  if (explicit) {
    if (explicit.type === 'time' || explicit.type === 'hour-only') {
      result.start.assign('hour', explicit.hour);
      result.start.assign('minute', explicit.minute ?? 0);
      result.start.assign('second', 0);
      result.start.assign('millisecond', 0);
    }
    if (explicit.minuteOffset != null && explicit.type !== 'time') {
      result.start.assign('minute', explicit.minuteOffset);
      result.start.assign('second', 0);
      result.start.assign('millisecond', 0);
    }
  }
  return result;
}

function parseFallbackNextWeekDay(text, reference) {
  const match = text
    .trim()
    .match(/next\s+week\s+on\s+(?:the\s+)?([a-z]+day)\b/i);
  if (!match) return null;

  const weekdayName = match[1];
  const next = getWeekdayInFutureWeeks(reference, 1, weekdayName);
  if (!next) return null;

  const result = createSyntheticChronoResult(next, ['year', 'month', 'day']);
  const explicit = extractExplicitTime(text);
  if (explicit) {
    if (explicit.type === 'time' || explicit.type === 'hour-only') {
      result.start.assign('hour', explicit.hour);
      result.start.assign('minute', explicit.minute ?? 0);
      result.start.assign('second', 0);
      result.start.assign('millisecond', 0);
    }
    if (explicit.minuteOffset != null && explicit.type !== 'time') {
      result.start.assign('minute', explicit.minuteOffset);
      result.start.assign('second', 0);
      result.start.assign('millisecond', 0);
    }
  }
  return result;
}

function formatRuleText(rule, start) {
  if (!rule) return '';
  try {
    const options = { ...rule.options };
    if (start) {
      options.dtstart = start;
      const freqOption = rule.options.freq;

      if (Array.isArray(rule.options.byhour)) {
        const baseHour = rule.options.byhour[0];
        const offset = start.getHours() - baseHour;
        options.byhour = rule.options.byhour.map((hour) => {
          let adjusted = hour + offset;
          adjusted %= 24;
          if (adjusted < 0) adjusted += 24;
          return adjusted;
        });
      } else if (freqOption !== RRule.HOURLY && freqOption !== RRule.MINUTELY) {
        options.byhour = [start.getHours()];
      }

      if (Array.isArray(rule.options.byminute)) {
        const baseMinute = rule.options.byminute[0];
        const offsetMinute = start.getMinutes() - baseMinute;
        options.byminute = rule.options.byminute.map((minute) => {
          let adjusted = minute + offsetMinute;
          adjusted %= 60;
          if (adjusted < 0) adjusted += 60;
          return adjusted;
        });
      } else if (freqOption !== RRule.MINUTELY) {
        options.byminute = [start.getMinutes()];
      }
    }
    const displayRule = new RRule(options);
    return displayRule.toText();
  } catch (error) {
    console.warn(`Warning: Failed to format rule text: ${error.message}`);
    return rule.toText();
  }
}

function createResult(rule, start) {
  return {
    rule,
    start,
    text: formatRuleText(rule, start)
  };
}

/**
 * Extract explicit time from text when Chrono does not capture it
 * Supports 24-hour format (e.g., 13:30) and basic 12-hour with am/pm
 * @param {string} text
 * @returns {{hour:number, minute:number}|null}
 */
function extractExplicitTime(text) {
  if (!text) return null;

  let hour = null;
  let minute = null;
  let type = null;

  const colonMatch = text.match(/\b(\d{1,2})[:]([0-5]\d)\b/);
  if (colonMatch) {
    const parsedHour = parseInt(colonMatch[1], 10);
    const parsedMinute = parseInt(colonMatch[2], 10);
    if (parsedHour >= 0 && parsedHour <= 23) {
      hour = parsedHour;
      minute = parsedMinute;
      type = 'time';
    }
  }

  if (!type) {
    const ampmMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (ampmMatch) {
      let parsedHour = parseInt(ampmMatch[1], 10);
      const parsedMinute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
      const modifier = ampmMatch[3].toLowerCase();
      if (parsedHour >= 1 && parsedHour <= 12 && parsedMinute >= 0 && parsedMinute <= 59) {
        if (modifier === 'pm' && parsedHour !== 12) parsedHour += 12;
        if (modifier === 'am' && parsedHour === 12) parsedHour = 0;
        hour = parsedHour;
        minute = parsedMinute;
        type = 'time';
      }
    }
  }

  let minuteOffset = null;
  const offsetMatch = text.match(/\boffset\s+(\d{1,2})(?:\s*(?:minutes?|mins?))?\b/i);
  if (offsetMatch) {
    const parsed = parseInt(offsetMatch[1], 10);
    if (parsed >= 0 && parsed < 60) {
      minuteOffset = parsed;
    }
  }

  if (!type) {
    const simpleMatch = text.match(/\bat\s+(\d{1,2})\b/i);
    if (simpleMatch) {
      const value = parseInt(simpleMatch[1], 10);
      if (!Number.isNaN(value) && value >= 0 && value <= 23) {
        hour = value;
        minute = 0;
        type = 'hour-only';
      }
    }
  }

  if (!type && minuteOffset != null) {
    minute = minuteOffset;
    type = 'minute-offset';
  }

  if (!type) return null;

  const result = { type };
  if (hour != null) result.hour = hour;
  if (minute != null) result.minute = minute;
  if (minuteOffset != null) result.minuteOffset = minuteOffset;
  return result;
}

/**
 * Parse natural language text using Chrono
 * @param {string} text - The text to parse
 * @param {Date} reference - Reference date for parsing
 * @returns {Object|null} Chrono parse result or null
 */
export function parseChrono(text, reference) {
  const startingInfo = preprocessStartingInstruction(text, reference);
  let workingText = startingInfo.cleanedText ?? text;
  const effectiveReference = startingInfo.reference ?? reference;

  const offsetInfo = extractOffsetInstruction(workingText);
  if (offsetInfo.offsets && offsetInfo.cleanedText != null) {
    workingText = offsetInfo.cleanedText;
  }

  const endingInfo = preprocessEndingInstruction(workingText, effectiveReference);
  if (endingInfo.cleanedText != null) {
    workingText = endingInfo.cleanedText;
  }

  const directFallback =
    parseFallbackNextYearMonthDay(workingText, effectiveReference) ||
    parseFallbackNextWeekDay(workingText, effectiveReference) ||
    parseFallbackNextMonthDay(workingText, effectiveReference);
  if (directFallback) return directFallback;

  const [result] = chrono.parse(workingText, effectiveReference);
  if (result) return result;

  const fallback =
    parseFallbackDayOfMonth(workingText, effectiveReference);
  return fallback;
}

/**
 * Ensure default time is set if no explicit time was parsed
 * @param {Object} result - Chrono parse result
 */
export function ensureDefaultTime(result) {
  if (!result.start.isCertain('hour')) {
    result.start.assign('hour', DEFAULT_HOUR);
    result.start.assign('minute', 0);
    result.start.assign('second', 0);
    result.start.assign('millisecond', 0);
  }
}

/**
 * Check if text appears to describe a recurring pattern
 * @param {string} text - Text to analyze
 * @returns {boolean} True if text looks recurring
 */
export function isRecurring(text) {
  const startingInfo = preprocessStartingInstruction(text);
  const targetText = startingInfo.cleanedText ?? text;
  const offsetInfo = extractOffsetInstruction(targetText);
  let workingText = offsetInfo.cleanedText ?? targetText;
  const endingInfo = preprocessEndingInstruction(workingText);
  if (endingInfo.cleanedText != null) {
    workingText = endingInfo.cleanedText;
  }
  const lower = workingText.toLowerCase();
  const weekdayMatches = lower.match(/\b(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)s?\b/g);
  if (weekdayMatches && weekdayMatches.length >= 2) {
    return true;
  }

  return /\b(every|each|weekly|daily|monthly|annually|yearly|hourly|minutely|bi[-\s]?weekly|biweekly|fortnight|fortnightly|second|2nd|third|3rd|fourth|4th|other|per|week\s*day|week\s*end|week\s*days|week\s*ends|quarterly|semi[-\s]?annually)\b/i.test(
    workingText
  ) || /\b(every\s+month|monthly)\s+on\s+(the\s+)?(\d{1,2})(st|nd|rd|th)?\s*(day)?\b/i.test(workingText) || /\b(\d{1,2})(st|nd|rd|th)?\s+(of\s+(each|every)\s+month|monthly)\b/i.test(workingText) || /\bevery\s+\d+\s+days?\b/i.test(workingText) || /\bevery\s+\d+\s+weeks?\b/i.test(workingText) || /\bevery\s+\d+\s+months?\b/i.test(workingText) || /\bevery\s+\d+\s+years?\b/i.test(workingText) || /\bday\s+by\s+day\b/i.test(workingText) || /\bweek\s+by\s+week\b/i.test(workingText) || /\bmonth\s+by\s+month\b/i.test(workingText) || /\byear\s+by\s+year\b/i.test(workingText) || /\bmonday\s+to\s+friday\b/i.test(workingText) || /\bmon\s*-\s*fri\b/i.test(workingText) || /\bsaturday\s+sunday\b/i.test(workingText);
}

/**
 * Infer interval from text patterns
 * @param {string} lower - Lowercase text
 * @param {Object} ORD - Ordinal number mapping
 * @returns {number} Interval value
 */
function inferInterval(lower, ORD) {
  // Biweekly patterns
  if (/\bbi[-\s]?weekly\b|\bfortnight(ly)?\b/.test(lower) || /\bevery\s+other\s+week\b/.test(lower)) return 2;
  
  // Daily intervals
  if (/\bevery\s+other\s+day\b/.test(lower)) return 2;
  if (/\bevery\s+second\s+day\b/.test(lower)) return 2;
  if (/\bevery\s+third\s+day\b/.test(lower)) return 3;
  if (/\bevery\s+fourth\s+day\b/.test(lower)) return 4;
  if (/\bevery\s+fifth\s+day\b/.test(lower)) return 5;
  if (/\bevery\s+sixth\s+day\b/.test(lower)) return 6;
  if (/\bevery\s+seventh\s+day\b/.test(lower)) return 7;
  
  // Numeric daily intervals like "every 3 days", "every 5 days"
  const dailyMatch = lower.match(/\bevery\s+(\d+)\s+days?\b/);
  if (dailyMatch) {
    return parseInt(dailyMatch[1]);
  }
  const dailyWordMatch = lower.match(/\bevery\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+days?\b/);
  if (dailyWordMatch) {
    return WORD_NUMBER_MAP[dailyWordMatch[1]] || 1;
  }
  
  // Hourly intervals
  if (/\bevery\s+other\s+hour\b/.test(lower)) return 2;
  if (/\bevery\s+second\s+hour\b/.test(lower)) return 2;
  if (/\bevery\s+third\s+hour\b/.test(lower)) return 3;
  if (/\bevery\s+fourth\s+hour\b/.test(lower)) return 4;
  if (/\bevery\s+fifth\s+hour\b/.test(lower)) return 5;
  const hourlyMatch = lower.match(/\bevery\s+(\d+)\s+hours?\b/);
  if (hourlyMatch) {
    return parseInt(hourlyMatch[1]);
  }
  const hourlyWordMatch = lower.match(/\bevery\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+hours?\b/);
  if (hourlyWordMatch) {
    return WORD_NUMBER_MAP[hourlyWordMatch[1]] || 1;
  }

  // Minutely intervals
  if (/\bevery\s+other\s+minute\b/.test(lower)) return 2;
  if (/\bevery\s+second\s+minute\b/.test(lower)) return 2;
  if (/\bevery\s+third\s+minute\b/.test(lower)) return 3;
  if (/\bevery\s+fourth\s+minute\b/.test(lower)) return 4;
  if (/\bevery\s+fifth\s+minute\b/.test(lower)) return 5;
  const minutelyMatch = lower.match(/\bevery\s+(\d+)\s+minutes?\b/);
  if (minutelyMatch) {
    return parseInt(minutelyMatch[1]);
  }
  const minutelyWordMatch = lower.match(/\bevery\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+minutes?\b/);
  if (minutelyWordMatch) {
    return WORD_NUMBER_MAP[minutelyWordMatch[1]] || 1;
  }

  // Weekly intervals
  if (/\bevery\s+other\s+week\b/.test(lower)) return 2;
  if (/\bevery\s+second\s+week\b/.test(lower)) return 2;
  if (/\bevery\s+third\s+week\b/.test(lower)) return 3;
  if (/\bevery\s+fourth\s+week\b/.test(lower)) return 4;
  if (/\bevery\s+fifth\s+week\b/.test(lower)) return 5;
  if (/\bevery\s+sixth\s+week\b/.test(lower)) return 6;
  if (/\bevery\s+seventh\s+week\b/.test(lower)) return 7;
  
  const weekMatch = lower.match(/\bevery\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last|other|[0-9]+(st|nd|rd|th)?)\s+week(s)?\b/);
  if (weekMatch) {
    const key = weekMatch[1];
    if (!isNaN(Number(key))) return Number(key);
    if (/^[0-9]+(st|nd|rd|th)$/.test(key)) return Number(key.replace(/(st|nd|rd|th)$/,''));
    return ORD[key] || 1;
  }
  
  // Numeric weekly intervals like "every 3 weeks", "every 5 weeks"
  const weeklyMatch = lower.match(/\bevery\s+(\d+)\s+weeks?\b/);
  if (weeklyMatch) {
    return parseInt(weeklyMatch[1]);
  }
  const weeklyWordMatch = lower.match(/\bevery\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+weeks?\b/);
  if (weeklyWordMatch) {
    return WORD_NUMBER_MAP[weeklyWordMatch[1]] || 1;
  }
  
  // Monthly intervals (check FIRST to avoid conflicts with yearly patterns)
  if (/\bevery\s+other\s+month\b/.test(lower)) return 2;
  if (/\bevery\s+second\s+month\b/.test(lower)) return 2;
  if (/\bevery\s+third\s+month\b/.test(lower)) return 3;
  if (/\bevery\s+quarter\b/.test(lower)) return 3;
  if (/\bquarterly\b/.test(lower)) return 3;
  if (/\bevery\s+sixth\s+month\b/.test(lower)) return 6;
  if (/\bsemi[-\s]?annually\b/.test(lower)) return 6;
  
  // Numeric monthly intervals like "every 3 months", "every 6 months"
  const monthlyMatch = lower.match(/\bevery\s+(\d+)\s+months?\b/);
  if (monthlyMatch) {
    return parseInt(monthlyMatch[1]);
  }
  const monthlyWordMatch = lower.match(/\bevery\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?\b/);
  if (monthlyWordMatch) {
    return WORD_NUMBER_MAP[monthlyWordMatch[1]] || 1;
  }
  
  // Yearly intervals (check AFTER monthly patterns to avoid conflicts)
  if (/\bevery\s+other\s+year\b/.test(lower)) return 2;
  if (/\bevery\s+second\s+year\b/.test(lower)) return 2;
  if (/\bevery\s+third\s+year\b/.test(lower)) return 3;
  if (/\bevery\s+fourth\s+year\b/.test(lower)) return 4;
  if (/\bevery\s+fifth\s+year\b/.test(lower)) return 5;
  
  // Numeric yearly intervals like "every 2 years", "every 3 years", "every 5 years"
  const yearlyMatch = lower.match(/\bevery\s+(\d+)\s+years?\b/);
  if (yearlyMatch) {
    return parseInt(yearlyMatch[1]);
  }
  const yearlyWordMatch = lower.match(/\bevery\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+years?\b/);
  if (yearlyWordMatch) {
    return WORD_NUMBER_MAP[yearlyWordMatch[1]] || 1;
  }
  
  return 1;
}

/**
 * Infer frequency from text patterns
 * @param {string} lower - Lowercase text
 * @param {number} hasWeekday - Number of weekdays found
 * @param {Object} RRule - RRule constants
 * @returns {number|null} RRule frequency constant or null
 */
function inferFrequency(lower, hasWeekday, RRule) {
  // Daily patterns - improved to catch more variations
  if (/\bdaily\b/.test(lower)) return RRule.DAILY;
  if (/\bevery\s+day\b/.test(lower)) return RRule.DAILY;
  if (/\beach\s+day\b/.test(lower)) return RRule.DAILY;
  if (/\bper\s+day\b/.test(lower)) return RRule.DAILY;
  if (/\bday\s+by\s+day\b/.test(lower)) return RRule.DAILY;
  
  // Daily interval patterns
  if (/\bevery\s+other\s+day\b/.test(lower)) return RRule.DAILY;
  if (/\bevery\s+second\s+day\b/.test(lower)) return RRule.DAILY;
  if (/\bevery\s+(third|fourth|fifth|sixth|seventh)\s+day\b/.test(lower)) return RRule.DAILY;
  
  // Numeric daily patterns like "every 2 days", "every 3 days", "every 5 days"
  if (/\bevery\s+\d+\s+days?\b/.test(lower)) return RRule.DAILY;
  if (new RegExp(`\\bevery\\s+${WORD_NUMBER_PATTERN}\\s+days?\\b`).test(lower)) return RRule.DAILY;

  // Hourly patterns
  if (/\bhourly\b/.test(lower)) return RRule.HOURLY;
  if (/\bevery\s+hour\b/.test(lower)) return RRule.HOURLY;
  if (/\beach\s+hour\b/.test(lower)) return RRule.HOURLY;
  if (/\bper\s+hour\b/.test(lower)) return RRule.HOURLY;
  if (/\bhour\s+by\s+hour\b/.test(lower)) return RRule.HOURLY;
  if (/\bevery\s+other\s+hour\b/.test(lower)) return RRule.HOURLY;
  if (/\bevery\s+second\s+hour\b/.test(lower)) return RRule.HOURLY;
  if (/\bevery\s+\d+\s+hours?\b/.test(lower)) return RRule.HOURLY;
  if (new RegExp(`\\bevery\\s+${WORD_NUMBER_PATTERN}\\s+hours?\\b`).test(lower)) return RRule.HOURLY;

  // Minutely patterns
  if (/\bminutely\b/.test(lower)) return RRule.MINUTELY;
  if (/\bevery\s+minute\b/.test(lower)) return RRule.MINUTELY;
  if (/\beach\s+minute\b/.test(lower)) return RRule.MINUTELY;
  if (/\bper\s+minute\b/.test(lower)) return RRule.MINUTELY;
  if (/\bminute\s+by\s+minute\b/.test(lower)) return RRule.MINUTELY;
  if (/\bevery\s+other\s+minute\b/.test(lower)) return RRule.MINUTELY;
  if (/\bevery\s+second\s+minute\b/.test(lower)) return RRule.MINUTELY;
  if (/\bevery\s+\d+\s+minutes?\b/.test(lower)) return RRule.MINUTELY;
  if (new RegExp(`\\bevery\\s+${WORD_NUMBER_PATTERN}\\s+minutes?\\b`).test(lower)) return RRule.MINUTELY;
  
  // Monthly patterns - improved to catch more variations
  if (/\bmonthly\b/.test(lower)) return RRule.MONTHLY;
  if (/\bevery\s+month\b/.test(lower)) return RRule.MONTHLY;
  if (/\beach\s+month\b/.test(lower)) return RRule.MONTHLY;
  if (/\bper\s+month\b/.test(lower)) return RRule.MONTHLY;
  if (/\bmonth\s+by\s+month\b/.test(lower)) return RRule.MONTHLY;
  
  // Day-of-month patterns
  if (/\b(every\s+month|monthly)\s+on\s+(the\s+)?(\d{1,2})(st|nd|rd|th)?\s*(day)?\b/.test(lower)) return RRule.MONTHLY;
  if (/\b(\d{1,2})(st|nd|rd|th)?\s+(of\s+(each|every)\s+month|monthly)\b/.test(lower)) return RRule.MONTHLY;
  
  // Yearly interval patterns (check FIRST to avoid conflicts with monthly patterns)
  if (/\bevery\s+other\s+year\b/.test(lower)) return RRule.YEARLY;
  if (/\bevery\s+second\s+year\b/.test(lower)) return RRule.YEARLY;
  if (/\bevery\s+third\s+year\b/.test(lower)) return RRule.YEARLY;
  if (/\bevery\s+fourth\s+year\b/.test(lower)) return RRule.YEARLY;
  if (/\bevery\s+fifth\s+year\b/.test(lower)) return RRule.YEARLY;
  
  // Numeric yearly patterns like "every 2 years", "every 3 years", "every 5 years"
  if (/\bevery\s+\d+\s+years?\b/.test(lower)) return RRule.YEARLY;
  if (new RegExp(`\\bevery\\s+${WORD_NUMBER_PATTERN}\\s+years?\\b`).test(lower)) return RRule.YEARLY;
  
  // Monthly interval patterns (check AFTER yearly patterns to avoid conflicts)
  if (/\bevery\s+other\s+month\b/.test(lower)) return RRule.MONTHLY;
  if (/\bevery\s+second\s+month\b/.test(lower)) return RRule.MONTHLY;
  if (/\bevery\s+third\s+month\b/.test(lower)) return RRule.MONTHLY;
  if (/\bevery\s+quarter\b/.test(lower)) return RRule.MONTHLY;
  if (/\bquarterly\b/.test(lower)) return RRule.MONTHLY;
  if (/\bevery\s+sixth\s+month\b/.test(lower)) return RRule.MONTHLY;
  if (/\bsemi[-\s]?annually\b/.test(lower)) return RRule.MONTHLY;
  
  // Numeric monthly patterns like "every 3 months", "every 6 months"
  if (/\bevery\s+\d+\s+months?\b/.test(lower)) return RRule.MONTHLY;
  if (new RegExp(`\\bevery\\s+${WORD_NUMBER_PATTERN}\\s+months?\\b`).test(lower)) return RRule.MONTHLY;
  
  // Basic yearly patterns (check AFTER interval patterns to avoid conflicts)
  if (/\b(yearly|annually|every\s*year|each\s*year|per\s*year|year\s*by\s*year)\b/.test(lower)) return RRule.YEARLY;
  if (/\bevery\s+year\s+on\b/.test(lower)) return RRule.YEARLY;
  if (/\bevery\s+year\s+on\s+[a-z]+\s+\d+/.test(lower)) return RRule.YEARLY;
  
  // Weekly patterns - improved to catch more variations
  if (/\bweekly\b/.test(lower)) return RRule.WEEKLY;
  if (/\bevery\s+week\b/.test(lower)) return RRule.WEEKLY;
  if (/\beach\s+week\b/.test(lower)) return RRule.WEEKLY;
  if (/\bper\s+week\b/.test(lower)) return RRule.WEEKLY;
  if (/\bweek\s+by\s+week\b/.test(lower)) return RRule.WEEKLY;
  
  // Biweekly patterns
  if (/\bbi[-\s]?weekly\b/.test(lower)) return RRule.WEEKLY;
  if (/\bbiweekly\b/.test(lower)) return RRule.WEEKLY;
  if (/\bfortnight(ly)?\b/.test(lower)) return RRule.WEEKLY;
  if (/\bevery\s+other\s+week\b/.test(lower)) return RRule.WEEKLY;
  
  // Weekly interval patterns
  if (/\bevery\s+second\s+week\b/.test(lower)) return RRule.WEEKLY;
  if (/\bevery\s+(third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+week\b/.test(lower)) return RRule.WEEKLY;
  
  // Numeric weekly patterns like "every 2 weeks", "every 3 weeks", "every 5 weeks"
  if (/\bevery\s+\d+\s+weeks?\b/.test(lower)) return RRule.WEEKLY;
  if (new RegExp(`\\bevery\\s+${WORD_NUMBER_PATTERN}\\s+weeks?\\b`).test(lower)) return RRule.WEEKLY;
  
  
  // Weekday patterns (implicit weekly)
  if (hasWeekday) return RRule.WEEKLY;
  
  // Special weekday patterns
  if (/\bweekday(s)?\b/.test(lower)) return RRule.WEEKLY;
  if (/\bweekend(s)?\b/.test(lower)) return RRule.WEEKLY;
  
  return null;
}

/**
 * Align start date with specified hour and minute
 * @param {Date} date - Date to align
 * @param {number} hour - Target hour
 * @param {number} minute - Target minute
 * @returns {Date} Aligned date
 */
function alignStart(date, hour, minute) {
  const copy = new Date(date.getTime());
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

/**
 * Ensure date is in the future
 * @param {Date} date - Date to check
 * @param {Date} now - Current date
 * @returns {Date} Future date
 */
function ensureFutureDate(date, now, freq = null, interval = 1) {
  if (!date) return date;
  const candidate = new Date(date.getTime());
  if (candidate >= now) return candidate;

  const step = () => {
    if (freq === RRule.MINUTELY) {
      candidate.setMinutes(candidate.getMinutes() + interval);
    } else if (freq === RRule.HOURLY) {
      candidate.setHours(candidate.getHours() + interval);
    } else if (freq === RRule.WEEKLY) {
      candidate.setDate(candidate.getDate() + interval * 7);
    } else if (freq === RRule.MONTHLY) {
      candidate.setMonth(candidate.getMonth() + interval);
    } else if (freq === RRule.YEARLY) {
      candidate.setFullYear(candidate.getFullYear() + interval);
    } else {
      candidate.setDate(candidate.getDate() + interval);
    }
  };

  let safety = 0;
  while (candidate <= now && safety < 1000) {
    step();
    safety += 1;
  }
  return candidate;
}

/**
 * Get next occurrence of a specific weekday
 * @param {string} weekdayName - Name of weekday
 * @param {Date} now - Current date
 * @returns {Date|null} Next occurrence or null
 */
export function getNextWeekday(weekdayName, now) {
  const weekdayMap = {
    'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 
    'friday': 5, 'saturday': 6, 'sunday': 0
  };
  
  const targetDay = weekdayMap[weekdayName.toLowerCase()];
  if (targetDay === undefined) return null;
  
  const currentDay = now.getDay();
  const daysUntilTarget = (targetDay - currentDay + 7) % 7;
  const daysToAdd = daysUntilTarget === 0 ? 7 : daysUntilTarget; // If today is the target day, go to next week
  
  const nextDate = new Date(now.getTime());
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  return nextDate;
}

/**
 * Build RRule from natural language text (V4 - most comprehensive version)
 * @param {string} text - Natural language text
 * @param {Date} now - Reference date
 * @param {Object|null} chronoResult - Pre-parsed chrono result
 * @returns {Object|null} Object with rule and start date, or null
 */
export function buildRRuleFromV4(text, now, chronoResult) {
  const startingInfo = preprocessStartingInstruction(text, now);
  const effectiveNow = startingInfo.reference ?? now;
  let processedText = (startingInfo.cleanedText ?? text) || '';
  const offsetInfo = extractOffsetInstruction(processedText);
  const offsetComponents = offsetInfo.offsets;
  if (offsetInfo.cleanedText != null) {
    processedText = offsetInfo.cleanedText;
  }
  const endingInfo = preprocessEndingInstruction(processedText, effectiveNow);
  const untilRaw = endingInfo.untilDate ? new Date(endingInfo.untilDate.getTime()) : null;
  const isRelativeUntil = endingInfo.isRelative === true;
  if (endingInfo.cleanedText != null) {
    processedText = endingInfo.cleanedText;
  }
  const lower = processedText.toLowerCase();
  const monthRegex = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/g;
  const monthTokens = [];
  let monthMatch;
  while ((monthMatch = monthRegex.exec(lower)) !== null) {
    const num = resolveMonthToken(monthMatch[1]);
    if (num != null) monthTokens.push(num);
  }
  let until = untilRaw;

  const ORD = {
    first: 1,
    1: 1,
    '1st': 1,
    second: 2,
    2: 2,
    '2nd': 2,
  third: 3,
  3: 3,
  '3rd': 3,
  fourth: 4,
  4: 4,
  '4th': 4,
  fifth: 5,
  5: 5,
  '5th': 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  last: -1,
  other: 2
};
  const WK = [
    { rx: /\bmon(day)?s?\b/, val: 'MO' },
    { rx: /\btue(s(day)?)?\b/, val: 'TU' },
    { rx: /\bwed(nesday)?s?\b/, val: 'WE' },
    { rx: /\bthu(rs(day)?)?\b/, val: 'TH' },
    { rx: /\bfri(day)?s?\b/, val: 'FR' },
    { rx: /\bsat(urday)?s?\b/, val: 'SA' },
    { rx: /\bsun(day)?s?\b/, val: 'SU' }
  ];
  const WEEKDAY_NAME_MAP = {
    monday: 'MO',
    tuesday: 'TU',
    wednesday: 'WE',
    thursday: 'TH',
    friday: 'FR',
    saturday: 'SA',
    sunday: 'SU'
  };

  const ordinalToNumber = (token) => {
    if (!token) return NaN;
    let normalized = token;
    if (/(st|nd|rd|th)$/.test(normalized)) {
      const stripped = normalized.replace(/(st|nd|rd|th)$/, '');
      const parsed = Number(stripped);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
      normalized = stripped;
    }
    const numeric = Number(normalized);
    if (!Number.isNaN(numeric)) return numeric;
    if (ORD[normalized] != null) return ORD[normalized];
    if (ORD[token] != null) return ORD[token];
    if (WORD_NUMBER_MAP[normalized] != null) return WORD_NUMBER_MAP[normalized];
    if (WORD_NUMBER_MAP[token] != null) return WORD_NUMBER_MAP[token];
    return NaN;
  };

  let foundDays = WK.filter((w) => w.rx.test(lower)).map((w) => RRule[w.val]);

  let interval = inferInterval(lower, ORD);

  let freq = inferFrequency(lower, foundDays.length, RRule);
  let bysetpos = null;
  let monthlyOrdinal = false;
  let bymonth = null;
  let bymonthday = null;

  const quarterFirstMonthMatch = lower.match(/\b(?:every\s+quarter|quarterly)\s+on\s+(?:the\s+)?(\d{1,2})(st|nd|rd|th)?\s+of\s+(?:the\s+)?first\s+month\b/);
  if (quarterFirstMonthMatch) {
    const day = parseInt(quarterFirstMonthMatch[1], 10);
    if (!Number.isNaN(day) && day >= 1 && day <= 31) {
      bymonthday = [day];
      bymonth = [1, 4, 7, 10];
      freq = RRule.YEARLY;
      interval = 1;
    }
  }

  const quarterFirstMonthAltMatch = lower.match(/\b(?:every\s+quarter|quarterly)\s+on\s+(?:the\s+)?first\s+month\s+on\s+(?:the\s+)?(\d{1,2})(st|nd|rd|th)?\b/);
  if (quarterFirstMonthAltMatch) {
    const day = parseInt(quarterFirstMonthAltMatch[1], 10);
    if (!Number.isNaN(day) && day >= 1 && day <= 31) {
      bymonthday = [day];
      bymonth = [1, 4, 7, 10];
      freq = RRule.YEARLY;
      interval = 1;
    }
  }

  const quarterFirstMonthOrdinalMatch = lower.match(/\b(?:every\s+quarter|quarterly)\s+on\s+(?:the\s+)?first\s+month\s+on\s+(?:the\s+)?(first|second|third|fourth|fifth|last|\d+(?:st|nd|rd|th)?)\s+([a-z]+day)\b/);
  if (quarterFirstMonthOrdinalMatch) {
    let ordinalValue = ordinalToNumber(quarterFirstMonthOrdinalMatch[1]);
    if (Number.isNaN(ordinalValue) || ordinalValue === 0) ordinalValue = 1;
    const weekdayToken = WEEKDAY_NAME_MAP[quarterFirstMonthOrdinalMatch[2]];
    if (weekdayToken) {
      bysetpos = ordinalValue;
      bymonth = [1, 4, 7, 10];
      foundDays = [RRule[weekdayToken]];
      freq = RRule.YEARLY;
      interval = 1;
    }
  }


  const ordWdMonth = lower.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|last|other)\s+([a-z]+day)\s+(of\s+(each|every)\s+month|monthly)\b/);
  if (ordWdMonth) {
    bysetpos = ORD[ordWdMonth[1]];
    monthlyOrdinal = true;
    freq = RRule.MONTHLY;
  }

  const weekOfMonth = lower.match(/\bevery\s+(first|second|2nd|third|3rd|fourth|4th|last|other)\s+week\s+of\s+(each|every)\s+month\b/);
  if (weekOfMonth) {
    bysetpos = ORD[weekOfMonth[1]] ?? 1;
    monthlyOrdinal = true;
    freq = RRule.MONTHLY;
  }

  // Handle day-of-month patterns like "every month on 15th day" or "monthly on the 15th"
  if (!bymonthday) {
    const beforeLastDayPatterns = [
      new RegExp(`\\b(?:every|each)\\s+month\\s+(?:on\\s+)?(?:the\\s+)?(${WORD_NUMBER_PATTERN}|\\d+)\\s+days?\\s+before\\s+(?:the\\s+)?last\\s+day(?:\\s+of\\s+(?:the\\s+)?month)?\\b`),
      new RegExp(`\\b(${WORD_NUMBER_PATTERN}|\\d+)\\s+days?\\s+before\\s+(?:the\\s+)?last\\s+day\\s+(?:of\\s+(?:each|every)\\s+month|monthly)\\b`)
    ];
    let beforeLastMatch = null;
    for (const pattern of beforeLastDayPatterns) {
      const match = lower.match(pattern);
      if (match) {
        beforeLastMatch = match;
        break;
      }
    }
    if (beforeLastMatch) {
      const token = beforeLastMatch.slice(1).find((group) => group != null);
      if (token) {
        const normalizedToken = token.trim().toLowerCase();
        let offsetValue = null;
        if (/^\d+$/.test(normalizedToken)) {
          offsetValue = parseInt(normalizedToken, 10);
        } else if (WORD_NUMBER_MAP[normalizedToken] != null) {
          offsetValue = WORD_NUMBER_MAP[normalizedToken];
        }
        if (offsetValue != null && offsetValue >= 0) {
          const calculated = -(offsetValue + 1);
          bymonthday = [calculated];
          freq = RRule.MONTHLY;
        }
      }
    } else {
      const lastDayPatterns = [
        /\b(?:every|each)\s+month\s+(?:on\s+)?(?:the\s+)?last\s+day(?:\s+of\s+(?:the\s+)?month)?\b/,
        /\b(?:on\s+)?(?:the\s+)?last\s+day\s+(?:of\s+(?:each|every)\s+month|monthly)\b/,
        /\bmonthly\s+last\s+day\b/,
        /\bmonthly\s+on\s+(?:the\s+)?last\s+day\b/
      ];
      if (lastDayPatterns.some((pattern) => pattern.test(lower))) {
        bymonthday = [-1];
        freq = RRule.MONTHLY;
      }
    }
  }
  if (bymonthday == null) {
    const dayOfMonthMatch = lower.match(/\b(every\s+(?:month|quarter)|monthly)\s+on\s+(the\s+)?(\d{1,2})(st|nd|rd|th)?\s*(day)?\b/);
    if (dayOfMonthMatch) {
      bymonthday = [parseInt(dayOfMonthMatch[3])];
      freq = RRule.MONTHLY;
    } else {
      // Also handle patterns like "15th of each month" or "on the 15th monthly"
      const dayOfMonthMatch2 = lower.match(/\b(\d{1,2})(st|nd|rd|th)?\s+(of\s+(each|every)\s+(month|quarter)|monthly)\b/);
      if (dayOfMonthMatch2) {
        bymonthday = [parseInt(dayOfMonthMatch2[1])];
        freq = RRule.MONTHLY;
      } else {
        // Handle simple patterns like "monthly on 15th" or "every month on the 15th"
        const dayOfMonthMatch3 = lower.match(/\b(every\s+(?:month|quarter)|monthly)\s+on\s+(the\s+)?(\d{1,2})(st|nd|rd|th)?\b/);
        if (dayOfMonthMatch3) {
          bymonthday = [parseInt(dayOfMonthMatch3[3])];
          freq = RRule.MONTHLY;
        }
      }
    }
  }

  // Handle complex patterns like "every 3 weeks on monday" or "every third month on second week Wednesday"
  const weeklyWithWeekdayMatch = lower.match(new RegExp(`\\bevery\\s+(\\d+|${WORD_NUMBER_PATTERN})\\s+weeks?\\s+on\\s+([a-z]+day)\\b`));
  if (weeklyWithWeekdayMatch) {
    const intervalRaw = weeklyWithWeekdayMatch[1];
    interval = /^\d+$/.test(intervalRaw) ? parseInt(intervalRaw) : WORD_NUMBER_MAP[intervalRaw] || 1;
    freq = RRule.WEEKLY;
    // Extract the weekday and add it to foundDays
    const weekdayName = weeklyWithWeekdayMatch[2];
    const weekdayMap = {
      'monday': 'MO', 'tuesday': 'TU', 'wednesday': 'WE', 'thursday': 'TH',
      'friday': 'FR', 'saturday': 'SA', 'sunday': 'SU'
    };
    if (weekdayMap[weekdayName]) {
      foundDays = [RRule[weekdayMap[weekdayName]]];
    }
  }

  if (freq === RRule.WEEKLY && !/\bmonth\b/.test(lower) && !/\bmonthly\b/.test(lower)) {
    const ordinalWeekdayMatch = lower.match(/\bevery\s+(other|first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|eleventh|11th|twelfth|12th|\d+(?:st|nd|rd|th)?)\s+[a-z]+day\b/);
    if (ordinalWeekdayMatch) {
      const ordinalToken = ordinalWeekdayMatch[1];
      let ordinalValue = ordinalToken === 'other' ? 2 : ordinalToNumber(ordinalToken);
      if (Number.isNaN(ordinalValue) || ordinalValue < 1) {
        ordinalValue = 1;
      }
      if (ordinalValue > 1) {
        interval = ordinalValue;
      }
    }
  }

  if (freq === RRule.YEARLY && bymonth == null && monthTokens.length > 0) {
    const uniqueMonths = Array.from(new Set(monthTokens)).sort((a, b) => a - b);
    if (uniqueMonths.length > 0) {
      bymonth = uniqueMonths;
    }
  }

  const monthlyWithWeekdayMatch = lower.match(/\bevery\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+)(st|nd|rd|th)?\s+month\s+on\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+)(st|nd|rd|th)?\s+week\s+([a-z]+day)\b/);
  if (monthlyWithWeekdayMatch) {
    interval = ORD[monthlyWithWeekdayMatch[1]] || parseInt(monthlyWithWeekdayMatch[1]) || 1;
    bysetpos = ORD[monthlyWithWeekdayMatch[3]] || parseInt(monthlyWithWeekdayMatch[3]) || 1;
    const intervalCandidate = ordinalToNumber(monthlyWithWeekdayMatch[1]);
    if (!Number.isNaN(intervalCandidate) && intervalCandidate > 0) {
      interval = intervalCandidate;
    }
    const bysetposCandidate = ordinalToNumber(monthlyWithWeekdayMatch[3]);
    if (!Number.isNaN(bysetposCandidate) && bysetposCandidate !== 0) {
      bysetpos = bysetposCandidate;
    }
    freq = RRule.MONTHLY;
    monthlyOrdinal = true;
    // Extract the weekday and add it to foundDays
    const weekdayName = monthlyWithWeekdayMatch[5];
    const weekdayToken = WEEKDAY_NAME_MAP[weekdayName];
    if (weekdayToken) {
      foundDays = [RRule[weekdayToken]];
    }
  }

  const monthlyOnOrdinalWeekdayMatch = lower.match(/\b(?:every\s+month|monthly)\s+on\s+(?:the\s+)?(first|second|third|fourth|fifth|last|other|\d+(?:st|nd|rd|th)?)\s+([a-z]+day)\b/);
  if (monthlyOnOrdinalWeekdayMatch) {
    const ordinalToken = monthlyOnOrdinalWeekdayMatch[1];
    const weekdayName = monthlyOnOrdinalWeekdayMatch[2];
    let ordinalValue = ordinalToken === 'other' ? 2 : ordinalToNumber(ordinalToken);
    if (Number.isNaN(ordinalValue) || ordinalValue === 0) ordinalValue = 1;
    bysetpos = ordinalValue;
    monthlyOrdinal = true;
    freq = RRule.MONTHLY;
    const weekdayToken = WEEKDAY_NAME_MAP[weekdayName];
    if (weekdayToken) {
      foundDays = [RRule[weekdayToken]];
    }
  }

  if (!monthlyOrdinal) {
    const simpleOrdinalWeekdayMatch = lower.match(/\bevery\s+(first|second|third|fourth|fifth|last|other|\d+(?:st|nd|rd|th)?)\s+([a-z]+day)\b/);
    if (simpleOrdinalWeekdayMatch && !/\bweek\b/.test(lower) && !/\bweekday\b/.test(lower)) {
      const ordinalToken = simpleOrdinalWeekdayMatch[1];
      const weekdayName = simpleOrdinalWeekdayMatch[2];
      if (ordinalToken === 'other') {
        // Treat phrases like "every other Wednesday" as weekly intervals
        // instead of monthly ordinal patterns
        // Skip monthly handling in this case
      } else {
      let ordinalValue = ordinalToken === 'other' ? 2 : ordinalToNumber(ordinalToken);
      if (Number.isNaN(ordinalValue) || ordinalValue === 0) ordinalValue = 1;
      bysetpos = ordinalValue;
      monthlyOrdinal = true;
      freq = RRule.MONTHLY;
      const weekdayToken = WEEKDAY_NAME_MAP[weekdayName];
      if (weekdayToken) {
        foundDays = [RRule[weekdayToken]];
      }
      }
    }
  }

  const ordinalInMonthMatch = lower.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|eleventh|11th|twelfth|12th|\d+)(?:st|nd|rd|th)?\s+([a-z]+day)\s+in\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  if (ordinalInMonthMatch) {
    const ordinalToken = ordinalInMonthMatch[1];
    const weekdayName = ordinalInMonthMatch[2];
    const monthName = ordinalInMonthMatch[3];
    const ordinalValue = ordinalToNumber(ordinalToken);
    if (!Number.isNaN(ordinalValue)) {
      bysetpos = ordinalValue;
    }
    const weekdayToken = WEEKDAY_NAME_MAP[weekdayName];
    if (weekdayToken) {
      foundDays = [RRule[weekdayToken]];
    }
    bymonth = MONTH_MAP[monthName];
    freq = RRule.YEARLY;
    interval = 1;
    monthlyOrdinal = false;
  }

  if (!bymonth && !bymonthday) {
    const ordinalOfMonthMatch = lower.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|eleventh|11th|twelfth|12th|\d+)(?:st|nd|rd|th)?\s+([a-z]+day)\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
    if (ordinalOfMonthMatch) {
      const ordinalToken = ordinalOfMonthMatch[1];
      const weekdayName = ordinalOfMonthMatch[2];
      const monthName = ordinalOfMonthMatch[3];
      const ordinalValue = ordinalToNumber(ordinalToken);
      if (!Number.isNaN(ordinalValue)) {
        bysetpos = ordinalValue;
      }
      const weekdayToken = WEEKDAY_NAME_MAP[weekdayName];
      if (weekdayToken) {
        byweekday = [RRule[weekdayToken]];
      }
      bymonth = [MONTH_MAP[monthName]];
      freq = RRule.YEARLY;
      interval = 1;
      monthlyOrdinal = false;
    }
  }

  if (freq === null || freq === undefined) return null;

  // Don't strip frequency words - they're needed for proper parsing
  // Only strip specific patterns that interfere with chrono parsing
  const stripped = processedText
    .replace(/\b(of\s+(each|every)\s+month)\b/gi, '')
    .trim();

  const pick = parseChrono(stripped, effectiveNow) || chronoResult || null;
  const rawExplicitTime = extractExplicitTime(processedText);
  let explicitTime = rawExplicitTime;
  if (
    rawExplicitTime &&
    rawExplicitTime.type === 'hour-only' &&
    rawExplicitTime.hour != null &&
    rawExplicitTime.hour >= 0 &&
    rawExplicitTime.hour < 60 &&
    (freq === RRule.HOURLY || freq === RRule.MINUTELY)
  ) {
    explicitTime = {
      type: 'minute-offset',
      minute: rawExplicitTime.minute ?? rawExplicitTime.hour,
      minuteOffset: rawExplicitTime.hour
    };
  }

  if (pick && !pick.start.isCertain('hour')) {
    if (explicitTime) {
      if (explicitTime.type === 'time' || explicitTime.type === 'hour-only') {
        pick.start.assign('hour', explicitTime.hour);
        pick.start.assign('minute', explicitTime.minute ?? 0);
        pick.start.assign('second', 0);
        pick.start.assign('millisecond', 0);
      } else if (explicitTime.type === 'minute-offset') {
        pick.start.assign('minute', explicitTime.minute);
        pick.start.assign('second', 0);
        pick.start.assign('millisecond', 0);
      } else {
        ensureDefaultTime(pick);
      }
      if (explicitTime.minuteOffset != null && explicitTime.type !== 'time') {
        pick.start.assign('minute', explicitTime.minuteOffset);
        pick.start.assign('second', 0);
        pick.start.assign('millisecond', 0);
      }
    } else {
      ensureDefaultTime(pick);
    }
  }

  const hasExplicitStartReference = startingInfo.reference != null;
  const hasExplicitStartTime = Boolean(startingInfo.referenceHasTime);
  const startOffsetUnit = startingInfo.offsetUnit ?? null;

  let start;
  if (hasExplicitStartReference) {
    start = new Date(effectiveNow.getTime());
  } else {
    start = pick ? pick.date() : new Date(effectiveNow.getTime());
  }

  let hour;
  let minute;
  let minuteOffset = explicitTime?.minuteOffset ?? null;

  if ((freq === RRule.HOURLY || freq === RRule.MINUTELY) && offsetComponents && offsetComponents.minute != null) {
    minuteOffset = offsetComponents.minute;
    delete offsetComponents.minute;
  }

  let hourlyAtHour = null;
  if (freq === RRule.HOURLY || freq === RRule.MINUTELY) {
    const atMatch = processedText.match(/\bat\s+(\d{1,2})\b/i);
    if (atMatch) {
      const parsed = parseInt(atMatch[1], 10);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 23) {
        hourlyAtHour = parsed;
      }
    }
  }

  const quarterNameMatch = lower.match(/\b(first|second|third|fourth)\s+quarter\b/);
  if (quarterNameMatch) {
    const quarterMap = {
      first: [1, 2, 3],
      second: [4, 5, 6],
      third: [7, 8, 9],
      fourth: [10, 11, 12]
    };
    const quarterKey = quarterNameMatch[1];
    const quarterMonths = quarterMap[quarterKey];
    if (quarterMonths) {
      const existing = bymonth ? new Set(Array.isArray(bymonth) ? bymonth : [bymonth]) : new Set();
      quarterMonths.forEach((month) => existing.add(month));
      bymonth = Array.from(existing).sort((a, b) => a - b);
    }
  }

  if (!hasExplicitStartReference && pick && pick.start.isCertain('hour')) {
    hour = pick.start.get('hour');
    minute = pick.start.isCertain('minute') ? pick.start.get('minute') : 0;
  } else if (explicitTime && explicitTime.type === 'time') {
    hour = explicitTime.hour;
    minute = explicitTime.minute;
  } else if (hourlyAtHour != null) {
    hour = hourlyAtHour;
    minute = explicitTime.minute ?? 0;
  } else if (explicitTime && explicitTime.type === 'hour-only') {
    hour = explicitTime.hour;
    minute = explicitTime.minute ?? 0;
  }

  if (hour === undefined) {
    if (hasExplicitStartReference && hasExplicitStartTime) {
      hour = start.getHours();
    } else if (freq === RRule.HOURLY || freq === RRule.MINUTELY) {
      hour = start.getHours();
    } else {
      hour = DEFAULT_HOUR;
    }
  }

  if (minute === undefined) {
    if (freq === RRule.HOURLY || freq === RRule.MINUTELY) {
      minute = hasExplicitStartTime ? start.getMinutes() : 0;
    } else {
      minute = hasExplicitStartTime ? start.getMinutes() : 0;
    }
  }

  let referenceTimeDelta = 0;
  if (hasExplicitStartReference && !hasExplicitStartTime && startOffsetUnit == null && hour !== undefined && minute !== undefined) {
    const alignedReference = alignStart(new Date(effectiveNow.getTime()), hour, minute);
    referenceTimeDelta = alignedReference.getTime() - effectiveNow.getTime();
  }

  if (until && offsetComponents && !isRelativeUntil && explicitTime && (explicitTime.type === 'time' || explicitTime.type === 'hour-only')) {
    const alignedUntil = alignStart(new Date(until.getTime()), explicitTime.hour, explicitTime.minute ?? 0);
    until = alignedUntil;
  }

  if (minuteOffset != null) {
    const hasExplicitTimeContext =
      hourlyAtHour != null ||
      (explicitTime && (explicitTime.type === 'time' || explicitTime.type === 'hour-only')) ||
      (hasExplicitStartTime && startingInfo.offsetUnit == null);

    if (hasExplicitStartTime && hasExplicitTimeContext) {
      const baseMinute = minute ?? 0;
      const baseHour = hour ?? start.getHours();
      const totalMinutes = baseHour * 60 + baseMinute + minuteOffset;
      hour = Math.floor(totalMinutes / 60);
      minute = totalMinutes % 60;
    } else if (hasExplicitStartTime) {
      hour = hour ?? start.getHours();
      if (freq === RRule.MINUTELY) {
        const baseMinute = minute ?? start.getMinutes();
        const baseHour = hour;
        const totalMinutes = baseMinute + minuteOffset;
        hour = baseHour + Math.floor(totalMinutes / 60);
        minute = totalMinutes % 60;
      } else if (startOffsetUnit === 'minute') {
        minute = minuteOffset;
      } else {
        const baseMinute = minute ?? start.getMinutes();
        const baseHour = hour;
        const totalMinutes = baseMinute + minuteOffset;
        hour = baseHour + Math.floor(totalMinutes / 60);
        minute = totalMinutes % 60;
      }
    } else if (minute === 0) {
      minute = minuteOffset;
    }
  }

  if (referenceTimeDelta !== 0 && until && isRelativeUntil) {
    until = new Date(until.getTime() + referenceTimeDelta);
  }

  // Handle special weekday patterns
  let byweekday = [];
  const WEEKDAY_LOOKUP = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  if (/\bweek\s*day(s)?\b/.test(lower)) {
    // Monday through Friday
    byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
  } else if (/\bweekend(s)?\b/.test(lower)) {
    // Saturday and Sunday
    byweekday = [RRule.SA, RRule.SU];
  } else if (foundDays.length > 0) {
    byweekday = foundDays;
  }

  const ordinalOfMonthMatch = lower.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|eleventh|11th|twelfth|12th|\d+)(?:st|nd|rd|th)?\s+([a-z]+day)\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  if (ordinalOfMonthMatch) {
    const ordinalToken = ordinalOfMonthMatch[1];
    const weekdayName = ordinalOfMonthMatch[2];
    const monthName = ordinalOfMonthMatch[3];
    const ordinalValue = ordinalToNumber(ordinalToken);
    if (!Number.isNaN(ordinalValue)) {
      bysetpos = ordinalValue;
    }
    const weekdayToken = WEEKDAY_NAME_MAP[weekdayName];
    if (weekdayToken) {
      byweekday = [RRule[weekdayToken]];
    }
    const monthNumber = MONTH_MAP[monthName];
    if (monthNumber) {
      const monthSet = new Set(bymonth ?? []);
      monthSet.add(monthNumber);
      bymonth = Array.from(monthSet).sort((a, b) => a - b);
    }
    freq = RRule.YEARLY;
    interval = 1;
    monthlyOrdinal = false;
  }

  if (/\b(?:every\s+quarter|quarterly)\s+on\s+(?:the\s+)?first\s+month\s+on\s+weekdays\b/.test(lower)) {
    if (byweekday.length === 0) {
      byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
    }
    bymonth = [1, 4, 7, 10];
    freq = RRule.YEARLY;
    interval = 1;
  }

  const needsFallbackWeekday = byweekday.length === 0 && (freq === RRule.WEEKLY || monthlyOrdinal);
  if (needsFallbackWeekday) {
    if (pick) {
      // Use the weekday from the parsed date
      const parsedWeekday = pick.date().getDay();
      byweekday = [RRule[WEEKDAY_LOOKUP[parsedWeekday]]];
    } else if (monthlyOrdinal) {
      // Default monthly ordinal without explicit weekday to Monday
      byweekday = [RRule.MO];
    } else {
      // Fallback to current day
      const currentWeekday = effectiveNow.getDay();
      byweekday = [RRule[WEEKDAY_LOOKUP[currentWeekday]]];
    }
  }

  start = alignStart(start, hour, minute);
  if (offsetComponents && freq != null) {
    const allowedUnits = getAllowedOffsetUnits(freq);
    if (allowedUnits && allowedUnits.length > 0) {
      start = applyCompositeOffsets(start, offsetComponents, allowedUnits);
      hour = start.getHours();
      minute = start.getMinutes();
    }
  }
  const comparisonNow = startingInfo.reference
    ? alignStart(new Date(startingInfo.reference.getTime()), hour, minute)
    : effectiveNow;

  const skipFutureProjection =
    freq === RRule.YEARLY &&
    ((bymonth && bymonth.length > 0) || (bymonthday && bymonthday.length > 0) || (byweekday && byweekday.length > 0) || bysetpos != null);
  if (!skipFutureProjection) {
    start = ensureFutureDate(start, comparisonNow, freq, interval);
  }
  if (until && until <= start) {
    until = null;
  }
  let ruleHour = start.getUTCHours();
  let ruleMinute = start.getUTCMinutes();

  if (monthlyOrdinal) {
    // Create a temporary rule to find the first occurrence
    const tempRule = new RRule({
      freq: RRule.MONTHLY,
      interval,
      byweekday,
      bysetpos: bysetpos ?? 1,
      byhour: start.getUTCHours(),
      byminute: start.getUTCMinutes(),
      dtstart: start
    });
    
    // Get the first occurrence with safety limit and timeout protection
    let firstOccurrence = null;
    try {
      const occurrences = tempRule.all((_, i) => i < 10);
      firstOccurrence = occurrences[0];
    } catch (error) {
      console.warn(`Warning: Failed to generate occurrences for monthly ordinal pattern: ${error.message}`);
      // Fallback to original start date
      firstOccurrence = start;
    }
    
    if (firstOccurrence) {
      const alignedOccurrence = alignStart(firstOccurrence, hour, minute);
      const occurrenceHourUTC = alignedOccurrence.getUTCHours();
      const occurrenceMinuteUTC = alignedOccurrence.getUTCMinutes();
      // Create the final rule with the correct start date
      const finalRule = new RRule({
        freq: RRule.MONTHLY,
        interval,
        byweekday,
        bysetpos: bysetpos ?? 1,
        byhour: occurrenceHourUTC,
        byminute: occurrenceMinuteUTC,
        dtstart: alignedOccurrence,
        until: until ?? undefined
      });

      return createResult(finalRule, alignedOccurrence);
    }
    
    // Fallback to original if no occurrence found
    return createResult(
      new RRule({
        freq: RRule.MONTHLY,
        interval,
        byweekday,
        bysetpos: bysetpos ?? 1,
        byhour: start.getUTCHours(),
        byminute: start.getUTCMinutes(),
        dtstart: start,
        until: until ?? undefined
      }),
      start
    );
  }

  if (freq === RRule.MONTHLY && bymonthday) {
    // Create a temporary rule to find the first occurrence
    const tempRule = new RRule({
      freq: RRule.MONTHLY,
      bymonthday,
      byhour: start.getUTCHours(),
      byminute: start.getUTCMinutes(),
      dtstart: start,
      until: until ?? undefined
    });
    
    // Get the first occurrence with safety limit and timeout protection
    let firstOccurrence = null;
    try {
      const occurrences = tempRule.all((_, i) => i < 10);
      firstOccurrence = occurrences[0];
    } catch (error) {
      console.warn(`Warning: Failed to generate occurrences for monthly day-of-month pattern: ${error.message}`);
      // Fallback to original start date
      firstOccurrence = start;
    }
    
    if (firstOccurrence) {
      const alignedOccurrence = alignStart(firstOccurrence, hour, minute);
      const occurrenceHourUTC = alignedOccurrence.getUTCHours();
      const occurrenceMinuteUTC = alignedOccurrence.getUTCMinutes();
      // Create the final rule with the correct start date
      const finalRule = new RRule({
        freq: RRule.MONTHLY,
        bymonthday,
        byhour: occurrenceHourUTC,
        byminute: occurrenceMinuteUTC,
        dtstart: alignedOccurrence,
        until: until ?? undefined
      });

      return createResult(finalRule, alignedOccurrence);
    }
    
    // Fallback to original if no occurrence found
    return createResult(
      new RRule({
        freq: RRule.MONTHLY,
        bymonthday,
        byhour: start.getUTCHours(),
        byminute: start.getUTCMinutes(),
        dtstart: start,
        until: until ?? undefined
      }),
      start
    );
  }

  if (freq === RRule.WEEKLY) {
    const targetJsDays = byweekday
      .map((entry) => {
        if (typeof entry === 'number') return entry;
        if (entry && typeof entry.weekday === 'number') return entry.weekday;
        return null;
      })
      .filter((value) => value != null)
      .map((rrIndex) => (rrIndex === 6 ? 0 : rrIndex + 1));

    if (targetJsDays.length > 0) {
    const reference = start <= effectiveNow ? effectiveNow : start;
      let bestStart = null;

      targetJsDays.forEach((targetDay) => {
        const referenceDate = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
        let offset = (targetDay - reference.getDay() + 7) % 7;
        const candidateDate = new Date(referenceDate.getTime());
        candidateDate.setDate(candidateDate.getDate() + offset);
        let candidateStart = alignStart(candidateDate, hour, minute);

        if (candidateStart <= effectiveNow) {
          candidateDate.setDate(candidateDate.getDate() + 7);
          candidateStart = alignStart(candidateDate, hour, minute);
        }

        if (!bestStart || candidateStart < bestStart) {
          bestStart = candidateStart;
        }
      });

      if (bestStart) {
        start = bestStart;
      }
    }

    const weeklyHour = start.getUTCHours();
    const weeklyMinute = start.getUTCMinutes();
    return createResult(
      new RRule({
        freq: RRule.WEEKLY,
        interval,
        byweekday,
        byhour: weeklyHour,
        byminute: weeklyMinute,
        dtstart: start,
        until: until ?? undefined
      }),
      start
    );
  }

  if (freq === RRule.YEARLY) {
    // For yearly patterns, use the parsed date as the start date
    let yearlyStart = (!hasExplicitStartReference && pick) ? pick.date() : start;
    yearlyStart = alignStart(yearlyStart, hour, minute);
    const requiresProjection = !((bymonth && bymonth.length > 0) || (bymonthday && bymonthday.length > 0) || (byweekday && byweekday.length > 0) || bysetpos != null);
    if (requiresProjection) {
      yearlyStart = ensureFutureDate(yearlyStart, effectiveNow, RRule.YEARLY, interval);
    }
    let yearlyHour = yearlyStart.getUTCHours();
    let yearlyMinute = yearlyStart.getUTCMinutes();

    if ((!hasExplicitStartReference || startOffsetUnit != null) && (bymonth != null || bysetpos != null || (byweekday && byweekday.length > 0) || (bymonthday && bymonthday.length > 0))) {
      try {
        const tempRule = new RRule({
          freq: RRule.YEARLY,
          interval,
          byweekday: byweekday.length > 0 ? byweekday : undefined,
          bysetpos: bysetpos ?? undefined,
          bymonth: bymonth ?? undefined,
          bymonthday: bymonthday ?? undefined,
          byhour: yearlyHour,
          byminute: yearlyMinute,
          dtstart: yearlyStart,
          until: until ?? undefined
        });
        const firstOccurrence = tempRule.after(effectiveNow, true);
        if (firstOccurrence) {
          yearlyStart = firstOccurrence;
          yearlyHour = yearlyStart.getUTCHours();
          yearlyMinute = yearlyStart.getUTCMinutes();
        }
      } catch (error) {
        console.warn(`Warning: Failed to determine yearly start: ${error.message}`);
      }
    }
    return createResult(
      new RRule({
        freq: RRule.YEARLY,
        interval,
        byhour: yearlyHour,
        byminute: yearlyMinute,
        byweekday: byweekday.length > 0 ? byweekday : undefined,
        bysetpos: bysetpos ?? undefined,
        bymonth: bymonth ?? undefined,
        bymonthday: bymonthday ?? undefined,
        dtstart: yearlyStart,
        until: until ?? undefined
      }),
      yearlyStart
    );
  }

  if (freq === RRule.DAILY && byweekday && byweekday.length > 0) {
    const targetJsDays = byweekday
      .map((entry) => {
        if (typeof entry === 'number') return entry;
        if (entry && typeof entry.weekday === 'number') return entry.weekday;
        return null;
      })
      .filter((value) => value != null)
      .map((rrIndex) => (rrIndex === 6 ? 0 : rrIndex + 1));

    if (targetJsDays.length > 0) {
      const baseDate = new Date(start.getTime());
      const baseDay = baseDate.getDay();
      let bestOffset = null;

      targetJsDays.forEach((targetDay) => {
        const offset = (targetDay - baseDay + 7) % 7;
        if (bestOffset === null || offset < bestOffset) {
          bestOffset = offset;
        }
      });

      if (bestOffset != null) {
        const candidateDate = new Date(baseDate.getTime());
        candidateDate.setDate(candidateDate.getDate() + bestOffset);
        const candidateStart = alignStart(candidateDate, hour, minute);

        if (candidateStart >= start) {
          start = candidateStart;
        }
      }
    }
  }

  ruleHour = start.getUTCHours();
  ruleMinute = start.getUTCMinutes();
  const ruleSecond = start.getUTCSeconds();

  const options = {
    freq,
    interval,
    dtstart: start,
    until: until ?? undefined
  };

  if (byweekday.length > 0) {
    options.byweekday = byweekday;
  }

  if (bymonth != null) {
    options.bymonth = bymonth;
  }

  if (bysetpos != null && freq !== RRule.WEEKLY && freq !== RRule.DAILY) {
    options.bysetpos = bysetpos;
  }

  if (freq === RRule.HOURLY) {
    options.byminute = [ruleMinute];
    options.bysecond = [ruleSecond];
  } else if (freq === RRule.MINUTELY) {
    options.bysecond = [ruleSecond];
  } else {
    options.byhour = [ruleHour];
    options.byminute = [ruleMinute];
  }

  return createResult(new RRule(options), start);
}
function parseFallbackNextYearMonthDay(text, reference) {
  const match = text
    .trim()
    .match(/next\s+year\s+on\s+(?:the\s+)?([a-z]+)\s+(\d{1,2})(st|nd|rd|th)?\b/i);
  if (!match) return null;

  const monthName = match[1].toLowerCase();
  const day = parseInt(match[2], 10);
  const monthNumber = MONTH_MAP[monthName];
  if (!monthNumber || day < 1 || day > 31) return null;

  const target = new Date(reference.getFullYear() + 1, monthNumber - 1, 1);
  const daysInMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(day, daysInMonth));
  target.setHours(
    reference.getHours(),
    reference.getMinutes(),
    reference.getSeconds(),
    reference.getMilliseconds()
  );

  const result = createSyntheticChronoResult(target);
  const explicit = extractExplicitTime(text);
  if (explicit) {
    result.start.assign('hour', explicit.hour);
    result.start.assign('minute', explicit.minute);
    result.start.assign('second', 0);
    result.start.assign('millisecond', 0);
  }
  return result;
}
