const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;

const WEEKDAYS_NARROW = ["S", "M", "T", "W", "T", "F", "S"] as const;

function toDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCount(value: number) {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatShortMonth(value: string | Date) {
  const date = toDate(value);
  return date ? MONTHS_SHORT[date.getMonth()] : "--";
}

export function formatWeekdayNarrow(value: string | Date) {
  const date = toDate(value);
  return date ? WEEKDAYS_NARROW[date.getDay()] : "-";
}

export function formatMonthDay(value: string | Date | null | undefined) {
  const date = toDate(value);
  return date ? `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}` : "Not set";
}

export function formatMediumDate(value: string | Date | null | undefined) {
  const date = toDate(value);
  return date
    ? `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    : "Not set";
}

export function formatDateTime(value: string | Date | null | undefined) {
  const date = toDate(value);
  if (!date) {
    return "Not set";
  }

  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hours24 >= 12 ? "PM" : "AM";

  return `${formatMediumDate(date)} ${hours12}:${minutes} ${meridiem}`;
}
