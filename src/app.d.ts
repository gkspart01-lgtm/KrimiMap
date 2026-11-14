// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface ImportMetaEnv {
		/** "main" or "PR #12" — set by the deploy workflows. */
		readonly VITE_BUILD_LABEL?: string;
		/** Full commit sha of the build. */
		readonly VITE_BUILD_SHA?: string;
		/** CI run number, used as the visible build index. */
		readonly VITE_BUILD_NUMBER?: string;
		/** ISO timestamp the commit/PR was last updated. */
		readonly VITE_BUILD_AT?: string;
		/** "owner/repo", so the stamp can link the commit. */
		readonly VITE_REPO?: string;
	}
}

export {};
