// Replaces app/src/stores on web: the shared hooks call useAuthStore / useUiStore
// (zustand-style); here both read from the web's Redux store.
import { useSelector } from "react-redux";
import { store, type RootState } from "../store";
import type { AuthState } from "../store/authSlice";
import { setConnected, setWatchlistLoading, type UiState } from "../store/uiSlice";

type Selector<S, T> = (state: S) => T;

function makeCompatStore<S extends object, A extends object>(
	select: (root: RootState) => S,
	actions: A,
) {
	const view = () => ({ ...select(store.getState()), ...actions }) as S & A;
	function useStore<T>(selector?: Selector<S & A, T>): T {
		return useSelector((root: RootState) => {
			const state = { ...select(root), ...actions } as S & A;
			return selector ? selector(state) : (state as unknown as T);
		});
	}
	useStore.getState = view;
	return useStore;
}

export const useAuthStore = makeCompatStore((r) => r.auth as AuthState, {});

export const useUiStore = makeCompatStore((r) => r.ui as UiState, {
	setConnected: (v: boolean) => {
		store.dispatch(setConnected(v));
	},
	setWatchlistLoading: (v: boolean) => {
		store.dispatch(setWatchlistLoading(v));
	},
});
