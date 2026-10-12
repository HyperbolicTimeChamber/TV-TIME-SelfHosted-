import { motion } from "motion/react";
import {
  IoAlertCircleOutline,
  IoCloudOfflineOutline,
  IoFilmOutline,
  IoTvOutline,
  IoCompassOutline,
} from "react-icons/io5";
import { LoadErrorKind, MediaType } from "@app/enums";
import type { LoadErrorInfo } from "@app/utils/loadError";
import { colors } from "../theme";
import styles from "./ErrorState.module.css";

interface Action {
  label: string;
  onPress: () => void;
}

interface Props {
  info: LoadErrorInfo;
  /** Picks the not-found icon; omit for generic pages */
  mediaType?: MediaType;
  primary: Action;
  secondary?: Action;
}

/** Full-screen load failure (app ErrorState): icon, title, explanation, next steps */
export default function ErrorState({
  info,
  mediaType,
  primary,
  secondary,
}: Props) {
  const Icon =
    info.kind === LoadErrorKind.OFFLINE
      ? IoCloudOfflineOutline
      : info.kind === LoadErrorKind.SERVER
        ? IoAlertCircleOutline
        : mediaType === MediaType.MOVIE
          ? IoFilmOutline
          : mediaType === MediaType.TV
            ? IoTvOutline
            : IoCompassOutline;

  const showArt = info.kind === LoadErrorKind.NOT_FOUND;

  return (
    <>
      {showArt && (
        <motion.img
          src="/not-found.png"
          alt=""
          aria-hidden
          className={styles.art}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{
            type: "spring",
            damping: 11,
            stiffness: 90,
            delay: 0.12,
          }}
        />
      )}
      <motion.div
        className={`${styles.container} ${showArt ? styles.containerWithArt : ""}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 14, stiffness: 140 }}
        role="alert"
      >
        {!showArt && (
          <div className={styles.iconRing}>
            <Icon size={44} color={colors.textSecondary} />
          </div>
        )}
        <h1 className={styles.title}>{info.title}</h1>
        <p className={styles.message}>{info.message}</p>
        <button className={styles.primary} onClick={primary.onPress}>
          {primary.label}
        </button>
        {secondary && (
          <button className={styles.secondary} onClick={secondary.onPress}>
            {secondary.label}
          </button>
        )}
        {info.code && !showArt && <span className={styles.code}>Error {info.code}</span>}
      </motion.div>
    </>
  );
}
