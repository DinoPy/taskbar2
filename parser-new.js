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

const WEEKDAY_TOKEN_TO_RRULE_INDEX = {
  monday: 0,
  mon: 0,
  tuesday: 1,
  tue: 1,
  tues: 1,
  wednesday: 2,
  wed: 2,
  thursday: 3,
  thu: 3,
  thurs: 3,
  friday: 4,
  fri: 4,
  saturday: 5,
  sat: 5,
  sunday: 6,
  sun: 6
};

const WEEKDAY_RRULE_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const ALL_WEEKDAY_RULES = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
  RRule.SU
];

const BUSINESS_WEEKDAY_RULES = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR
];

function hasRecurringSignal(text) {
  if (!text) return false;
  const normalized = normalizeCompletionBasedPhrase(text).text ?? text;
  return /\b(every|each|weekly|daily|monthly|annually|yearly|hourly|minutely|bi[-\s]?weekly|biweekly|fortnight|fortnightly|quarterly|semi[-\s]?annually|week\s*day|week\s*end|work(?:ing)?\s*day|business\s+day|of\s+(?:each|every)\s+month)\b/i.test(
    normalized
  );
}

function hasInvalidScheduleSyntax(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  if (lower.length === 0) return true;

  if (/\bevery\s+-\d+\s+(minutes?|hours?|days?|weeks?|months?|quarters?|years?)\b/.test(lower)) return true;
  if (/\bevery\s+0+\s+(minutes?|hours?|days?|weeks?|months?|quarters?|years?)\b/.test(lower)) return true;
  if (/\bfor\s+0+\s+(occurrences?|times?|runs?)\b/.test(lower)) return true;
  if (/\bevery\s+(\d{5,})\s+(minutes?|hours?|days?|weeks?|months?|quarters?|years?)\b/.test(lower)) return true;
  if (/^\s*every\s+other\s*[.!?]*\s*$/.test(lower)) return true;

  if (/\bevery\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+every\s+weeks?\b/.test(lower)) return true;
  if (/\bdaily\s+from\s+to\b/.test(lower)) return true;
  if (/\bstarting\s+in\s+(minutes?|hours?|days?|weeks?|months?|quarters?|years?)\b/.test(lower)) return true;
  if (/\bending\s+on\s*[.!?]*\s*$/.test(lower)) return true;
  if (/\bone[-\s]?time\b.*\bevery\b/.test(lower)) return true;
  if (/\bsometime\b/.test(lower)) return true;

  if (/\bfeb(?:ruary)?\s+30(?:th)?\b/.test(lower)) return true;
  if (/\bevery\s+month\s+on\s+(?:the\s+)?32(?:nd)?\b/.test(lower)) return true;

  if (/\bin\s*-\d+\s+(minutes?|hours?|days?|weeks?|months?|quarters?|years?)\b/.test(lower)) return true;

  return false;
}

function hasPastOnlyInstantReference(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (hasRecurringSignal(lower)) return false;
  return /\b(yesterday|ago|previous\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|year)|last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|year))\b/.test(
    lower
  );
}

function assignChronoResultDate(result, date) {
  if (!result || !result.start || !date) return;
  result.start.assign('year', date.getFullYear());
  result.start.assign('month', date.getMonth() + 1);
  result.start.assign('day', date.getDate());
  result.start.assign('hour', date.getHours());
  result.start.assign('minute', date.getMinutes());
  result.start.assign('second', date.getSeconds());
  result.start.assign('millisecond', date.getMilliseconds());
}

function normalizePastChronoResult(result, text, reference) {
  if (!result || !reference) return result;
  let candidate = result.date();
  if (candidate > reference) return result;

  const lower = (text || '').toLowerCase();
  if (/\bin\s+0\s+minutes?\b/.test(lower)) {
    candidate = applyTimeOffset(reference, 1, 'minute') || candidate;
  } else if (/\bin\s+0\s+hours?\b/.test(lower)) {
    candidate = applyTimeOffset(reference, 1, 'hour') || candidate;
  } else if (/\bin\s+0\s+days?\b/.test(lower) || /\btoday\b/.test(lower)) {
    candidate = applyTimeOffset(reference, 1, 'day') || candidate;
    candidate.setHours(result.date().getHours(), result.date().getMinutes(), result.date().getSeconds(), result.date().getMilliseconds());
  } else {
    const weekdayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (weekdayMatch) {
      const nextWeekday = getNextWeekday(weekdayMatch[1], reference);
      if (nextWeekday) {
        nextWeekday.setHours(result.date().getHours(), result.date().getMinutes(), result.date().getSeconds(), result.date().getMilliseconds());
        candidate = nextWeekday;
      }
    } else {
      const hasMonthToken = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/.test(
        lower
      );
      const hasExplicitYear = /\b\d{4}\b/.test(lower);
      if (hasMonthToken && !hasExplicitYear) {
        candidate = new Date(candidate.getTime());
        candidate.setFullYear(candidate.getFullYear() + 1);
      } else {
        candidate = applyTimeOffset(reference, 1, 'day') || candidate;
        candidate.setHours(result.date().getHours(), result.date().getMinutes(), result.date().getSeconds(), result.date().getMilliseconds());
      }
    }
  }

  if (candidate <= reference) {
    candidate = applyTimeOffset(reference, 1, 'minute') || new Date(reference.getTime() + 60000);
  }
  assignChronoResultDate(result, candidate);
  return result;
}

function parseFlexibleTimeToken(token) {
  if (!token) return null;
  const lower = token.trim().toLowerCase();
  if (lower === 'noon') return { hour: 12, minute: 0 };
  if (lower === 'midnight') return { hour: 0, minute: 0 };

  const match = lower.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const modifier = match[3] ? match[3].toLowerCase() : null;

  if (modifier) {
    if (hour < 1 || hour > 12) return null;
    if (modifier === 'pm' && hour !== 12) hour += 12;
    if (modifier === 'am' && hour === 12) hour = 0;
  }
  if (hour < 0 || hour > 23) return null;
  return { hour, minute };
}

function parseTimeWindowInstruction(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const windowMatch = lower.match(
    /\b(?:from|between)\s+(noon|midnight|\d{1,2}(?::[0-5]\d)?(?:\s*[ap]m)?)\s+(?:to|and)\s+(noon|midnight|\d{1,2}(?::[0-5]\d)?(?:\s*[ap]m)?)\b/
  );
  if (!windowMatch) return null;

  const startTime = parseFlexibleTimeToken(windowMatch[1]);
  const endTime = parseFlexibleTimeToken(windowMatch[2]);
  if (!startTime || !endTime) return null;

  const minuteMatch = lower.match(
    /\bevery\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+minutes?\b/
  );
  if (minuteMatch) {
    const interval = normalizeWordNumber(minuteMatch[1]);
    if (interval == null || interval <= 0) return null;
    return {
      unit: 'minute',
      interval,
      startHour: startTime.hour,
      startMinute: startTime.minute,
      endHour: endTime.hour,
      endMinute: endTime.minute
    };
  }

  const hourMatch = lower.match(
    /\bevery\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+hours?\b/
  );
  if (hourMatch || /\bhourly\b|\bevery\s+hour\b/.test(lower)) {
    const interval = hourMatch ? normalizeWordNumber(hourMatch[1]) : 1;
    if (interval == null || interval <= 0) return null;
    return {
      unit: 'hour',
      interval,
      startHour: startTime.hour,
      startMinute: startTime.minute,
      endHour: endTime.hour,
      endMinute: endTime.minute
    };
  }

  return null;
}

