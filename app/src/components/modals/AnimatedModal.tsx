import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Pressable, Animated, StyleSheet, ModalProps } from "react-native";
import { colors } from "../../theme";

interface Props extends Pick<ModalProps, "onRequestClose"> {
	visible: boolean;
	onClose: () => void;
	children: React.ReactNode;
	/** Near full width (e.g. a day's cards) instead of the 320px dialog */
	wide?: boolean;
}

const DURATION = 250;

export default function AnimatedModal({ visible, onClose, onRequestClose, children, wide }: Props) {
	const opacity = useRef(new Animated.Value(0)).current;
	const scale = useRef(new Animated.Value(0.85)).current;
	// Touches only count once the open animation is done: a popup opened by a long press
	// appears under the finger, and lifting it must not press whatever button is there
	// (it paused shows by accident)
	const [armed, setArmed] = useState(false);
	useEffect(() => {
		if (!visible) {
			setArmed(false);
			return;
		}
		const t = setTimeout(() => setArmed(true), DURATION);
		return () => clearTimeout(t);
	}, [visible]);

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
			onRequestClose={onRequestClose ?? handleClose}
		>
			<Pressable style={styles.overlay} onPress={armed ? handleClose : undefined}>
				<Animated.View
					pointerEvents={armed ? "auto" : "none"}
					style={[styles.content, wide && styles.wide, { opacity, transform: [{ scale }] }]}
				>
					<Pressable onPress={() => {}}>{children}</Pressable>
				</Animated.View>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
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
});
