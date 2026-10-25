import { useState } from "react";
import { App as AntApp, Button, Input } from "antd";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getFirebaseAuthErrorMessage } from "@app/hooks/getFirebaseAuthErrorMessage";
import GoogleLogo from "../../components/GoogleLogo";
import LoadingSpinner from "../../components/LoadingSpinner";
import {
	resetPassword,
	signInWithEmail,
	signInWithGoogle,
	signUpWithEmail,
} from "../../services/auth";
import { useAppSelector } from "../../store";
import { Paths } from "../../routes/paths";
import styles from "./styles/LoginScreen.module.scss";

const codeOf = (e: unknown) => (e as { code?: string }).code ?? "";

export default function LoginScreen() {
	const user = useAppSelector((s) => s.auth.user);
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const { message } = AntApp.useApp();
	const next = params.get("next") || Paths.HOME;

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSignUp, setIsSignUp] = useState(params.get("mode") === "signup");
	const [loading, setLoading] = useState(false);
	const [googleLoading, setGoogleLoading] = useState(false);
	const [resetting, setResetting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Signing in / up: the form gives way to a loader until the redirect (app twin)
	const signingIn = loading || googleLoading;
	const busy = signingIn || resetting;

	if (user) return <Navigate to={next} replace />;

	const handleEmailAuth = async () => {
		if (!email.trim() || !password.trim()) {
			setError("Please enter email and password.");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			await (isSignUp ? signUpWithEmail : signInWithEmail)(email.trim(), password);
			navigate(next, { replace: true });
		} catch (e) {
			setError(getFirebaseAuthErrorMessage(codeOf(e)));
			// Success keeps the loader up until the redirect
			setLoading(false);
		}
	};

	const handleGoogle = async () => {
		setGoogleLoading(true);
		setError(null);
		try {
			await signInWithGoogle();
			navigate(next, { replace: true });
		} catch (e) {
			if (codeOf(e) !== "auth/popup-closed-by-user") {
				setError(e instanceof Error ? e.message : "Google sign in failed");
			}
			setGoogleLoading(false);
		}
	};

	const handleForgotPassword = async () => {
		if (!email.trim()) {
			setError("Enter your email address first.");
			return;
		}
		setResetting(true);
		setError(null);
		try {
			await resetPassword(email.trim());
			message.success("Check your inbox for a password reset link.");
		} catch (e) {
			setError(getFirebaseAuthErrorMessage(codeOf(e)));
		} finally {
			setResetting(false);
		}
	};

	return (
		<div className={styles.container}>
			<img src="/logo.png" alt="Watchloom" className={styles.logo} />
			<p className={styles.subtitle}>Track What You Watch</p>

			{signingIn ? (
				<div className={styles.signingIn}>
					<LoadingSpinner />
					<p>{isSignUp && loading ? "Creating your account…" : "Signing you in…"}</p>
				</div>
			) : (
				<>
					<form
						className={styles.form}
						onSubmit={(e) => {
							e.preventDefault();
							handleEmailAuth();
						}}
					>
						<Input
							size="large"
							placeholder="Email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={busy}
							className={styles.input}
						/>
						<Input.Password
							size="large"
							placeholder="Password"
							autoComplete={isSignUp ? "new-password" : "current-password"}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							disabled={busy}
							className={styles.input}
						/>
						<Button type="primary" size="large" block htmlType="submit" disabled={busy}>
							{isSignUp ? "Sign Up" : "Sign In"}
						</Button>
						<button
							type="button"
							className={styles.toggle}
							onClick={() => {
								setIsSignUp(!isSignUp);
								setError(null);
							}}
							disabled={busy}
						>
							{isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
						</button>
						{!isSignUp && (
							<button
								type="button"
								className={styles.forgot}
								onClick={handleForgotPassword}
								disabled={busy}
							>
								Forgot Password?
							</button>
						)}
					</form>

					<div className={styles.divider}>
						<span />
						<p>OR</p>
						<span />
					</div>

					<Button
						size="large"
						block
						className={styles.google}
						onClick={handleGoogle}
						disabled={busy}
						icon={<GoogleLogo size={20} />}
					>
						Sign in with Google
					</Button>

					{error && <p className={styles.error}>{error}</p>}
				</>
			)}
		</div>
	);
}
