/// <reference lib='webworker' />

const version = '1.0.0';
const cacheName = 'connect-n-' + version;

const assets = [
	'./icon.png',
	'./icon.svg',
	'./index.html',
	'./manifest.webmanifest',
	'./maskable.png',
	'./maskable.svg',
	'./src/connect-n-board.js',
	'./src/connect-n-game.js',
	'./src/connect-n-svg.js',
	'./src/connect-n.js',
].map(asset => new URL(asset, import.meta.url).href);

const worker = /**@type {ServiceWorkerGlobalScope}*/(/**@type {unknown}*/(globalThis));

worker.addEventListener('install', (event) => {
	event.waitUntil(caches.open(cacheName));
});

worker.addEventListener('fetch', (event) => {
	if (assets.includes(event.request.url)) {
		event.respondWith(caches.open(cacheName).then((cache) => {
			return cache.match(event.request).then((cachedResponse) => {
				return cachedResponse ?? fetch(event.request.url).then((fetchedResponse) => {
					cache.put(event.request, fetchedResponse.clone());
					return fetchedResponse;
				});
			});
		}));
	}
});
