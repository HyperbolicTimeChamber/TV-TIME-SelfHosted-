import { useState } from "react";
import { App as AntApp, Button, Input } from "antd";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getFirebaseAuthErrorMessage } from "@app/hooks/getFirebaseAuthErrorMessage";
import GoogleLogo from "../../components/GoogleLogo";
import { resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } from "../../services/auth";
import { useAppSelector } from "../../store";
import { Paths } from "../../routes/paths";
import styles from "../../styles/screens/LoginScreen/LoginScreen.module.scss";

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
	const [error, setError] = useState<string | null>(null);
	const busy = loading || googleLoading;

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
		} finally {
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
		} finally {
			setGoogleLoading(false);
		}
	};

	const handleForgotPassword = async () => {
		if (!email.trim()) {
			setError("Enter your email address first.");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			await resetPassword(email.trim());
			message.success("Check your inbox for a password reset link.");
		} catch (e) {
			setError(getFirebaseAuthErrorMessage(codeOf(e)));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className={styles.container}>
			<img src="/logo.png" alt="Watchloom" className={styles.logo} />
			<p className={styles.subtitle}>Track What You Watch</p>

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
				<Button type="primary" size="large" block htmlType="submit" loading={loading} disabled={busy}>
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
					<button type="button" className={styles.forgot} onClick={handleForgotPassword} disabled={busy}>
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
				loading={googleLoading}
				disabled={busy}
				icon={<GoogleLogo size={20} />}
			>
				Sign in with Google
			</Button>

			{error && <p className={styles.error}>{error}</p>}
		</div>
	);
}
