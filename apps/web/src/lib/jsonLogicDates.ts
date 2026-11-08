/**
 * The date operators of the Semantius backend, for the rules the browser evaluates.
 *
 * These must give the same answers as the jl_date_* functions in the backend's
 * 0050_jsonlogic.sql. The cases in its 0100_test_jsonlogic.json run against both,
 * and computedFields.test.ts reads that file.
 *
 * Everything is integer arithmetic on UTC epoch seconds. `Date` is deliberately
 * absent: its parser reads a date-time with no offset in the browser's zone, and its
 * calendar methods would make a result depend on where the user is. date-fns works
 * in local time for the same reason, and its month difference treats month ends
 * differently from the backend's age().
 *
 * A value the backend would refuse throws here too. Both places that evaluate rules
 * catch it, so the form simply keeps what it had until the server refuses the save.
 */
import jsonLogic from 'json-logic-js'
import { DATE_DURATION, DATE_FORMAT_PATTERN, DATE_FORMAT_TOKEN, DATE_PARTS, DATE_UNITS } from 'sem-schema'

const SECONDS_PER_DAY = 86_400
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/
const WHOLE_NUMBER_TEXT = /^-?\d+(?:\.0+)?$/
const SUB_DAY = new Set(['hour', 'minute', 'second'])
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface Moment {
  /** Whole seconds since 1970-01-01 UTC. */
  epoch: number
  dateOnly: boolean
}

interface Civil {
  year: number
  month: number
  day: number
}

function refuse(code: string, operator: string, value: unknown): never {
  throw new Error(`${code}: ${operator} cannot use ${JSON.stringify(value) ?? 'nothing'}`)
}

const isBlank = (value: unknown): boolean => value === null || value === undefined || value === ''

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/** Days since 1970-01-01 of a calendar date, in the proleptic Gregorian calendar. */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yearOfEra = y - era * 400
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

function civilFromDays(days: number): Civil {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const dayOfEra = z - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  )
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153)
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9
  return {
    year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0),
    month,
    day: dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1,
  }
}

const daysOf = (epoch: number): number => Math.floor(epoch / SECONDS_PER_DAY)
const secondsOfDay = (epoch: number): number => epoch - daysOf(epoch) * SECONDS_PER_DAY
const civilOf = (epoch: number): Civil => civilFromDays(daysOf(epoch))

/** Monday is 1, as in ISO 8601. 1970-01-01 was a Thursday. */
const weekdayOf = (epoch: number): number => ((((daysOf(epoch) + 3) % 7) + 7) % 7) + 1

function dayEpoch(operator: string, value: string, year: number, month: number, day: number): number {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) refuse('22008', operator, value)
  return daysFromCivil(year, month, day) * SECONDS_PER_DAY
}

function offsetSeconds(offset: string | undefined): number {
  if (!offset || offset === 'Z') return 0
  const digits = offset.slice(1).replace(':', '')
  const seconds = Number(digits.slice(0, 2)) * 3600 + Number(digits.slice(2) || 0) * 60
  return offset.startsWith('-') ? -seconds : seconds
}

/** Fractions of a second are dropped on the way in, as the backend does. */
function parseMoment(operator: string, value: unknown): Moment {
  if (typeof value === 'string') {
    const date = DATE_ONLY.exec(value)
    if (date) {
      return { epoch: dayEpoch(operator, value, Number(date[1]), Number(date[2]), Number(date[3])), dateOnly: true }
    }
    const moment = DATE_TIME.exec(value)
    if (moment) {
      const hour = Number(moment[4])
      const minute = Number(moment[5])
      const second = Number(moment[6] ?? 0)
      if (hour > 23 || minute > 59 || second > 59) refuse('22008', operator, value)
      const day = dayEpoch(operator, value, Number(moment[1]), Number(moment[2]), Number(moment[3]))
      return { epoch: day + hour * 3600 + minute * 60 + second - offsetSeconds(moment[7]), dateOnly: false }
    }
  }
  return refuse('90915', operator, value)
}

function render(epoch: number, dateOnly: boolean): string {
  const { year, month, day } = civilOf(epoch)
  const date = `${pad(year, 4)}-${pad(month)}-${pad(day)}`
  if (dateOnly) return date
  const seconds = secondsOfDay(epoch)
  return `${date}T${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}+00:00`
}

