// Web stand-in for mixpanel-react-native, backed by mixpanel-browser. Off in tests.
import mixpanel from "mixpanel-browser";

const enabled = import.meta.env.MODE !== "test";

export class Mixpanel {
	constructor(
		private token: string,
		private trackAutomaticEvents: boolean,
	) {}

	async init() {
		if (!enabled) return;
		mixpanel.init(this.token, {
			autocapture: this.trackAutomaticEvents,
			track_pageview: false,
			persistence: "localStorage",
		});
	}

	registerSuperProperties(properties: Record<string, unknown>) {
		if (enabled) mixpanel.register(properties);
	}

	track(eventName: string, properties?: Record<string, unknown>) {
		if (enabled) mixpanel.track(eventName, properties);
	}

	async identify(distinctId: string) {
		if (enabled) mixpanel.identify(distinctId);
	}

	reset() {
		if (enabled) mixpanel.reset();
	}
}
