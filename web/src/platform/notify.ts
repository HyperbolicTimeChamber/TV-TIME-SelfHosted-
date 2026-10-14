// Bridge for Alert.alert from shared code → antd notifications (registered by the app shell)
type Notifier = (title: string, message?: string) => void;

let notifier: Notifier = (title, message) => console.warn(title, message);

export function setNotifier(fn: Notifier) {
	notifier = fn;
}

export function notify(title: string, message?: string) {
	notifier(title, message);
}
