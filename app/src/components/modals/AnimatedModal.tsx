import React, { useEffect, useRef, useState } from "react";
import {
	Modal,
	View,
	Pressable,
	Animated,
	Keyboard,
	Platform,
	StyleSheet,
	ModalProps,
} from "react-native";
import { colors, themedStyles } from "../../theme";

interface Props extends Pick<ModalProps, "onRequestClose"> {
	visible: boolean;
	onClose: () => void;
	children: React.ReactNode;
	/** Near full width (e.g. a day's cards) instead of the 320px dialog */
	wide?: boolean;
	/** false: a tap outside / back does nothing (e.g. while an export runs) — it closes only by
	 *  `visible` going false. An outside tap used to fade it out while it stayed open */
	dismissable?: boolean;
}

const DURATION = 250;
/** How long the popup takes to rise above / settle back from the keyboard */
const KEYBOARD_SHIFT_MS = 200;

export default function AnimatedModal({
	visible,
	onClose,
	onRequestClose,
	children,
	wide,
	dismissable = true,
}: Props) {
	const opacity = useRef(new Animated.Value(0)).current;
	const scale = useRef(new Animated.Value(0.85)).current;
	// Touches only count once the open animation is done: a popup opened by a long press
	// appears under the finger, and lifting it must not press whatever button is there
	const [armed, setArmed] = useState(false);
	useEffect(() => {
		if (!visible) {
			setArmed(false);
			return;
		}
		const t = setTimeout(() => setArmed(true), DURATION);
		return () => clearTimeout(t);
	}, [visible]);

	// Keyboard up (a text field in the popup): rise by half its height, so the popup is centred
	// in the space left above it. A Modal isn't resized for the keyboard (edge-to-edge Android),
	// so KeyboardAvoidingView / adjustResize leave the field under it
	const lift = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		if (!visible) {
			lift.setValue(0);
			return;
		}
		const shift = (to: number, duration = KEYBOARD_SHIFT_MS) =>
			Animated.timing(lift, { toValue: to, duration, useNativeDriver: true }).start();
		const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
		const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
		const show = Keyboard.addListener(showEvent, (e) =>
			shift(-e.endCoordinates.height / 2, e.duration || KEYBOARD_SHIFT_MS),
		);
		const hide = Keyboard.addListener(hideEvent, (e) => shift(0, e?.duration || KEYBOARD_SHIFT_MS));
		return () => {
			show.remove();
			hide.remove();
		};
	}, [visible, lift]);

	useEffect(() => {
		if (visible) {
			Animated.parallel([
				Animated.timing(opacity, {
					toValue: 1,
					duration: DURATION,
					useNativeDriver: true,
				}),
				Animated.spring(scale, {
					toValue: 1,
					damping: 18,
					stiffness: 200,
					useNativeDriver: true,
				}),
			]).start();
		} else {
			opacity.setValue(0);
			scale.setValue(0.85);
		}
	}, [visible, opacity, scale]);

	const handleClose = () => {
		Animated.parallel([
			Animated.timing(opacity, {
				toValue: 0,
				duration: 180,
				useNativeDriver: true,
			}),
			Animated.timing(scale, {
				toValue: 0.85,
				duration: 180,
				useNativeDriver: true,
			}),
		]).start(() => onClose());
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			onRequestClose={dismissable ? (onRequestClose ?? handleClose) : () => {}}
		>
			<View style={styles.overlay}>
				{/* Tap-outside-to-close sits behind the box, not around it: a touch responder around the
				    content (it had a Pressable to swallow inner taps) took blank-space touches and
				    cancelled gesture-handler gestures inside — the Calendar popup's day swipe */}
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={armed && dismissable ? handleClose : undefined}
				/>
				<Animated.View
					pointerEvents={armed ? "auto" : "none"}
					style={[
						styles.content,
						wide && styles.wide,
						{ opacity, transform: [{ translateY: lift }, { scale }] },
					]}
				>
					{children}
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: colors.overlayMedium,
		justifyContent: "center",
		alignItems: "center",
	},
	content: {
		width: "80%",
		maxWidth: 320,
	},
	wide: { width: "92%", maxWidth: 560 },
}));
