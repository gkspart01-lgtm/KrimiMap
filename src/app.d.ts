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
		/** Human-readable build marker shown in the preview, set at build time. */
		readonly VITE_BUILD_INFO?: string;
	}
}

export {};
