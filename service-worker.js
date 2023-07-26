/// <reference lib='webworker' />

const version = '2.0.8';
const id = 'connect-n@';
const cacheName = id + version;

/**
 * @type {ReadonlySet<string>}
 */
const assets = new Set([
	'./',
	'./index.html',
	'./src/app.js',
	'./src/board.js',
	'./src/game.js',
	'./src/sound-effects.js',
	'./src/ai-worker.js',
	'./src/ai.js',
	'./src/icon.svg',
	'./manifest.webmanifest',
	'./icons/any.png',
	'./icons/maskable.png',
].map(asset => import.meta.resolve(asset)));

const install = async () => {
	const cache = await caches.open(cacheName);
	return cache.addAll(assets);
};

const activate = async () => {
	const keys = await caches.keys();
	const deletions = [];
	for (const key of keys) {
		if (key.startsWith(id) && key.substring(id.length) !== version) {
			deletions.push(caches.delete(key));
		}
	}
	return Promise.all(deletions);
};

/**
 * @param {string} url
 * @returns {Promise<Response>}
 */
const proxy = async url => {
	const cache = await caches.open(cacheName);
	let response = await cache.match(url);
	if (!response) {
		response = await fetch(url);
		if (response.ok) {
			cache.put(url, response.clone());
		}
	}
	return response;
};

const worker = /**@type {ServiceWorkerGlobalScope}*/(/**@type {any}*/(globalThis));
worker.addEventListener('install', event => event.waitUntil(install()));
worker.addEventListener('activate', event => event.waitUntil(activate()));
worker.addEventListener('fetch', event => {
	const { url } = event.request;
	if (assets.has(url)) {
		event.respondWith(proxy(url));
	}
});
