import type { CSSProperties } from "react";

/**
 * Runtime values for Tailwind classes. Static styling lives in className; when a
 * value is only known at runtime (a prop size, a scroll offset) pass it as a CSS
 * variable and read it from the class, e.g. `cssVars({ "--size": "30px" })` +
 * `size-(--size)`.
 */
export const cssVars = (vars: Record<`--${string}`, string | number>): CSSProperties =>
	vars as CSSProperties;

export const px = (n: number) => `${n}px`;
