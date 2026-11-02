import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { loadThemePrefs } from './src/theme/prefs';
import { isLightTheme, useThemeVersion } from './src/theme';

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

// registerRootComponent calls AppRegistry.registerComponent('main', () => Root);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
