/// <reference lib='webworker' />

const version = '2.0.2';
const cacheName = `connect-n-${version}`;

/**
 * @type {ReadonlySet<string>}
 */
const assets = new Set([
	'./',
	'./index.html',
	'./manifest.webmanifest',
	'./src/icon.svg',
	'./src/icon.svg#maskable',
	'./icons/any.png',
	'./icons/maskable.png',
	'./src/app.js',
	'./src/board.js',
	'./src/game.js',
	'./src/sound-effects.js',
	'./src/ai-worker.js',
	'./src/ai.js',
].map(asset => new URL(asset, import.meta.url).href));

/**
 * @param {FetchEvent} event
 * @returns {Promise<Response>}
 */
const getResponse = async event => {
	const cache = await caches.open(cacheName);
	let response = await cache.match(event.request);
	if (!response) {
		response = await fetch(event.request.url);
		if (response.status >= 200 && response.status < 300) {
			cache.put(event.request, response.clone());
		}
	}
	return response;
};

const worker = /**@type {ServiceWorkerGlobalScope}*/(/**@type {any}*/(globalThis));

worker.addEventListener('fetch', event => {
	if (assets.has(event.request.url)) {
		event.respondWith(getResponse(event));
	}
});

worker.addEventListener('install', event =>
	event.waitUntil(caches.open(cacheName)));
