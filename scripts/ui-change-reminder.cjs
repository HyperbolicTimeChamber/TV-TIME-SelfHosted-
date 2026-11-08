#!/usr/bin/env node
// PostToolUse hook for Telegram sessions (scripts/telegram-settings.json): after an edit to a UI file,
// reminds Claude to send a screenshot, or a GIF / video when the edit touches motion. At most once
// per session every few minutes. A hook can't capture the right screen itself, so it only reminds.
const fs = require("fs");
const os = require("os");
const path = require("path");

const REMIND_EVERY_MS = 5 * 60 * 1000;
const UI_FILE =
	/(^|[\\/])(app[\\/]src[\\/].*\.tsx|web[\\/]src[\\/].*\.(tsx|scss)|app[\\/]modules[\\/].*[\\/]res[\\/].*\.xml)$/;
const MOTION =
	/withTiming|withSpring|withSequence|useAnimatedStyle|entering=|exiting=|FadeIn|FadeOut|@keyframes|animation:|transition:|motion\.|indeterminate/;

function run(raw) {
	const input = JSON.parse(raw);
	const file = input.tool_input?.file_path ?? "";
	if (!UI_FILE.test(file)) return;

	const stamp = path.join(os.tmpdir(), `claude-ui-reminder-${String(input.session_id ?? "x")}`);
	const last = fs.existsSync(stamp) ? fs.statSync(stamp).mtimeMs : 0;
	if (Date.now() - last < REMIND_EVERY_MS) return;
	fs.writeFileSync(stamp, "");

	const edited = `${input.tool_input?.new_string ?? ""}${input.tool_input?.content ?? ""}`;
	const proof = MOTION.test(edited) ? "a GIF or video of the motion" : "a screenshot";
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext: `UI file changed (${path.basename(file)}). When this change is done and verified, attach ${proof} of the real result to the Telegram reply.`,
			},
		}),
	);
}

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
	try {
		run(raw);
	} catch {
		// A reminder must never get in the way of an edit
	}
});