function checkUnit(operator: string, unit: unknown, dateOnly: boolean): string {
  if (typeof unit !== 'string' || !DATE_UNITS.includes(unit) || (dateOnly && SUB_DAY.has(unit))) {
    return refuse('90916', operator, unit)
  }
  return unit
}

/** Months first and clamped to the end of the month, as PostgreSQL adds an interval. */
function addMonths(epoch: number, months: number): number {
  const { year, month, day } = civilOf(epoch)
  const total = year * 12 + (month - 1) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = total - nextYear * 12 + 1
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth))
  return daysFromCivil(nextYear, nextMonth, nextDay) * SECONDS_PER_DAY + secondsOfDay(epoch)
}

function wholeAmount(amount: unknown): number {
  const whole =
    (typeof amount === 'number' && Number.isInteger(amount)) ||
    (typeof amount === 'string' && WHOLE_NUMBER_TEXT.test(amount))
  return whole ? Number(amount) : refuse('90918', 'date_add', amount)
}

function addDuration(moment: Moment, duration: unknown): string {
  if (typeof duration === 'number') refuse('90916', 'date_add', null)
  const fields = typeof duration === 'string' ? DATE_DURATION.exec(duration) : null
  if (!fields) return refuse('90918', 'date_add', duration)
  const field = (index: number) => Number(fields[index] ?? 0)
  const time = field(5) * 3600 + field(6) * 60 + field(7)
  if (moment.dateOnly && time !== 0) refuse('90916', 'date_add', duration)
  const shifted = addMonths(moment.epoch, field(1) * 12 + field(2))
  return render(Math.floor(shifted + (field(3) * 7 + field(4)) * SECONDS_PER_DAY + time), moment.dateOnly)
}

function dateAdd(date: unknown, amount: unknown, unit?: unknown): string | null {
  if (isBlank(date) || isBlank(amount)) return null
  const moment = parseMoment('date_add', date)
  if (unit === undefined) return addDuration(moment, amount)

  const name = checkUnit('date_add', unit, moment.dateOnly)
  const count = wholeAmount(amount)
  const { epoch, dateOnly } = moment
  switch (name) {
    case 'year':
      return render(addMonths(epoch, count * 12), dateOnly)
    case 'quarter':
      return render(addMonths(epoch, count * 3), dateOnly)
    case 'month':
      return render(addMonths(epoch, count), dateOnly)
    case 'week':
      return render(epoch + count * 7 * SECONDS_PER_DAY, dateOnly)
    case 'day':
      return render(epoch + count * SECONDS_PER_DAY, dateOnly)
    case 'hour':
      return render(epoch + count * 3600, dateOnly)
    case 'minute':
      return render(epoch + count * 60, dateOnly)
    default:
      return render(epoch + count, dateOnly)
  }
}

/** A month has elapsed only when the day and time of the month have been reached again, as with age(). */
function elapsedMonths(later: number, earlier: number): number {
  const end = civilOf(later)
  const start = civilOf(earlier)
  const months = (end.year - start.year) * 12 + end.month - start.month
  const shortOfDay = end.day < start.day || (end.day === start.day && secondsOfDay(later) < secondsOfDay(earlier))
  return shortOfDay ? months - 1 : months
}

function dateDiff(end: unknown, start: unknown, unit: unknown): number | null {
  if (isBlank(end) || isBlank(start)) return null
  const name = checkUnit('date_diff', unit, false)
  const later = parseMoment('date_diff', end).epoch
  const earlier = parseMoment('date_diff', start).epoch

  // "+ 0" turns the -0 of a truncated small negative into the 0 the backend returns.
  if (name === 'year' || name === 'quarter' || name === 'month') {
    const months = later >= earlier ? elapsedMonths(later, earlier) : -elapsedMonths(earlier, later)
    return Math.trunc(months / (name === 'year' ? 12 : name === 'quarter' ? 3 : 1)) + 0
  }
  const seconds = { week: 604_800, day: SECONDS_PER_DAY, hour: 3600, minute: 60, second: 1 }[name] ?? 1
  return Math.trunc((later - earlier) / seconds) + 0
}

/** ISO week and year: a week belongs to the year that holds its Thursday. */
function isoWeekOf(epoch: number): { week: number; year: number } {
  const thursday = daysOf(epoch) + 4 - weekdayOf(epoch)
  const year = civilFromDays(thursday).year
  return { week: Math.floor((thursday - daysFromCivil(year, 1, 1)) / 7) + 1, year }
}

