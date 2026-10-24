// The application is a static, browser-only build: prerender the shell, then
// let the client take over. Nothing here may touch `window`, WebGL, WebGPU or
// IndexedDB during prerendering.
export const prerender = true;
export const ssr = false;
export const trailingSlash = 'always';
