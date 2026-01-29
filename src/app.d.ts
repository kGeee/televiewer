// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
namespace App {
	// interface Error {}
	interface Locals {
		user: import('$lib/server/auth').User | null;
		session: import('$lib/server/auth').Session | null;
	}
	// interface PageData {}
	// interface PageState {}
	// interface Platform {}
}

export { };
