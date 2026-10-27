import React from "react";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../../../theme";
import { RING_SIZE, RING_STROKE } from "./styles";

const R = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Small progress ring for the yellow pill — dark stroke, faint track */
export default function ProgressRing({ percent }: { percent: number }) {
	const offset = CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, percent)) / 100);
	return (
		<Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: "-90deg" }] }}>
			<Circle
				cx={RING_SIZE / 2}
				cy={RING_SIZE / 2}
				r={R}
				// Unwatched part: a faint version of the filled stroke so the two read apart
				stroke={`${colors.surface}38`}
				strokeWidth={RING_STROKE}
				fill="none"
			/>
			<Circle
				cx={RING_SIZE / 2}
				cy={RING_SIZE / 2}
				r={R}
				stroke={colors.surface}
				strokeWidth={RING_STROKE}
				strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
				strokeDashoffset={offset}
				strokeLinecap="round"
				fill="none"
			/>
		</Svg>
	);
}
