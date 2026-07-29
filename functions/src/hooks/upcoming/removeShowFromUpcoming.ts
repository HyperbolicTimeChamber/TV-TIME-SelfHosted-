export async function removeShowFromUpcoming(
	db: FirebaseFirestore.Firestore,
	uid: string,
	tmdbId: number,
): Promise<void> {
	const upcomingSnap = await db
		.collection(`users/${uid}/upcoming`)
		.where("tmdbShowId", "==", tmdbId)
		.get();

	if (upcomingSnap.size === 0) return;

	const batch = db.batch();
	for (const d of upcomingSnap.docs) batch.delete(d.ref);
	await batch.commit();
}
