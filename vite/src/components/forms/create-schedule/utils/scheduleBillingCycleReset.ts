import { trialAnchorsBillingCycle } from "@autumn/shared";
import type {
	CustomerStateForm,
	CustomerStatePhase,
} from "@/components/forms/customer-state/customerStateSchema";
import { canScheduleFreeTrial } from "./scheduleFreeTrial";
import { firstPhaseStartsLater } from "./schedulePhaseTiming";

/** set_plans rejects any billing cycle anchor beside a trial it keeps or starts, unless the first phase backdates a trialing subscription. */
export const trialAnchorsScheduleBillingCycle = ({
	phases,
	nowMs,
	trialEnabled,
	liveSubscriptionTrialing,
	backdatesLiveSubscription,
}: {
	phases: CustomerStatePhase[];
	nowMs: number;
	trialEnabled: boolean;
	liveSubscriptionTrialing: boolean;
	backdatesLiveSubscription: boolean;
}) =>
	trialAnchorsBillingCycle({
		hasTrial:
			trialEnabled &&
			canScheduleFreeTrial({ phases, nowMs, liveSubscriptionTrialing }),
		backdatesTrialingSubscription:
			backdatesLiveSubscription && liveSubscriptionTrialing,
	});

/** How the first phase resets its cycle; a reset locked by a trial reads as off, so the request leaves the anchor out too. */
export const scheduleBillingCycleReset = ({
	formValues,
	nowMs,
	liveSubscriptionTrialing,
	backdatesLiveSubscription,
}: {
	formValues: Pick<
		CustomerStateForm,
		"phases" | "trialEnabled" | "resetBillingCycle" | "billingCycleAnchorMode"
	>;
	nowMs: number;
	liveSubscriptionTrialing: boolean;
	backdatesLiveSubscription: boolean;
}) => {
	const { phases, billingCycleAnchorMode } = formValues;
	const trialAnchorsBillingCycle = trialAnchorsScheduleBillingCycle({
		phases,
		nowMs,
		trialEnabled: formValues.trialEnabled,
		liveSubscriptionTrialing,
		backdatesLiveSubscription,
	});
	const resetBillingCycle =
		formValues.resetBillingCycle && !trialAnchorsBillingCycle;
	return {
		trialAnchorsBillingCycle,
		resetBillingCycle,
		resetsCycleNow:
			resetBillingCycle &&
			billingCycleAnchorMode === "now" &&
			!backdatesLiveSubscription &&
			!firstPhaseStartsLater({ phases, nowMs }),
		usesCustomAnchor: resetBillingCycle && billingCycleAnchorMode === "custom",
	};
};
