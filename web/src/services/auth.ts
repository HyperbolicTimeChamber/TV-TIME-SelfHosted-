import {
	GoogleAuthProvider,
	createUserWithEmailAndPassword,
	getAuth,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signInWithPopup,
	signOut as firebaseSignOut,
} from "firebase/auth";
import { firebaseApp } from "../firebase";

export const auth = getAuth(firebaseApp);

export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signInWithEmail = (email: string, password: string) =>
	signInWithEmailAndPassword(auth, email, password);
export const signUpWithEmail = (email: string, password: string) =>
	createUserWithEmailAndPassword(auth, email, password);
export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
export const signOut = () => firebaseSignOut(auth);
