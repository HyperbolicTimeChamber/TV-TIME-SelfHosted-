// The profile photo chosen in this browser: shrunk to a small JPEG data URL, never uploaded
import { PROFILE_PHOTO_MAX_BYTES } from "@app/enums";

/** Longest side of the saved copy: sharp full screen, small enough for localStorage */
const SAVED_PX = 640;
const SAVED_QUALITY = 0.85;

export enum PhotoReadError {
	TOO_LARGE = "too_large",
	UNREADABLE = "unreadable",
}

export async function readProfilePhoto(
	file: File,
): Promise<{ ok: true; dataUrl: string } | { ok: false; reason: PhotoReadError }> {
	if (file.size > PROFILE_PHOTO_MAX_BYTES) return { ok: false, reason: PhotoReadError.TOO_LARGE };
	try {
		const image = await createImageBitmap(file);
		const scale = Math.min(1, SAVED_PX / Math.max(image.width, image.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(image.width * scale));
		canvas.height = Math.max(1, Math.round(image.height * scale));
		const context = canvas.getContext("2d");
		if (!context) return { ok: false, reason: PhotoReadError.UNREADABLE };
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		image.close();
		return { ok: true, dataUrl: canvas.toDataURL("image/jpeg", SAVED_QUALITY) };
	} catch {
		return { ok: false, reason: PhotoReadError.UNREADABLE };
	}
}
