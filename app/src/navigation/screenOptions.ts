import { colors } from "../theme";

export const stackScreenOptions = {
	headerStyle: { backgroundColor: colors.background },
	headerTintColor: colors.text,
	headerTitleStyle: { fontWeight: "600" as const },
	headerBackTitle: "",
	contentStyle: { backgroundColor: colors.background },
};

/**
 * Screens with a swipe-back (SwipeBackView / Watch History's pager): a transparent modal keeps the
 * screen underneath drawn, so the swipe reveals it — a regular native-stack push leaves it black
 */
export const swipeBackScreenOptions = {
	headerShown: false,
	presentation: "transparentModal" as const,
	animation: "slide_from_right" as const,
	contentStyle: { backgroundColor: "transparent" },
};
