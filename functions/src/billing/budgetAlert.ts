import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { CloudBillingClient } from "@google-cloud/billing";

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
const PROJECT_NAME = `projects/${PROJECT_ID}`;
const billing = new CloudBillingClient();

interface BudgetAlertData {
  costAmount: number;
  budgetAmount: number;
  currencyCode: string;
  alertThresholdExceeded?: number;
  costIntervalStart?: string;
}

export const onBudgetAlert = onMessagePublished(
  "billing-alerts",
  async (event) => {
    const data = event.data.message.json as BudgetAlertData;

    if (!data.alertThresholdExceeded) {
      console.log("No threshold exceeded, ignoring.");
      return;
    }

    // Only kill billing if we hit 100% of budget
    if (data.alertThresholdExceeded < 1.0) {
      console.log(
        `Alert at ${data.alertThresholdExceeded * 100}% — not yet at 100%, skipping.`
      );
      return;
    }

    console.log(
      `Budget exceeded! Cost: ${data.costAmount} ${data.currencyCode}, ` +
        `Budget: ${data.budgetAmount} ${data.currencyCode}. Disabling billing.`
    );

    await disableBilling();
  }
);

async function disableBilling(): Promise<void> {
  const [info] = await billing.getProjectBillingInfo({ name: PROJECT_NAME });

  if (!info.billingEnabled) {
    console.log("Billing already disabled.");
    return;
  }

  await billing.updateProjectBillingInfo({
    name: PROJECT_NAME,
    projectBillingInfo: {
      billingAccountName: "",
    },
  });

  console.log("Billing disabled successfully.");
}
