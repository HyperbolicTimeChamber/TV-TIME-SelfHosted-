import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { loadThemePrefs } from './src/theme/prefs';
import { isLightTheme, useThemeVersion } from './src/theme';
import { handleUpdateMessage } from './src/services/updateNotifications';
import { configureAlertDisplay, handleAiringMessage } from './src/services/airingScheduler';
import './src/services/airingTask';

// The theme has to be applied before any styled module loads (StyleSheet.create copies colors
// at import), so the real app is required only once the saved theme is in place. The native
// splash screen stays up meanwhile (App.tsx keeps it until auth resolves).
function Root() {
	useThemeVersion(); // re-render (status bar icons) when the theme changes
	const [AppComponent, setAppComponent] = useState<React.ComponentType | null>(null);
	useEffect(() => {
		loadThemePrefs()
			.catch(() => undefined)
			.then(() => setAppComponent(() => require('./App').default));
	}, []);
	// StatusBar here (not in App) so every screen, import / login included, gets the right icon color
	return React.createElement(
		React.Fragment,
		null,
		React.createElement(StatusBar, { style: isLightTheme() ? 'dark' : 'light' }),
		AppComponent ? React.createElement(AppComponent) : null,
	);
}

// In-app updates while the app is closed / in the background: the new-version push shows the
// app's update notification (native: its Upgrade downloads and installs without the app)
setBackgroundMessageHandler(getMessaging(), async (message) => {
	// Day-ahead airing correction → patch the on-device alarms; otherwise a new-version push
	if (await handleAiringMessage(message)) return;
	await handleUpdateMessage(message);
});

// Alerts scheduled on the device show as a banner when the app is open too
configureAlertDisplay();

// registerRootComponent calls AppRegistry.registerComponent('main', () => Root);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
