// Type-only stand-in for @react-navigation/native. Shared app/src/types imports
// NavigatorScreenParams for the app's navigators; the web uses React Router and
// never bundles this (type imports are erased).
export type NavigatorScreenParams<ParamList> = {
	[K in keyof ParamList]: undefined extends ParamList[K]
		? { screen: K; params?: ParamList[K] }
		: { screen: K; params: ParamList[K] };
}[keyof ParamList];
