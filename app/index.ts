import { registerRootComponent } from 'expo';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { handleUpdateMessage } from './src/services/updateNotifications';

import App from './App';

// In-app updates while the app is closed / in the background: the new-version push shows the
// app's update notification (native: its Upgrade downloads and installs without the app)
setBackgroundMessageHandler(getMessaging(), async (message) => {
	await handleUpdateMessage(message);
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
