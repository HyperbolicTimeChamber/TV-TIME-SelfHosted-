import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { PROFILE_PHOTO_MAX_BYTES } from "../enums";
import { useLocalProfileStore } from "../stores/localProfileStore";
import { photoExtension } from "../utils/localProfile";

/** The profile photo chosen on this device: a copy in the app's documents folder, never uploaded */

export enum PhotoPickResult {
	SAVED = "saved",
	CANCELED = "canceled",
	TOO_LARGE = "too_large",
	FAILED = "failed",
}

/** Only the file name is saved: the folder's path can differ after an app update */
export const profilePhotoUri = (fileName: string) => new File(Paths.document, fileName).uri;

function deletePhotoFile(fileName: string | null) {
	if (!fileName) return;
	try {
		const file = new File(Paths.document, fileName);
		if (file.exists) file.delete();
	} catch {}
}

/** The user picks an image from their library; a copy becomes this account's photo on this device */
export async function chooseProfilePhoto(uid: string): Promise<PhotoPickResult> {
	try {
		const result = await DocumentPicker.getDocumentAsync({
			type: "image/*",
			copyToCacheDirectory: true,
			multiple: false,
		});
		const asset = result.assets?.[0];
		if (result.canceled || !asset) return PhotoPickResult.CANCELED;
		if (asset.size && asset.size > PROFILE_PHOTO_MAX_BYTES) return PhotoPickResult.TOO_LARGE;
		// A new name each time, so the old picture can't be served from the image cache
		const fileName = `profile-photo-${uid}-${Date.now()}.${photoExtension(asset.name, asset.mimeType)}`;
		const picked = new File(asset.uri);
		await picked.copy(new File(Paths.document, fileName));
		try {
			picked.delete();
		} catch {}
		const store = useLocalProfileStore.getState();
		await store.load(uid);
		const previous = useLocalProfileStore.getState().profile.photo;
		if (!(await store.save(uid, { photo: fileName }))) {
			deletePhotoFile(fileName);
			return PhotoPickResult.FAILED;
		}
		deletePhotoFile(previous);
		return PhotoPickResult.SAVED;
	} catch {
		return PhotoPickResult.FAILED;
	}
}

/** Back to the account's own photo */
export async function removeProfilePhoto(uid: string): Promise<void> {
	const store = useLocalProfileStore.getState();
	await store.load(uid);
	const previous = useLocalProfileStore.getState().profile.photo;
	if (await store.save(uid, { photo: null })) deletePhotoFile(previous);
}

/** Account deleted: the name and photo kept for it on this device go too */
export async function clearLocalProfile(uid: string): Promise<void> {
	const store = useLocalProfileStore.getState();
	await store.load(uid);
	deletePhotoFile(useLocalProfileStore.getState().profile.photo);
	await store.clear(uid);
}
