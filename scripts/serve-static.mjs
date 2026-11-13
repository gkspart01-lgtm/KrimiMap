#!/usr/bin/env node
/**
 * Minimal static file server for the production build.
 *
 * `vite preview` cannot be used: in a SvelteKit project it serves
 * `.svelte-kit/output/client`, so anything that only exists in the adapter
 * output — the service worker, the generated Workbox bundle — returns 404 and
 * the PWA tests fail against a correct build.
 *
 * Serves like a plain static host: directory URLs resolve to `index.html`,
 * responses are never cached (so a rebuild is always visible), and the MIME
 * types cover what the build emits.
 *
 *   node scripts/serve-static.mjs [--dir build] [--port 4173] [--host 127.0.0.1]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
function option(name, fallback) {
	const index = args.indexOf(`--${name}`);
	return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

const root = resolve(option('dir', 'build'));
const port = Number(option('port', process.env.PORT ?? 4173));
const host = option('host', '127.0.0.1');

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.map': 'application/json; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8'
};

if (!existsSync(root)) {
	console.error(`serve-static: ${root} does not exist — run \`npm run build\` first`);
	process.exit(1);
}

/** Map a request path to a file, preventing traversal outside `root`. */
function resolveFile(urlPath) {
	const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
	let target = join(root, normalize(decoded));
	if (!target.startsWith(root)) return null;

	if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
	else if (!existsSync(target) && existsSync(`${target}.html`)) target = `${target}.html`;

	return existsSync(target) && statSync(target).isFile() ? target : null;
}

const server = createServer((request, response) => {
	const file = resolveFile(request.url ?? '/');

	if (!file) {
		response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		response.end(`404 ${request.url}\n`);
		return;
	}

	response.writeHead(200, {
		'content-type': MIME[extname(file)] ?? 'application/octet-stream',
		// Never cache: a rebuild must be visible immediately, and the service
		// worker does the caching in the browser.
		'cache-control': 'no-store',
		// The worker needs to control the whole scope; keep it simple and explicit.
		'service-worker-allowed': '/'
	});
	createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
	console.log(`serve-static: ${root} on http://${host}:${port}`);
});
