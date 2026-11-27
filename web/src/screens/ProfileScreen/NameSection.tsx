import { useState, type FormEvent } from "react";
import { DISPLAY_NAME_MAX } from "@app/enums";
import { useLocalProfile, useLocalProfileStore } from "@app/stores/localProfileStore";
import { cleanDisplayName, displayNameOf } from "@app/utils/localProfile";
import { useAppSelector } from "../../store";
import styles from "./styles/SettingsPlaceholder.module.scss";

/** Settings -> Profile -> Name (app NameSection): what the profile calls you, kept in this browser */
export default function NameSection() {
	const user = useAppSelector((s) => s.auth.user);
	const local = useLocalProfile(user?.uid);
	const shown = displayNameOf(local, user?.displayName);
	// What is typed; null = untouched, so the box shows the current name
	const [draft, setDraft] = useState<string | null>(null);
	const typed = draft === null ? null : cleanDisplayName(draft);
	const changed = draft !== null && typed !== null && typed !== shown;

	const keep = (name: string | null) => {
		if (!user) return;
		void useLocalProfileStore.getState().save(user.uid, { name });
		setDraft(null);
	};
	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (changed) keep(typed);
	};

	return (
		<section className={styles.section}>
			<h2 className={styles.sectionTitle}>Name</h2>
			<div className={styles.nameBody}>
				<form className={styles.nameRow} onSubmit={submit}>
					<input
						className={styles.nameInput}
						value={draft ?? shown}
						onChange={(e) => setDraft(e.target.value)}
						maxLength={DISPLAY_NAME_MAX}
						placeholder="Your name"
						aria-label="Your name"
					/>
					<button type="submit" className={styles.saveButton} disabled={!changed}>
						Save
					</button>
				</form>
				<span className={styles.rowHint}>Saved in this browser only.</span>
				{local.name && (
					<button type="button" className={styles.linkButton} onClick={() => keep(null)}>
						Use account name
					</button>
				)}
			</div>
		</section>
	);
}
