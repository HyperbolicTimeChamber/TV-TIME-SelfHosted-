import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { defineBoolean } from "firebase-functions/params";
import { applicationDefault } from "firebase-admin/app";
import { logger } from "firebase-functions";
import axios from "axios";
import { BILLING_BUDGET_TOPIC } from "../shared/enums";
import {
  shouldCutBilling,
  type BudgetNotification,
} from "../hooks/budgetGuard";

/**
 * Off switch for a runaway bill. false → only logs. When true and the budget's cost reaches
 * its amount, billing is unlinked: the project drops to the free Spark limits and Functions /
 * paid usage stop until billing is re-linked by hand in the console.
 */
const KILL_SWITCH = defineBoolean("BILLING_KILL_SWITCH", { default: false });

/**
 * Cloud Billing budget → Pub/Sub → here. Budget notifications arrive several times a day with
 * the month's running cost; Google's alerts alone never stop spending on Blaze.
 * Needs the runtime service account to hold Project Billing Manager on this project.
 */
export const budgetGuard = onMessagePublished(
  { topic: BILLING_BUDGET_TOPIC, maxInstances: 1, retry: false },
  async (event) => {
    const data = event.data.message.json as BudgetNotification;
    if (!shouldCutBilling(data)) return;

    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
    if (!KILL_SWITCH.value()) {
      logger.error("Budget exceeded — kill switch off, billing left on", {
        projectId,
        ...data,
      });
      return;
    }

    const { access_token } = await applicationDefault().getAccessToken();
    const url = `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`;
    const headers = { Authorization: `Bearer ${access_token}` };
    const { data: info } = await axios.get(url, { headers });
    if (!info.billingEnabled) return;

    logger.error("Budget exceeded — disabling billing", {
      projectId,
      ...data,
    });
    await axios.put(url, { billingAccountName: "" }, { headers });
  },
);
