import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';

/**
 * Lint gate. Type checking is `svelte-check`'s job; ESLint adds the rules that
 * catch real defects — unused code, floating promises, sloppy equality, mixing
 * up `console` in shipped code.
 */
export default ts.config(
	{
		ignores: [
			'build/**',
			'.svelte-kit/**',
			'node_modules/**',
			'test-results/**',
			'playwright-report/**',
			'coverage/**'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: { extraFileExtensions: ['.svelte'] }
		},
		rules: {
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			eqeqeq: ['error', 'smart'],
			'prefer-const': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/consistent-type-imports': 'warn'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		},
		rules: {
			// Svelte requires `let` for `$props()`/`$state()` destructuring.
			'prefer-const': 'off'
		}
	},
	{
		// Tests may assert on console output and use loose doubles.
		files: ['tests/**/*.ts'],
		rules: {
			'no-console': 'off',
			'@typescript-eslint/no-explicit-any': 'off'
		}
	}
);
