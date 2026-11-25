import type { NumberLimit } from "./notifyConfig";

/** Math of the number slider: pure, so it is tested without a screen */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 0–1 position of a value on the slider track (values past the slider's end sit at the end) */
export function valueToFraction(value: number, limit: NumberLimit): number {
	if (limit.max <= limit.min) return 0;
	return clamp((value - limit.min) / (limit.max - limit.min), 0, 1);
}

/** The whole-number value at a 0–1 track position */
export function fractionToValue(fraction: number, limit: NumberLimit): number {
	return clamp(Math.round(limit.min + clamp(fraction, 0, 1) * (limit.max - limit.min)), limit.min, limit.max);
}

/** A track position from a touch x within a track `width` px wide (the thumb's centre follows the finger) */
export function touchToFraction(x: number, width: number, thumb: number): number {
	const usable = width - thumb;
	return usable <= 0 ? 0 : clamp((x - thumb / 2) / usable, 0, 1);
}

/**
 * What was typed beside the slider → a value, or null while it isn't a number yet (empty). Digits only (no minus
 * sign, no decimals), kept inside the limit: below the minimum rises to it, above the custom maximum falls to it
 */
export function parseTyped(text: string, limit: NumberLimit): number | null {
	const digits = text.replace(/\D/g, "");
	if (digits === "") return null;
	return clamp(parseInt(digits.slice(0, 6), 10), limit.min, limit.custom);
}

/** "1 day", "5 days"; `zero` replaces the text for 0 (e.g. "No limit") */
export function unitLabel(value: number, singular: string, plural = `${singular}s`, zero?: string): string {
	if (value === 0 && zero) return zero;
	return value === 1 ? singular : plural;
}
