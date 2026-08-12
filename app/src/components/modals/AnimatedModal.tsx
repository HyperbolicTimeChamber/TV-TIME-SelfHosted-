import React, { useEffect, useRef } from "react";
import { Modal, View, Pressable, Animated, StyleSheet, ModalProps } from "react-native";
import { colors } from "../../theme";

interface Props extends Pick<ModalProps, "onRequestClose"> {
	visible: boolean;
	onClose: () => void;
	children: React.ReactNode;
}

const DURATION = 250;

export default function AnimatedModal({ visible, onClose, onRequestClose, children }: Props) {
	const opacity = useRef(new Animated.Value(0)).current;
	const scale = useRef(new Animated.Value(0.85)).current;

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
			<Pressable style={styles.overlay} onPress={handleClose}>
				<Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
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
});
