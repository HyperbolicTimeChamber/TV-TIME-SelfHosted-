/** The pager sits somewhere other than the focused tab's page (more than `tolerance` tabs off) */
export function isTabDesynced(expectedIndex: number, position: number, tolerance: number): boolean {
	return !Number.isFinite(position) || Math.abs(position - expectedIndex) > tolerance;
}