function datePart(date: unknown, part: unknown): number | null {
  if (isBlank(date)) return null
  const { epoch, dateOnly } = parseMoment('date_part', date)
  if (typeof part !== 'string' || !DATE_PARTS.includes(part) || (dateOnly && SUB_DAY.has(part))) {
    return refuse('90916', 'date_part', part)
  }
  const { year, month, day } = civilOf(epoch)
  const seconds = secondsOfDay(epoch)
  switch (part) {
    case 'year':
      return year
    case 'iso_year':
      return isoWeekOf(epoch).year
    case 'quarter':
      return Math.floor((month - 1) / 3) + 1
    case 'month':
      return month
    case 'week':
      return isoWeekOf(epoch).week
    case 'day':
      return day
    case 'weekday':
      return weekdayOf(epoch)
    case 'day_of_year':
      return daysOf(epoch) - daysFromCivil(year, 1, 1) + 1
    case 'hour':
      return Math.floor(seconds / 3600)
    case 'minute':
      return Math.floor(seconds / 60) % 60
    case 'second':
      return seconds % 60
    default:
      return epoch
  }
}

function dateTrunc(date: unknown, unit: unknown): string | null {
  if (isBlank(date)) return null
  const { epoch, dateOnly } = parseMoment('date_trunc', date)
  const name = checkUnit('date_trunc', unit, dateOnly)
  const { year, month } = civilOf(epoch)
  const days = daysOf(epoch) * SECONDS_PER_DAY
  const seconds = secondsOfDay(epoch)
  switch (name) {
    case 'year':
      return render(daysFromCivil(year, 1, 1) * SECONDS_PER_DAY, dateOnly)
    case 'quarter':
      return render(daysFromCivil(year, Math.floor((month - 1) / 3) * 3 + 1, 1) * SECONDS_PER_DAY, dateOnly)
    case 'month':
      return render(daysFromCivil(year, month, 1) * SECONDS_PER_DAY, dateOnly)
    case 'week':
      return render(days - (weekdayOf(epoch) - 1) * SECONDS_PER_DAY, dateOnly)
    case 'day':
      return render(days, dateOnly)
    case 'hour':
      return render(days + Math.floor(seconds / 3600) * 3600, dateOnly)
    case 'minute':
      return render(days + Math.floor(seconds / 60) * 60, dateOnly)
    default:
      return render(epoch, dateOnly)
  }
}

function toDate(value: unknown): string | null {
  if (isBlank(value)) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? render(Math.floor(value), true) : refuse('90915', 'to_date', value)
  }
  return render(parseMoment('to_date', value).epoch, true)
}

function renderToken(token: string, epoch: number): string {
  const { year, month, day } = civilOf(epoch)
  const seconds = secondsOfDay(epoch)
  const monthName = MONTHS[month - 1] ?? ''
  const weekdayName = WEEKDAYS[weekdayOf(epoch) - 1] ?? ''
  switch (token) {
    case 'YYYY':
      return pad(year, 4)
    case 'YY':
      return pad(year % 100)
    case 'Q':
      return String(Math.floor((month - 1) / 3) + 1)
    case 'MM':
      return pad(month)
    case 'Mon':
      return monthName.slice(0, 3)
    case 'Month':
      return monthName
    case 'DD':
      return pad(day)
    case 'Dy':
      return weekdayName.slice(0, 3)
    case 'Day':
      return weekdayName
    case 'HH24':
      return pad(Math.floor(seconds / 3600))
    case 'MI':
      return pad(Math.floor(seconds / 60) % 60)
    case 'SS':
      return pad(seconds % 60)
    default:
      return token
  }
}

function dateFormat(date: unknown, pattern: unknown): string | null {
  if (isBlank(date)) return null
  const { epoch, dateOnly } = parseMoment('date_format', date)
  if (typeof pattern !== 'string' || !DATE_FORMAT_PATTERN.test(pattern) || (dateOnly && /HH24|MI|SS/.test(pattern))) {
    return refuse('90917', 'date_format', pattern)
  }
  return (pattern.match(DATE_FORMAT_TOKEN) ?? []).map((token) => renderToken(token, epoch)).join('')
}

export function registerDateOperators(): void {
  jsonLogic.add_operation('date_add', dateAdd)
  jsonLogic.add_operation('date_diff', dateDiff)
  jsonLogic.add_operation('date_part', datePart)
  jsonLogic.add_operation('date_trunc', dateTrunc)
  jsonLogic.add_operation('to_date', toDate)
  jsonLogic.add_operation('date_format', dateFormat)
}