function normalizeCompletionBasedPhrase(text) {
  if (!text) return { text, completionBased: false };
  let normalized = text;
  let completionBased = false;

  if (/every!\s*/i.test(normalized)) {
    normalized = normalized.replace(/every!\s*/gi, 'every ');
    completionBased = true;
  }

  const afterPattern = /\bafter\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minutes?|mins?|hours?|days?|weeks?|months?|quarters?|years?)\b/i;
  const afterMatch = afterPattern.exec(normalized);
  if (afterMatch) {
    const amount = afterMatch[1];
    const unit = afterMatch[2];
    normalized = `${normalized.slice(0, afterMatch.index)}every ${amount} ${unit}${normalized.slice(afterMatch.index + afterMatch[0].length)}`.replace(/\s{2,}/g, ' ').trim();
    completionBased = true;
  }

  return { text: normalized, completionBased };
}

function parseOrdinalDayList(lowerText) {
  if (!lowerText) return null;
  const dayListPattern =
    /\bon\s+(?:the\s+)?((?:last\s+day|\d{1,2}(?:st|nd|rd|th)?)(?:\s*(?:,|and)\s*(?:last\s+day|\d{1,2}(?:st|nd|rd|th)?))*)\b/i;
  const match = lowerText.match(dayListPattern);
  if (!match) return null;

  const values = match[1]
    .replace(/\band\b/gi, ',')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      if (/^last\s+day$/i.test(token)) return -1;
      const parsed = parseInt(token.replace(/(st|nd|rd|th)$/i, ''), 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 31) return parsed;
      return null;
    })
    .filter((value) => value != null);

  if (values.length === 0) return null;
  return Array.from(new Set(values)).sort((a, b) => {
    const left = a < 0 ? 999 + Math.abs(a) : a;
    const right = b < 0 ? 999 + Math.abs(b) : b;
    return left - right;
  });
}

