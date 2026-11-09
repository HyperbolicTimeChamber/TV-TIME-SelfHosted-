import { IoCreateOutline, IoShareOutline, IoTrashOutline } from "react-icons/io5";
import type { CustomList } from "@app/types";
import { listCoverItem, titleCount } from "@app/utils/customLists";
import BottomSheet, { SheetGroup, SheetOption } from "../../components/BottomSheet";
import { colors } from "../../theme";
import styles from "./styles/ListsScreen.module.scss";

/**
 * A list's menu (app ListMenuSheet) — Lists page ⋮ on a card, and a list's own page ⋮: the list's
 * art behind, its name and count on top, rename / share grouped, delete on its own
 */
export default function ListMenuSheet({
	list,
	onRename,
	onShare,
	onDelete,
	onClose,
}: {
	list: CustomList | null;
	onRename: (list: CustomList) => void;
	onShare: (list: CustomList) => void;
	onDelete: (list: CustomList) => void;
	onClose: () => void;
}) {
	// Close first, then act — the next popup opens over the page, not the sheet
	const pick = (fn: (list: CustomList) => void) => () => {
		if (!list) return;
		onClose();
		fn(list);
	};
	return (
		<BottomSheet
			visible={!!list}
			label={list ? `Options for ${list.name}` : "List options"}
			onClose={onClose}
			art={list ? listCoverItem(list) : null}
		>
			{list && (
				<>
					{/* The art behind says which list; the header just names it (app ListMenuSheet) */}
					<div className={styles.menuHeader}>
						<span className={styles.rowText}>
							<span className={`${styles.rowName} ${styles.menuName}`}>{list.name}</span>
							<span className={styles.menuCount}>{titleCount(list.items.length)}</span>
						</span>
					</div>
					<SheetGroup>
						<SheetOption
							icon={IoCreateOutline}
							color={colors.accent}
							title="Rename list"
							onClick={pick(onRename)}
						/>
						<SheetOption
							icon={IoShareOutline}
							color={colors.accent}
							title="Share list"
							hint="As a file anyone can import"
							onClick={pick(onShare)}
						/>
					</SheetGroup>
					<div className={styles.menuGap} />
					<SheetGroup>
						<SheetOption
							icon={IoTrashOutline}
							color={colors.destructiveRed}
							title="Delete list"
							hint="Removes the list, not the titles"
							destructive
							onClick={pick(onDelete)}
						/>
					</SheetGroup>
				</>
			)}
		</BottomSheet>
	);
}
