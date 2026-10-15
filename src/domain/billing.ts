import { Temporal } from '@js-temporal/polyfill';
export type Cadence = 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly' | 'custom';
/** Inclusive local date start, exclusive local date end. Weekly/biweekly start is an explicit anchor. */
export function billingBoundary(start: string, timezone: string, cadence: Cadence, customEnd?: string): { start: string; end: string } {
 const date = Temporal.PlainDate.from(start);
 const end = cadence === 'custom' ? Temporal.PlainDate.from(customEnd ?? '') : cadence === 'weekly' ? date.add({ days: 7 }) : cadence === 'biweekly' ? date.add({ days: 14 }) : cadence === 'monthly' ? date.with({ day: 1 }).add({ months: 1 }) : date.day <= 15 ? date.with({ day: 16 }) : date.with({ day: 1 }).add({ months: 1 });
 if (cadence === 'monthly' && date.day !== 1 || cadence === 'semi-monthly' && ![1,16].includes(date.day)) throw new Error('Invalid cutoff anchor');
 if (Temporal.PlainDate.compare(end, date) <= 0) throw new Error('End must follow start');
 return { start: date.toZonedDateTime(timezone).toInstant().toString(), end: end.toZonedDateTime(timezone).toInstant().toString() };
}
/** Round each line half-up to currency minor units; never use binary float money. */
export function amountForSeconds(hourlyMinor: bigint, seconds: number): bigint {
 if (hourlyMinor < 0n || !Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Invalid amount or duration');
 return (hourlyMinor * BigInt(seconds) + 1800n) / 3600n;
}
export function sumMoney(lines: readonly { currency: string; minor: bigint }[], currency: string): bigint {
 if (!/^[A-Z]{3}$/.test(currency) || lines.some(l => l.currency !== currency)) throw new Error('One explicit currency per invoice required');
 return lines.reduce((sum,l) => sum + l.minor, 0n);
}