function parseMonthDayPairs(lowerText) {
  if (!lowerText) return [];
  const pairs = [];
  const monthDayPattern =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/g;
  const dayMonthPattern =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/g;

  let match;
  while ((match = monthDayPattern.exec(lowerText)) !== null) {
    const month = resolveMonthToken(match[1]);
    const day = parseInt(match[2], 10);
    if (!month || Number.isNaN(day) || day < 1 || day > 31) continue;
    pairs.push({ month, day });
  }

  while ((match = dayMonthPattern.exec(lowerText)) !== null) {
    const day = parseInt(match[1], 10);
    const month = resolveMonthToken(match[2]);
    if (!month || Number.isNaN(day) || day < 1 || day > 31) continue;
    pairs.push({ month, day });
  }

  const seen = new Set();
  return pairs.filter((pair) => {
    const key = `${pair.month}-${pair.day}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildHourWindow(startHour, endHour) {
  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < 0 ||
    startHour > 23 ||
    endHour < 0 ||
    endHour > 23
  ) {
    return [];
  }

  const hours = [];
  let cursor = startHour;
  let safety = 0;
  while (safety < 24) {
    hours.push(cursor);
    if (cursor === endHour) break;
    cursor = (cursor + 1) % 24;
    safety += 1;
  }
  return Array.from(new Set(hours));
}

function expandWeekdayRange(startToken, endToken) {
  if (!startToken || !endToken) return [];
  const start = WEEKDAY_TOKEN_TO_RRULE_INDEX[startToken.toLowerCase()];
  const end = WEEKDAY_TOKEN_TO_RRULE_INDEX[endToken.toLowerCase()];
  if (start == null || end == null) return [];

  const indexes = [];
  let cursor = start;
  let safety = 0;
  while (safety < 7) {
    indexes.push(cursor);
    if (cursor === end) break;
    cursor = (cursor + 1) % 7;
    safety += 1;
  }
  return indexes.map((index) => RRule[WEEKDAY_RRULE_ORDER[index]]);
}

function getNextDstTransitionDate(reference) {
  if (!reference) return null;
  const cursor = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 0, 0, 0, 0);
  let previousOffset = cursor.getTimezoneOffset();
  for (let i = 0; i < 550; i += 1) {
    cursor.setDate(cursor.getDate() + 1);
    const currentOffset = cursor.getTimezoneOffset();
    if (currentOffset !== previousOffset) {
      return new Date(cursor.getTime());
    }
    previousOffset = currentOffset;
  }
  return null;
}

function parseSpecialAnchorDate(phrase, reference) {
  if (!phrase || !reference) return null;
  const lower = phrase.toLowerCase();
  if (!/\bdst\s+transition\s+day\b/.test(lower)) return null;
  const date = getNextDstTransitionDate(reference);
  if (!date) return null;

  const explicitTime = extractExplicitTime(phrase);
  if (explicitTime && (explicitTime.type === 'time' || explicitTime.type === 'hour-only')) {
    date.setHours(explicitTime.hour ?? DEFAULT_HOUR, explicitTime.minute ?? 0, 0, 0);
  } else {
    date.setHours(DEFAULT_HOUR, 0, 0, 0);
  }
  return date;
}

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
        const specialAnchor = parseSpecialAnchorDate(phrase, baseReference);
        if (specialAnchor) {
          untilDate = specialAnchor;
        } else {
          const parsed = chrono.parse(phrase, baseReference);
          if (parsed && parsed.length > 0) {
            untilDate = parsed[0].date();
          }
        }
      }
      working = `${working.slice(0, matchOn.index)}${working.slice(matchOn.index + matchOn[0].length)}`.trim();
    }
  }

  if (!untilDate) {
    const untilPattern = /\buntil\s+(.+?)(?=\s+\bat\b|\s+\b(?:every|each|daily|weekly|monthly|yearly|annually|for|starting|ending|offset)\b|[,\.;]|$)/i;
    const matchUntil = untilPattern.exec(working);
    if (matchUntil) {
      const phrase = matchUntil[1].trim();
      if (phrase.length > 0) {
        const specialAnchor = parseSpecialAnchorDate(phrase, baseReference);
        if (specialAnchor) {
          untilDate = specialAnchor;
        } else {
          const parsed = chrono.parse(phrase, baseReference, { forwardDate: true });
          if (parsed && parsed.length > 0) {
            untilDate = parsed[0].date();
          }
        }
      }
      working = `${working.slice(0, matchUntil.index)}${working.slice(matchUntil.index + matchUntil[0].length)}`.trim();
    }
  }

  working = working.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim();

  return { cleanedText: working, untilDate, isRelative };
}

function preprocessCountInstruction(text, reference = null) {
  if (!text) return { cleanedText: text, count: null, untilDate: null, isRelative: false };

  let working = text;
  let count = null;
  let untilDate = null;
  let isRelative = false;
  const baseReference = reference ?? new Date();

  const countPattern = /\bfor\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:occurrences?|times?|runs?)\b/i;
  const countMatch = countPattern.exec(working);
  if (countMatch) {
    const parsedCount = normalizeWordNumber(countMatch[1]);
    if (parsedCount != null && parsedCount > 0) {
      count = parsedCount;
    }
    working = `${working.slice(0, countMatch.index)}${working.slice(countMatch.index + countMatch[0].length)}`.trim();
  }

  if (count == null) {
    const durationPattern = /\bfor\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minutes?|mins?|hours?|days?|weeks?|months?|quarters?|years?)\b/i;
    const durationMatch = durationPattern.exec(working);
    if (durationMatch) {
      const amount = normalizeWordNumber(durationMatch[1]);
      const unit = normalizeOffsetUnit(durationMatch[2]);
      if (amount != null && unit) {
        untilDate = applyTimeOffset(baseReference, amount, unit);
        if (untilDate) {
          isRelative = true;
        }
      }
      working = `${working.slice(0, durationMatch.index)}${working.slice(durationMatch.index + durationMatch[0].length)}`.trim();
    }
  }

  working = working.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim();
  return { cleanedText: working, count, untilDate, isRelative };
}

function parseDateListTokens(listText, reference) {
  if (!listText) return [];
  const parts = listText
    .replace(/\s+and\s+/gi, ',')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const dates = [];
  parts.forEach((token) => {
    const parsed = chrono.parse(token, reference, { forwardDate: true });
    if (parsed && parsed.length > 0) {
      dates.push(parsed[0].date());
    }
  });
  return dates;
}

function preprocessInclusionExclusionInstruction(text, reference = null) {
  if (!text) {
    return { cleanedText: text, rdates: [], exdates: [], rrules: [], exrules: [] };
  }

  const baseReference = reference ?? new Date();
  let working = text;
  const rdates = [];
  const exdates = [];
  const rrules = [];
  const exrules = [];

  const plusQuarterPattern =
    /\bplus\s+first\s+business\s+day\s+of\s+each\s+quarter(?:\s+at\s+(?:noon|midnight|\d{1,2}(?::[0-5]\d)?(?:\s*[ap]m)?))?/i;
  const plusQuarterMatch = plusQuarterPattern.exec(working);
  if (plusQuarterMatch) {
    const explicitTime = extractExplicitTime(plusQuarterMatch[0]) || extractExplicitTime(working);
    const hour = explicitTime?.hour ?? DEFAULT_HOUR;
    const minute = explicitTime?.minute ?? 0;
    const dtstart = new Date(baseReference.getTime());
    dtstart.setHours(hour, minute, 0, 0);
    rrules.push(
      new RRule({
        freq: RRule.YEARLY,
        interval: 1,
        bymonth: [1, 4, 7, 10],
        byweekday: BUSINESS_WEEKDAY_RULES.slice(),
        bysetpos: 1,
        byhour: dtstart.getUTCHours(),
        byminute: dtstart.getUTCMinutes(),
        dtstart
      })
    );
    working = `${working.slice(0, plusQuarterMatch.index)}${working.slice(plusQuarterMatch.index + plusQuarterMatch[0].length)}`.trim();
  }

  const plusDatePattern =
    /\bplus\s+(\d{4}-\d{2}-\d{2}(?:\s+at\s+\d{1,2}:\d{2})?(?:\s*(?:,|and)\s*\d{4}-\d{2}-\d{2}(?:\s+at\s+\d{1,2}:\d{2})?)*)/i;
  const plusDateMatch = plusDatePattern.exec(working);
  if (plusDateMatch) {
    rdates.push(...parseDateListTokens(plusDateMatch[1], baseReference));
    working = `${working.slice(0, plusDateMatch.index)}${working.slice(plusDateMatch.index + plusDateMatch[0].length)}`.trim();
  }

  const exceptFirstFourPattern =
    /\bexcept\s+the\s+first\s+four\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b/i;
  const exceptFirstFourMatch = exceptFirstFourPattern.exec(working);
  if (exceptFirstFourMatch) {
    const weekdayIndex = WEEKDAY_TOKEN_TO_RRULE_INDEX[exceptFirstFourMatch[1].toLowerCase()];
    if (weekdayIndex != null) {
      const weekdayToken = WEEKDAY_RRULE_ORDER[weekdayIndex];
      exrules.push(
        new RRule({
          freq: RRule.MONTHLY,
          interval: 1,
          byweekday: [RRule[weekdayToken]],
          bysetpos: [1, 2, 3, 4],
          dtstart: new Date(baseReference.getTime())
        })
      );
    }
    working = `${working.slice(0, exceptFirstFourMatch.index)}${working.slice(exceptFirstFourMatch.index + exceptFirstFourMatch[0].length)}`.trim();
  }

  const exceptDatePattern =
    /\bexcept\s+(\d{4}-\d{2}-\d{2}(?:\s+at\s+\d{1,2}:\d{2})?(?:\s*(?:,|and)\s*\d{4}-\d{2}-\d{2}(?:\s+at\s+\d{1,2}:\d{2})?)*)/i;
  const exceptDateMatch = exceptDatePattern.exec(working);
  if (exceptDateMatch) {
    exdates.push(...parseDateListTokens(exceptDateMatch[1], baseReference));
    working = `${working.slice(0, exceptDateMatch.index)}${working.slice(exceptDateMatch.index + exceptDateMatch[0].length)}`.trim();
  }

  working = working.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim();
  return { cleanedText: working, rdates, exdates, rrules, exrules };
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

  const resolveStartingPhrase = (phrase, referenceDate) => {
    if (!phrase || !referenceDate) return { date: null, hasTime: false, consumedText: phrase };
    const parsed = chrono.parse(phrase, referenceDate, { forwardDate: true });
    if (parsed && parsed.length > 0) {
      const result = parsed[0];
      return {
        date: result.date(),
        hasTime: Boolean(result.start && result.start.isCertain('hour')),
        consumedText: result.text ?? phrase
      };
    }

    const specialAnchor = parseSpecialAnchorDate(phrase, referenceDate);
    if (specialAnchor) {
      return {
        date: specialAnchor,
        hasTime: true,
        consumedText: phrase
      };
    }

    const manualStart = parseOrdinalMonthPhrase(phrase, referenceDate);
    if (manualStart) {
      return {
        date: manualStart.date,
        hasTime: Boolean(manualStart.hasTime),
        consumedText: phrase
      };
    }

    return { date: null, hasTime: false, consumedText: phrase };
  };

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

  const startingAtPattern = /\bstarting\s+at\s+(noon|midnight|\d{1,2}(?::[0-5]\d)?(?:\s*[ap]m)?)\b/i;
  const startingAtMatch = startingAtPattern.exec(working);
  if (startingAtMatch) {
    const parsedTime = parseFlexibleTimeToken(startingAtMatch[1]);
    if (parsedTime) {
      const base = newReference ? new Date(newReference.getTime()) : new Date(baseReference.getTime());
      base.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
      if (!newReference && base <= baseReference) {
        base.setDate(base.getDate() + 1);
      }
      offsetDate = base;
      newReference = base;
      referenceHasTime = true;
    }
    const startIndex = startingAtMatch.index;
    const endIndex = startIndex + startingAtMatch[0].length;
    const before = working.slice(0, startIndex).replace(/\s+(?:,|\band\b|\bthen\b)\s*$/i, '').trim();
    const after = working.slice(endIndex).replace(/^(?:,|\band\b|\bthen\b|\s)+/i, '').trim();
    working = before && after ? `${before} ${after}` : (before || after);
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
      } else {
        const specialAnchor = parseSpecialAnchorDate(phrase, newReference ?? baseReference);
        if (specialAnchor) {
          startDate = specialAnchor;
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

  const startingBarePattern = /\bstarting\s+(.+?)(?=\s+\b(?:every|each|daily|weekly|monthly|yearly|annually|for|until|ending|offset)\b|$)/i;
  const matchBare = startingBarePattern.exec(working);
  if (matchBare) {
    const phrase = matchBare[1].trim();
    if (phrase.length > 0 && !/^(?:in|on|at)\b/i.test(phrase)) {
      const resolved = resolveStartingPhrase(phrase, newReference ?? baseReference);
      if (resolved.date) {
        offsetDate = resolved.date;
        newReference = resolved.date;
        if (resolved.hasTime) {
          referenceHasTime = true;
        }
        const startIndex = matchBare.index;
        const endIndex = startIndex + matchBare[0].length;
        const before = working.slice(0, startIndex).replace(/\s+(?:,|\band\b|\bthen\b)\s*$/i, '').trim();
        const after = working.slice(endIndex).replace(/^(?:,|\band\b|\bthen\b|\s)+/i, '').trim();
        working = before && after ? `${before} ${after}` : (before || after);
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

function extractDayPeriodTime(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/\bin\s+the\s+morning\b|\bmorning\b/.test(lower)) {
    return { hour: 9, minute: 0 };
  }
  if (/\bin\s+the\s+afternoon\b|\bafternoon\b/.test(lower)) {
    return { hour: 15, minute: 0 };
  }
  if (/\bin\s+the\s+evening\b|\bevening\b/.test(lower)) {
    return { hour: 19, minute: 0 };
  }
  if (/\bat\s+night\b|\bnightly\b|\bnight\b/.test(lower)) {
    return { hour: 21, minute: 0 };
  }
  return null;
}

/**
 * Parse natural language text using Chrono
 * @param {string} text - The text to parse
 * @param {Date} reference - Reference date for parsing
 * @returns {Object|null} Chrono parse result or null
 */
export function parseChrono(text, reference) {
  if (!text || hasInvalidScheduleSyntax(text)) return null;
  const completionNormalized = normalizeCompletionBasedPhrase(text);
  const normalizedText = completionNormalized.text ?? text;
  const startingInfo = preprocessStartingInstruction(normalizedText, reference);
  let workingText = startingInfo.cleanedText ?? normalizedText;
  const effectiveReference = startingInfo.reference ?? reference;
  if (!workingText || hasInvalidScheduleSyntax(workingText)) return null;
  if (hasPastOnlyInstantReference(workingText)) return null;

  const offsetInfo = extractOffsetInstruction(workingText);
  if (offsetInfo.offsets && offsetInfo.cleanedText != null) {
    workingText = offsetInfo.cleanedText;
  }

  const endingInfo = preprocessEndingInstruction(workingText, effectiveReference);
  if (endingInfo.cleanedText != null) {
    workingText = endingInfo.cleanedText;
  }
  if ((!workingText || workingText.trim().length === 0) && endingInfo.untilDate && startingInfo.offsetDate == null) {
    return createSyntheticChronoResult(new Date(endingInfo.untilDate.getTime()), ['year', 'month', 'day', 'hour', 'minute']);
  }

  const directFallback =
    parseFallbackNextYearMonthDay(workingText, effectiveReference) ||
    parseFallbackNextWeekDay(workingText, effectiveReference) ||
    parseFallbackNextMonthDay(workingText, effectiveReference);
  if (directFallback) return normalizePastChronoResult(directFallback, workingText, effectiveReference);

  const [result] = chrono.parse(workingText, effectiveReference, { forwardDate: true });
  if (result) return normalizePastChronoResult(result, workingText, effectiveReference);

  const fallback =
    parseFallbackDayOfMonth(workingText, effectiveReference);
  return normalizePastChronoResult(fallback, workingText, effectiveReference);
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
  if (!text || hasInvalidScheduleSyntax(text)) return false;
  const completionNormalized = normalizeCompletionBasedPhrase(text);
  const normalizedText = completionNormalized.text ?? text;
  const startingInfo = preprocessStartingInstruction(normalizedText);
  const targetText = startingInfo.cleanedText ?? normalizedText;
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

  return /\b(every|each|weekly|daily|monthly|annually|yearly|hourly|minutely|bi[-\s]?weekly|biweekly|fortnight|fortnightly|second|2nd|third|3rd|fourth|4th|other|per|week\s*day|week\s*end|week\s*days|week\s*ends|quarterly|semi[-\s]?annually|workdays?|working\s+days?|business\s+days?|after)\b/i.test(
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
  const workingDailyMatch = lower.match(/\bevery\s+(\d+)\s+working\s+days?\b/);
  if (workingDailyMatch) {
    return parseInt(workingDailyMatch[1]);
  }
  const ordinalDailyMatch = lower.match(/\bevery\s+(\d+)(?:st|nd|rd|th)\s+day\b/);
  if (ordinalDailyMatch) {
    return parseInt(ordinalDailyMatch[1]);
  }
  const dailyWordMatch = lower.match(/\bevery\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+days?\b/);
  if (dailyWordMatch) {
    return WORD_NUMBER_MAP[dailyWordMatch[1]] || 1;
  }
  const workingDailyWordMatch = lower.match(/\bevery\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+working\s+days?\b/);
  if (workingDailyWordMatch) {
    return WORD_NUMBER_MAP[workingDailyWordMatch[1]] || 1;
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
  if (/\bevery\s+\d+\s+working\s+days?\b/.test(lower)) return RRule.DAILY;
  if (/\bevery\s+\d+(?:st|nd|rd|th)\s+day\b/.test(lower)) return RRule.DAILY;
  if (new RegExp(`\\bevery\\s+${WORD_NUMBER_PATTERN}\\s+days?\\b`).test(lower)) return RRule.DAILY;
  if (new RegExp(`\\bevery\\s+${WORD_NUMBER_PATTERN}\\s+working\\s+days?\\b`).test(lower)) return RRule.DAILY;

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
  if (/\bwork(?:ing)?\s*day(s)?\b/.test(lower)) return RRule.WEEKLY;
  if (/\bbusiness\s+day(s)?\b/.test(lower)) return RRule.WEEKLY;
  
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
  if (!text || hasInvalidScheduleSyntax(text)) return null;
  if (!isRecurring(text)) return null;
  const completionNormalized = normalizeCompletionBasedPhrase(text);
  const normalizedText = completionNormalized.text ?? text;
  const completionBased = completionNormalized.completionBased === true;
  const startingInfo = preprocessStartingInstruction(normalizedText, now);
  const effectiveNow = startingInfo.reference ?? now;
  let processedText = (startingInfo.cleanedText ?? normalizedText) || '';
  if (!processedText || hasInvalidScheduleSyntax(processedText)) return null;
  const offsetInfo = extractOffsetInstruction(processedText);
  const offsetComponents = offsetInfo.offsets;
  if (offsetInfo.cleanedText != null) {
    processedText = offsetInfo.cleanedText;
  }
  const endingInfo = preprocessEndingInstruction(processedText, effectiveNow);
  const untilRaw = endingInfo.untilDate ? new Date(endingInfo.untilDate.getTime()) : null;
  let isRelativeUntil = endingInfo.isRelative === true;
  if (endingInfo.cleanedText != null) {
    processedText = endingInfo.cleanedText;
  }
  const countInfo = preprocessCountInstruction(processedText, effectiveNow);
  if (countInfo.cleanedText != null) {
    processedText = countInfo.cleanedText;
  }
  const inclusionExclusionInfo = preprocessInclusionExclusionInstruction(processedText, effectiveNow);
  if (inclusionExclusionInfo.cleanedText != null) {
    processedText = inclusionExclusionInfo.cleanedText;
  }
  const attachCompositeParts = (result) => {
    if (!result) return result;
    if (inclusionExclusionInfo.rdates.length > 0) {
      result.rdates = inclusionExclusionInfo.rdates.map((date) => new Date(date.getTime()));
    }
    if (inclusionExclusionInfo.exdates.length > 0) {
      result.exdates = inclusionExclusionInfo.exdates.map((date) => new Date(date.getTime()));
    }
    if (inclusionExclusionInfo.rrules.length > 0) {
      result.rrules = inclusionExclusionInfo.rrules.slice();
    }
    if (inclusionExclusionInfo.exrules.length > 0) {
      result.exrules = inclusionExclusionInfo.exrules.slice();
    }
    if (additionalRuleSpecs.length > 0) {
      const ruleHour = result.rule?.options?.byhour?.[0] ?? result.start.getUTCHours();
      const ruleMinute = result.rule?.options?.byminute?.[0] ?? result.start.getUTCMinutes();
      const mergedRules = result.rrules ? result.rrules.slice() : [];
      additionalRuleSpecs.forEach((spec) => {
        mergedRules.push(
          new RRule({
            freq: spec.freq ?? result.rule?.options?.freq ?? RRule.YEARLY,
            interval: spec.interval ?? result.rule?.options?.interval ?? 1,
            wkst: weekStart ?? undefined,
            bymonth: spec.bymonth ?? undefined,
            bymonthday: spec.bymonthday ?? undefined,
            byweekday: spec.byweekday ?? undefined,
            bysetpos: spec.bysetpos ?? undefined,
            byhour: [ruleHour],
            byminute: [ruleMinute],
            dtstart: result.start
          })
        );
      });
      result.rrules = mergedRules;
    }
    if (completionBased) {
      result.completionBased = true;
    }
    const warnings = [];
    if (
      inclusionExclusionInfo.rdates.length > 0 ||
      inclusionExclusionInfo.exdates.length > 0 ||
      inclusionExclusionInfo.rrules.length > 0 ||
      inclusionExclusionInfo.exrules.length > 0
    ) {
      warnings.push('EXPORTER_COMPAT: composite recurrence may be unsupported by some providers');
    }
    if (/\bthanksgiving\b/.test(lower)) {
      warnings.push('REGION_SENSITIVE: thanksgiving defaults to US (4th Thursday of November)');
    }
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    if ((count == null && until == null) || result.rule?.options?.count == null && result.rule?.options?.until == null) {
      const suggested = 730;
      result.exportCap = {
        suggestedCount: suggested
      };
      const configured = Number.parseInt(process.env.PARSER_EXPORT_MAX_OCCURRENCES ?? '', 10);
      if (Number.isInteger(configured) && configured > 0) {
        result.exportCap.appliedCount = configured;
      }
    }
    return result;
  };
  const buildResult = (rule, startDate) => attachCompositeParts(createResult(rule, startDate));
  const lower = processedText.toLowerCase();
  const windowInstruction = parseTimeWindowInstruction(processedText);
  const weekdayRangeMatch = lower.match(
    /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s*(?:to|through|-)\s*(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/
  );
  const monthRegex = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/g;
  const monthTokens = [];
  let monthMatch;
  while ((monthMatch = monthRegex.exec(lower)) !== null) {
    const num = resolveMonthToken(monthMatch[1]);
    if (num != null) monthTokens.push(num);
  }
  let until = untilRaw;
  let count = countInfo.count ?? null;
  if (!until && countInfo.untilDate) {
    until = new Date(countInfo.untilDate.getTime());
    isRelativeUntil = countInfo.isRelative === true;
  }
  if (count != null && until != null) return null;

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
    { rx: /\btue(s(day)?)?s?\b/, val: 'TU' },
    { rx: /\bwed(nesday)?s?\b/, val: 'WE' },
    { rx: /\bthu(rs(day)?)?s?\b/, val: 'TH' },
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
  if (weekdayRangeMatch) {
    const expandedRange = expandWeekdayRange(weekdayRangeMatch[1], weekdayRangeMatch[2]);
    if (expandedRange.length > 0) {
      foundDays = expandedRange;
    }
  }
  if (/\bwork(?:ing)?\s*day(s)?\b/.test(lower) || /\bbusiness\s+day(s)?\b/.test(lower)) {
    foundDays = BUSINESS_WEEKDAY_RULES.slice();
  }

  let bysetpos = null;
  let monthlyOrdinal = false;
  let bymonth = null;
  let bymonthday = null;
  let byyearday = null;
  let byweekno = null;
  let byweekday = [];
  let windowHours = null;
  let windowStart = null;
  let weekStart = null;
  const additionalRuleSpecs = [];

  let interval = inferInterval(lower, ORD);

  let freq = inferFrequency(lower, foundDays.length, RRule);
  if ((freq == null || freq === undefined) && /\bevery\b/.test(lower) && monthTokens.length > 0) {
    freq = RRule.YEARLY;
  }
  if (!Number.isFinite(interval) || interval <= 0 || interval > 10000) return null;

  if (/\bweek\s+starts?\s+sunday\b/.test(lower)) {
    weekStart = RRule.SU;
  } else if (/\bweek\s+starts?\s+monday\b/.test(lower)) {
    weekStart = RRule.MO;
  }

  if (/\bevery\s+first\s+business\s+day\s+of\s+week\b/.test(lower)) {
    freq = RRule.WEEKLY;
    interval = 1;
    foundDays = [RRule.MO];
  }
  if (/\bevery\s+last\s+business\s+day\s+of\s+week\b/.test(lower)) {
    freq = RRule.WEEKLY;
    interval = 1;
    foundDays = [RRule.FR];
  }
  if (/\bevery\s+first\s+business\s+day\s+of\s+month\b/.test(lower)) {
    freq = RRule.MONTHLY;
    interval = 1;
    foundDays = BUSINESS_WEEKDAY_RULES.slice();
    bysetpos = 1;
    monthlyOrdinal = true;
  }
  if (/\bevery\s+leap\s+day\b/.test(lower) || /\bevery\s+feb(?:ruary)?\s+29(?:th)?\b/.test(lower)) {
    freq = RRule.YEARLY;
    interval = 1;
    bymonth = [2];
    bymonthday = [29];
  }

  if (/\bevery\s+new\s+year(?:'s)?\s+day\b/.test(lower)) {
    freq = RRule.YEARLY;
    interval = 1;
    bymonth = [1];
    bymonthday = [1];
  }
  if (/\bevery\s+valentine(?:'s)?\s+day\b/.test(lower)) {
    freq = RRule.YEARLY;
    interval = 1;
    bymonth = [2];
    bymonthday = [14];
  }
  if (/\bevery\s+halloween\b/.test(lower)) {
    freq = RRule.YEARLY;
    interval = 1;
    bymonth = [10];
    bymonthday = [31];
  }
  if (/\bevery\s+new\s+year(?:'s)?\s+eve\b/.test(lower)) {
    freq = RRule.YEARLY;
    interval = 1;
    bymonth = [12];
    bymonthday = [31];
  }
  if (/\bevery\s+thanksgiving\b/.test(lower)) {
    freq = RRule.YEARLY;
    interval = 1;
    bymonth = [11];
    foundDays = [RRule.TH];
    bysetpos = 4;
  }

  const monthDayPairs = parseMonthDayPairs(lower);
  if (monthDayPairs.length >= 2 && /\bevery\b/.test(lower)) {
    const grouped = new Map();
    monthDayPairs.forEach((pair) => {
      const entry = grouped.get(pair.day) || new Set();
      entry.add(pair.month);
      grouped.set(pair.day, entry);
    });

    const specs = Array.from(grouped.entries())
      .map(([day, monthsSet]) => ({
        freq: RRule.YEARLY,
        interval: 1,
        bymonth: Array.from(monthsSet).sort((a, b) => a - b),
        bymonthday: [day]
      }))
      .sort((left, right) => left.bymonthday[0] - right.bymonthday[0]);

    if (specs.length > 0) {
      const [primary, ...rest] = specs;
      freq = RRule.YEARLY;
      bymonth = primary.bymonth;
      bymonthday = primary.bymonthday;
      additionalRuleSpecs.push(...rest);
    }
  }

  const ordinalDayList = parseOrdinalDayList(lower);
  if (ordinalDayList && bymonthday == null) {
    const hasMonthlySignal = /\b(?:every\s+month|monthly)\b/.test(lower);
    const hasYearlyMonthSignal = monthTokens.length > 0;
    if (hasMonthlySignal || hasYearlyMonthSignal) {
      bymonthday = ordinalDayList;
      if (hasYearlyMonthSignal && freq == null) {
        freq = RRule.YEARLY;
      }
    }
  }
  if (windowInstruction) {
    freq = windowInstruction.unit === 'hour' ? RRule.HOURLY : RRule.MINUTELY;
    interval = windowInstruction.interval;
    windowHours = buildHourWindow(windowInstruction.startHour, windowInstruction.endHour);
    windowStart = {
      hour: windowInstruction.startHour,
      minute: windowInstruction.startMinute
    };
  }

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

  const yearlyWeekNoMatch = lower.match(
    /\bevery\s+year(?:ly)?\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+of\s+week\s+(\d{1,2})\b/
  );
  if (yearlyWeekNoMatch) {
    const weekdayToken = WEEKDAY_NAME_MAP[yearlyWeekNoMatch[1]];
    const weekNo = parseInt(yearlyWeekNoMatch[2], 10);
    if (weekdayToken && !Number.isNaN(weekNo) && weekNo >= 1 && weekNo <= 53) {
      freq = RRule.YEARLY;
      byweekno = [weekNo];
      foundDays = [RRule[weekdayToken]];
    }
  }

  const yearlyNthWeekdayMatch = lower.match(
    /\bevery\s+year(?:ly)?\s+on\s+(?:the\s+)?(\d+)(?:st|nd|rd|th)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (yearlyNthWeekdayMatch) {
    const ordinal = parseInt(yearlyNthWeekdayMatch[1], 10);
    const weekdayToken = WEEKDAY_NAME_MAP[yearlyNthWeekdayMatch[2]];
    if (!Number.isNaN(ordinal) && ordinal > 0 && weekdayToken) {
      freq = RRule.YEARLY;
      bysetpos = ordinal;
      foundDays = [RRule[weekdayToken]];
    }
  }

  const friday13thMatch = lower.match(
    /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/
  );
  if (friday13thMatch) {
    const weekdayToken = WEEKDAY_NAME_MAP[friday13thMatch[1]];
    const day = parseInt(friday13thMatch[2], 10);
    if (weekdayToken && !Number.isNaN(day) && day >= 1 && day <= 31) {
      freq = RRule.YEARLY;
      bymonthday = [day];
      foundDays = [RRule[weekdayToken]];
    }
  }

  if (/\bevery\s+month\s+on\s+first\s+saturday\s+after\s+first\s+sunday\b/.test(lower)) {
    freq = RRule.MONTHLY;
    interval = 1;
    foundDays = [RRule.SA];
    bymonthday = [7, 8, 9, 10, 11, 12, 13];
    bysetpos = null;
    monthlyOrdinal = false;
  }

  const electionDayPattern = /\bevery\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+years?\s+on\s+(?:the\s+)?first\s+tuesday\s+after\s+a\s+monday\s+in\s+november\b/;
  const electionDayMatch = lower.match(electionDayPattern);
  if (electionDayMatch) {
    const parsedInterval = normalizeWordNumber(electionDayMatch[1]);
    if (parsedInterval != null && parsedInterval > 0) {
      freq = RRule.YEARLY;
      interval = parsedInterval;
      bymonth = [11];
      bymonthday = [2, 3, 4, 5, 6, 7, 8];
      foundDays = [RRule.TU];
      bysetpos = null;
    }
  }

  const monthOrWeekdayPattern = /\b(first|second|third|fourth|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+or\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+of\s+every\s+month\b/;
  const monthOrWeekdayMatch = lower.match(monthOrWeekdayPattern);
  if (monthOrWeekdayMatch) {
    const ordinalValue = ordinalToNumber(monthOrWeekdayMatch[1]);
    const firstToken = WEEKDAY_NAME_MAP[monthOrWeekdayMatch[2]];
    const secondToken = WEEKDAY_NAME_MAP[monthOrWeekdayMatch[3]];
    if (!Number.isNaN(ordinalValue) && firstToken && secondToken) {
      freq = RRule.MONTHLY;
      bysetpos = ordinalValue;
      foundDays = [RRule[firstToken], RRule[secondToken]];
      monthlyOrdinal = true;
    }
  }

  const everyOtherMonthOrdinalWeekdayPattern = /\b(first|second|third|fourth|last)\s+([a-z]+day)\s+of\s+every\s+other\s+month\b/;
  const everyOtherMonthOrdinalWeekdayMatch = lower.match(everyOtherMonthOrdinalWeekdayPattern);
  if (everyOtherMonthOrdinalWeekdayMatch) {
    const ordinalValue = ordinalToNumber(everyOtherMonthOrdinalWeekdayMatch[1]);
    const weekdayToken = WEEKDAY_NAME_MAP[everyOtherMonthOrdinalWeekdayMatch[2]];
    if (!Number.isNaN(ordinalValue) && weekdayToken) {
      freq = RRule.MONTHLY;
      interval = 2;
      bysetpos = ordinalValue;
      foundDays = [RRule[weekdayToken]];
      monthlyOrdinal = true;
    }
  }

  const ordinalYearlyMonthPattern = /\b(first|second|third|fourth|last)\s+([a-z]+day)\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+every\s+year\b/;
  const ordinalYearlyMonthMatch = lower.match(ordinalYearlyMonthPattern);
  if (ordinalYearlyMonthMatch) {
    const ordinalValue = ordinalToNumber(ordinalYearlyMonthMatch[1]);
    const weekdayToken = WEEKDAY_NAME_MAP[ordinalYearlyMonthMatch[2]];
    const monthNumber = MONTH_MAP[ordinalYearlyMonthMatch[3]];
    if (!Number.isNaN(ordinalValue) && weekdayToken && monthNumber) {
      freq = RRule.YEARLY;
      bysetpos = ordinalValue;
      foundDays = [RRule[weekdayToken]];
      bymonth = [monthNumber];
      monthlyOrdinal = false;
    }
  }

  if (/\bfirst\s+weekday\s+of\s+every\s+month\s+and\s+last\s+weekday\s+of\s+every\s+month\b/.test(lower)) {
    freq = RRule.MONTHLY;
    bysetpos = [1, -1];
    foundDays = BUSINESS_WEEKDAY_RULES.slice();
    monthlyOrdinal = true;
  }


  const ordWdMonth = lower.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|last|other)\s+([a-z]+day)\s+(of\s+(each|every)\s+month|monthly)\b/);
  if (ordWdMonth && !/\bfirst\s+weekday\s+of\s+every\s+month\s+and\s+last\s+weekday\s+of\s+every\s+month\b/.test(lower)) {
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
    const firstAndLastDayMatch = lower.match(/\b(?:every\s+month|monthly)\s+on\s+first\s+and\s+last\s+day\b/);
    if (firstAndLastDayMatch) {
      bymonthday = [1, -1];
      freq = RRule.MONTHLY;
    }
  }
  if (bymonthday == null) {
    const dayRangeMatch = lower.match(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:through|to|-)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (dayRangeMatch && /\bevery\s+\d+\s+months?\b/.test(lower)) {
      const startDay = parseInt(dayRangeMatch[1], 10);
      const endDay = parseInt(dayRangeMatch[2], 10);
      if (!Number.isNaN(startDay) && !Number.isNaN(endDay) && startDay >= 1 && endDay <= 31 && startDay <= endDay) {
        bymonthday = Array.from({ length: endDay - startDay + 1 }, (_, index) => startDay + index);
        freq = RRule.MONTHLY;
      }
    }
  }
  if (bymonthday == null) {
    const explicitDayOfMonthMatch = lower.match(/\bon\s+day\s+(\d{1,2})\b/);
    if (explicitDayOfMonthMatch) {
      const day = parseInt(explicitDayOfMonthMatch[1], 10);
      if (!Number.isNaN(day) && day >= 1 && day <= 31) {
        bymonthday = [day];
      }
    }
  }
  if (byyearday == null && /\bon\s+(?:the\s+)?\d+(?:st|nd|rd|th)?(?:\s*,\s*\d+(?:st|nd|rd|th)?)*(?:\s*,?\s*and\s+\d+(?:st|nd|rd|th)?)?\s+day\b/.test(lower)) {
    const yeardayListMatch = lower.match(/\bon\s+(?:the\s+)?(.+?)\s+day\b/);
    if (yeardayListMatch) {
      const listText = yeardayListMatch[1]
        .replace(/\band\b/g, ',')
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
      const parsedDays = listText
        .map((token) => parseInt(token.replace(/(st|nd|rd|th)$/i, ''), 10))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 366);
      if (parsedDays.length > 0) {
        byyearday = Array.from(new Set(parsedDays)).sort((a, b) => a - b);
        freq = RRule.YEARLY;
      }
    }
  }
  if (byyearday != null) {
    bymonthday = null;
    bymonth = null;
  }
  if (/\bevery\s+other\s+month\s+on\s+all\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/.test(lower)) {
    const match = lower.match(/\bevery\s+other\s+month\s+on\s+all\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/);
    const weekdayToken = match ? WEEKDAY_NAME_MAP[match[1]] : null;
    if (weekdayToken) {
      freq = RRule.MONTHLY;
      interval = 2;
      foundDays = [RRule[weekdayToken]];
      bysetpos = null;
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
  if (monthlyOnOrdinalWeekdayMatch && !/\bafter\s+first\s+sunday\b/.test(lower)) {
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
    const ordinalToken = simpleOrdinalWeekdayMatch ? simpleOrdinalWeekdayMatch[1].toLowerCase() : null;
    const hasExplicitMonthContext = /\bmonth\b/.test(lower);
    const isImplicitMonthlyToken = ordinalToken === 'first' || ordinalToken === '1st' || ordinalToken === 'last';
    if (
      simpleOrdinalWeekdayMatch &&
      bymonthday == null &&
      (hasExplicitMonthContext || isImplicitMonthlyToken) &&
      !/\bweek\b/.test(lower) &&
      !/\bweekday\b/.test(lower) &&
      !/\bafter\s+first\s+sunday\b/.test(lower)
    ) {
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
  if (!Number.isFinite(interval) || interval <= 0 || interval > 10000) return null;

  // Don't strip frequency words - they're needed for proper parsing
  // Only strip specific patterns that interfere with chrono parsing
  const stripped = processedText
    .replace(/\b(of\s+(each|every)\s+month)\b/gi, '')
    .trim();

  const pick = parseChrono(stripped, effectiveNow) || chronoResult || null;
  const rawExplicitTime = extractExplicitTime(processedText);
  const explicitTime = rawExplicitTime;
  const dayPeriodTime = explicitTime ? null : extractDayPeriodTime(processedText);

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
    } else if (dayPeriodTime) {
      pick.start.assign('hour', dayPeriodTime.hour);
      pick.start.assign('minute', dayPeriodTime.minute ?? 0);
      pick.start.assign('second', 0);
      pick.start.assign('millisecond', 0);
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

  if (windowStart) {
    hour = windowStart.hour;
    minute = windowStart.minute;
  } else if (explicitTime && explicitTime.type === 'time') {
    hour = explicitTime.hour;
    minute = explicitTime.minute;
  } else if (explicitTime && explicitTime.type === 'hour-only' && (freq === RRule.HOURLY || freq === RRule.MINUTELY)) {
    hour = explicitTime.hour;
    minute = explicitTime.minute ?? 0;
  } else if (dayPeriodTime) {
    hour = dayPeriodTime.hour;
    minute = dayPeriodTime.minute;
  } else if (!hasExplicitStartReference && pick && pick.start.isCertain('hour')) {
    hour = pick.start.get('hour');
    minute = pick.start.isCertain('minute') ? pick.start.get('minute') : 0;
  } else if (hourlyAtHour != null && freq !== RRule.HOURLY && freq !== RRule.MINUTELY) {
    hour = hourlyAtHour;
    minute = explicitTime.minute ?? 0;
  } else if (explicitTime && explicitTime.type === 'hour-only') {
    hour = explicitTime.hour;
    minute = explicitTime.minute ?? 0;
  }

  if ((freq === RRule.HOURLY || freq === RRule.MINUTELY) && explicitTime && explicitTime.type === 'minute-offset') {
    minute = explicitTime.minute ?? minute ?? 0;
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
  const WEEKDAY_LOOKUP = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  if (/\bweek\s*day(s)?\b/.test(lower)) {
    // Monday through Friday
    byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
  } else if (/\bweekend(s)?\b/.test(lower)) {
    // Saturday and Sunday
    byweekday = [RRule.SA, RRule.SU];
  } else if (/\bevery\s+first\s+business\s+day\s+of\s+week\b/.test(lower)) {
    byweekday = [RRule.MO];
  } else if (/\bevery\s+last\s+business\s+day\s+of\s+week\b/.test(lower)) {
    byweekday = [RRule.FR];
  } else if (/\bwork(?:ing)?\s*day(s)?\b/.test(lower) || /\bbusiness\s+day(s)?\b/.test(lower)) {
    byweekday = BUSINESS_WEEKDAY_RULES.slice();
  } else if (foundDays.length > 0) {
    byweekday = foundDays;
  }

  const exclusionTokens = [];
  const exclusionMatcher = /\bexcept\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g;
  let exclusionMatch;
  while ((exclusionMatch = exclusionMatcher.exec(lower)) !== null) {
    exclusionTokens.push(exclusionMatch[1].toLowerCase());
  }
  if (/\bexcept\s+weekends?\b/.test(lower)) {
    byweekday = BUSINESS_WEEKDAY_RULES.slice();
  } else if (/\b(?:every\s+day|daily)\s+except\b/.test(lower)) {
    const excluded = new Set(exclusionTokens.map((token) => WEEKDAY_TOKEN_TO_RRULE_INDEX[token]).filter((v) => v != null));
    const allDays = ALL_WEEKDAY_RULES.filter((_, index) => !excluded.has(index));
    if (allDays.length > 0) {
      byweekday = allDays;
    }
  } else if (/\bweekday(s)?\s+except\b/.test(lower)) {
    const excluded = new Set(exclusionTokens.map((token) => WEEKDAY_TOKEN_TO_RRULE_INDEX[token]).filter((v) => v != null));
    const weekdays = BUSINESS_WEEKDAY_RULES.filter((_, index) => !excluded.has(index));
    if (weekdays.length > 0) {
      byweekday = weekdays;
    }
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
    if (hasExplicitStartReference) {
      const startWeekday = effectiveNow.getDay();
      byweekday = [RRule[WEEKDAY_LOOKUP[startWeekday]]];
    } else if (pick) {
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
    ? (
        hasExplicitStartTime && (freq === RRule.HOURLY || freq === RRule.MINUTELY)
          ? new Date(startingInfo.reference.getTime())
          : alignStart(new Date(startingInfo.reference.getTime()), hour, minute)
      )
    : effectiveNow;

  const skipFutureProjection =
    freq === RRule.YEARLY &&
    (
      (bymonth && bymonth.length > 0) ||
      (bymonthday && bymonthday.length > 0) ||
      (byweekday && byweekday.length > 0) ||
      (byyearday && byyearday.length > 0) ||
      (byweekno && byweekno.length > 0) ||
      bysetpos != null
    );
  const skipWeeklyProjection = freq === RRule.WEEKLY && byweekday.length > 0;
  if (!skipFutureProjection && !skipWeeklyProjection) {
    start = ensureFutureDate(start, comparisonNow, freq, interval);
  }
  if (until && until <= start) {
    until = null;
  }
  const untilValue = count != null ? undefined : (until ?? undefined);
  let ruleHour = start.getUTCHours();
  let ruleMinute = start.getUTCMinutes();

  if (monthlyOrdinal) {
    // Create a temporary rule to find the first occurrence
    const tempRule = new RRule({
      freq: RRule.MONTHLY,
      interval,
      wkst: weekStart ?? undefined,
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
        wkst: weekStart ?? undefined,
        byweekday,
        bysetpos: bysetpos ?? 1,
        byhour: occurrenceHourUTC,
        byminute: occurrenceMinuteUTC,
        dtstart: alignedOccurrence,
        count: count ?? undefined,
        until: untilValue
      });

      return buildResult(finalRule, alignedOccurrence);
    }
    
    // Fallback to original if no occurrence found
    return buildResult(
      new RRule({
        freq: RRule.MONTHLY,
        interval,
        wkst: weekStart ?? undefined,
        byweekday,
        bysetpos: bysetpos ?? 1,
        byhour: start.getUTCHours(),
        byminute: start.getUTCMinutes(),
        dtstart: start,
        count: count ?? undefined,
        until: untilValue
      }),
      start
    );
  }

  if (freq === RRule.MONTHLY && bymonthday) {
    // Create a temporary rule to find the first occurrence
    const tempRule = new RRule({
      freq: RRule.MONTHLY,
      interval,
      wkst: weekStart ?? undefined,
      bymonthday,
      byweekday: byweekday.length > 0 ? byweekday : undefined,
      byhour: start.getUTCHours(),
      byminute: start.getUTCMinutes(),
      dtstart: start,
      until: untilValue
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
        interval,
        wkst: weekStart ?? undefined,
        bymonthday,
        byweekday: byweekday.length > 0 ? byweekday : undefined,
        byhour: occurrenceHourUTC,
        byminute: occurrenceMinuteUTC,
        dtstart: alignedOccurrence,
        count: count ?? undefined,
        until: untilValue
      });

      return buildResult(finalRule, alignedOccurrence);
    }
    
    // Fallback to original if no occurrence found
    return buildResult(
      new RRule({
        freq: RRule.MONTHLY,
        interval,
        wkst: weekStart ?? undefined,
        bymonthday,
        byweekday: byweekday.length > 0 ? byweekday : undefined,
        byhour: start.getUTCHours(),
        byminute: start.getUTCMinutes(),
        dtstart: start,
        count: count ?? undefined,
        until: untilValue
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
    const weeklyComparisonNow =
      startOffsetUnit != null && startingInfo.reference && !hasExplicitStartTime
        ? new Date(startingInfo.reference.getTime())
        : comparisonNow;
    const reference = start <= weeklyComparisonNow ? weeklyComparisonNow : start;
      let bestStart = null;

      targetJsDays.forEach((targetDay) => {
        const referenceDate = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
        let offset = (targetDay - reference.getDay() + 7) % 7;
        const candidateDate = new Date(referenceDate.getTime());
        candidateDate.setDate(candidateDate.getDate() + offset);
        let candidateStart = alignStart(candidateDate, hour, minute);

        const shouldPushNextWeek = hasExplicitStartReference
          ? candidateStart < weeklyComparisonNow
          : candidateStart <= weeklyComparisonNow;
        if (shouldPushNextWeek) {
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
    return buildResult(
      new RRule({
        freq: RRule.WEEKLY,
        interval,
        wkst: weekStart ?? undefined,
        byweekday,
        byhour: weeklyHour,
        byminute: weeklyMinute,
        dtstart: start,
        count: count ?? undefined,
        until: untilValue
      }),
      start
    );
  }

  if (freq === RRule.YEARLY) {
    // For yearly patterns, use the parsed date as the start date
    let yearlyStart = (!hasExplicitStartReference && pick) ? pick.date() : start;
    yearlyStart = alignStart(yearlyStart, hour, minute);
    const requiresProjection = !(
      (bymonth && bymonth.length > 0) ||
      (bymonthday && bymonthday.length > 0) ||
      (byweekday && byweekday.length > 0) ||
      (byyearday && byyearday.length > 0) ||
      (byweekno && byweekno.length > 0) ||
      bysetpos != null
    );
    if (requiresProjection) {
      yearlyStart = ensureFutureDate(yearlyStart, effectiveNow, RRule.YEARLY, interval);
    }
    let yearlyHour = yearlyStart.getUTCHours();
    let yearlyMinute = yearlyStart.getUTCMinutes();

    if (
      (!hasExplicitStartReference || startOffsetUnit != null) &&
      (
        bymonth != null ||
        bysetpos != null ||
        (byweekday && byweekday.length > 0) ||
        (bymonthday && bymonthday.length > 0) ||
        (byyearday && byyearday.length > 0) ||
        (byweekno && byweekno.length > 0)
      )
    ) {
      try {
        const tempRule = new RRule({
          freq: RRule.YEARLY,
          interval,
          wkst: weekStart ?? undefined,
          byweekday: byweekday.length > 0 ? byweekday : undefined,
          bysetpos: bysetpos ?? undefined,
          bymonth: bymonth ?? undefined,
          bymonthday: bymonthday ?? undefined,
          byyearday: byyearday ?? undefined,
          byweekno: byweekno ?? undefined,
          byhour: yearlyHour,
          byminute: yearlyMinute,
          dtstart: yearlyStart,
          until: untilValue
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
    return buildResult(
      new RRule({
        freq: RRule.YEARLY,
        interval,
        wkst: weekStart ?? undefined,
        byhour: yearlyHour,
        byminute: yearlyMinute,
        byweekday: byweekday.length > 0 ? byweekday : undefined,
        bysetpos: bysetpos ?? undefined,
        bymonth: bymonth ?? undefined,
        bymonthday: bymonthday ?? undefined,
        byyearday: byyearday ?? undefined,
        byweekno: byweekno ?? undefined,
        dtstart: yearlyStart,
        count: count ?? undefined,
        until: untilValue
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
    wkst: weekStart ?? undefined,
    dtstart: start,
    count: count ?? undefined,
    until: untilValue
  };

  if (byweekday.length > 0) {
    options.byweekday = byweekday;
  }

  if (bymonth != null) {
    options.bymonth = bymonth;
  }

  if (bymonthday != null) {
    options.bymonthday = bymonthday;
  }

  if (byyearday != null) {
    options.byyearday = byyearday;
  }

  if (byweekno != null) {
    options.byweekno = byweekno;
  }

  if (bysetpos != null && freq !== RRule.WEEKLY && freq !== RRule.DAILY) {
    options.bysetpos = bysetpos;
  }

  if (windowHours && windowHours.length > 0) {
    const utcHours = new Set();
    windowHours.forEach((localHour) => {
      const localSample = new Date(start.getTime());
      localSample.setHours(localHour, minute ?? 0, 0, 0);
      utcHours.add(localSample.getUTCHours());
    });
    options.byhour = Array.from(utcHours).sort((a, b) => a - b);
  }

  if (freq === RRule.HOURLY) {
    options.byminute = [ruleMinute];
    options.bysecond = [ruleSecond];
  } else if (freq === RRule.MINUTELY) {
    options.bysecond = [ruleSecond];
  } else {
    if (options.byhour == null) {
      options.byhour = [ruleHour];
    }
    options.byminute = [ruleMinute];
  }
  return buildResult(new RRule(options), start);
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
