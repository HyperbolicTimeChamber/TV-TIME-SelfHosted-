// Web stand-in for expo-file-system's File: `uri` is an object URL from a file input
export class File {
	constructor(private readonly uri: string) {}

	async arrayBuffer(): Promise<ArrayBuffer> {
		const res = await fetch(this.uri);
		return res.arrayBuffer();
	}
}
