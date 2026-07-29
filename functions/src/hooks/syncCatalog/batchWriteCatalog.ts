export async function batchWriteCatalog(
	db: FirebaseFirestore.Firestore,
	pendingWrites: Array<{
		ref: FirebaseFirestore.DocumentReference;

		data: Record<string, any>;
	}>,
): Promise<void> {
	for (let i = 0; i < pendingWrites.length; i += 500) {
		const writeBatch = db.batch();
		const chunk = pendingWrites.slice(i, i + 500);
		for (const { ref, data } of chunk) {
			writeBatch.set(ref, data, { merge: true });
		}
		await writeBatch.commit();
	}
	console.log(`Updated ${pendingWrites.length} catalog docs`);
}
