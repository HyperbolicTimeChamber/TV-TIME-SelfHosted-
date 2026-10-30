/** Fields of a Cloud Billing budget Pub/Sub notification that the guard reads */
export interface BudgetNotification {
  budgetDisplayName?: string;
  costAmount?: number;
  budgetAmount?: number;
  currencyCode?: string;
}

/** Cut billing once the month's cost reaches the budget (malformed messages never cut) */
export function shouldCutBilling(n: BudgetNotification | null | undefined): boolean {
  const cost = n?.costAmount;
  const budget = n?.budgetAmount;
  if (typeof cost !== "number" || typeof budget !== "number" || budget <= 0) return false;
  return cost >= budget;
}
