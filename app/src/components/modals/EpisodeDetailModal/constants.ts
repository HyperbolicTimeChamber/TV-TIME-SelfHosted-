import { Dimensions, Animated, FlatList } from "react-native";

export const SCREEN_WIDTH = Dimensions.get("window").width;
export const CARD_WIDTH = SCREEN_WIDTH * 0.82;
export const CARD_GAP = 1;
export const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
export const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;
export const CARD_HEIGHT = Math.min(Dimensions.get("window").height * 0.55, 460);
export const IMAGE_HEIGHT = 180;

export const SIDE_SCALE = 0.88;
export const SIDE_ROTATE = "12deg";
export const SIDE_OPACITY = 1;

export const AnimatedFlatList = Animated.createAnimatedComponent(
	FlatList,
) as unknown as typeof FlatList;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(dateStr: string): string {
	const [y, m, d] = dateStr.split("-");
	return `${Number.parseInt(d, 10)} ${MONTHS[Number.parseInt(m, 10) - 1]} ${y}`;
}

export function epKey(s: number, e: number): string {
	return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
}
