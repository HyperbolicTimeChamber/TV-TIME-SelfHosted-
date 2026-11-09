// Extends app.json (versions stay there — CI bumps them). Project-specific values come from
// app/.env (gitignored; CI writes it from repo Secrets), so a fork builds against its own domain.
module.exports = ({ config }) => {
	const webBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL;
	if (!webBaseUrl) return config;
	return {
		...config,
		android: {
			...config.android,
			// Share links (https://<web>/show/...) open the app — App Links
			intentFilters: [
				{
					action: "VIEW",
					autoVerify: true,
					data: [{ scheme: "https", host: new URL(webBaseUrl).host, pathPrefix: "/show" }],
					category: ["BROWSABLE", "DEFAULT"],
				},
			],
		},
	};
};
