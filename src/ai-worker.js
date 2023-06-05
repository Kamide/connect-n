/// <reference lib='webworker' />

/**
 * A map of web workers to be terminated by {@link workerRegistry} when they can no longer be accessed. The keys are unique symbols (no well-known symbols are used).
 * @type {Map<symbol, Worker>}
 */
const activeWorkers = new Map();

/**
 * Used to terminate web workers that can no longer be accessed.
 * @type {FinalizationRegistry<symbol>}
 */
const workerRegistry = new FinalizationRegistry(key => {
	activeWorkers.get(key)?.terminate();
	activeWorkers.delete(key);
});

/**
 * @callback MoveSuggester
 * @param {import('./game').Game} game
 * @param {number} depth
 * @param {AbortSignal} abortSignal
 * @returns {Promise<import('./ai.js').SuggestedMove>}
 */

/**
 * Creates a worker and returns an abortable asynchronous function that suggests a move. The worker will be terminated when the function is garbage collected.
 * @param {AbortSignal} [abortSignal]
 * @returns {Promise<MoveSuggester>}
 */
export const createMoveSuggester = abortSignal =>
	new Promise((resolve, reject) => {
		const worker = new Worker(import.meta.url, { type: 'module' });

		/**
		 * Error handler for {@link createMoveSuggester}. It is given a name so it can be detached when there's no errors.
		 * @param {ErrorEvent} error
		 */
		const errorHandler = error => {
			worker.terminate();
			reject(error);
		};
		worker.addEventListener('error', errorHandler, { once: true });

		worker.addEventListener('message', () => {
			worker.removeEventListener('error', errorHandler);

			if (abortSignal?.aborted) {
				reject(abortSignal);
				return;
			}

			/**
			 * @type {MoveSuggester}
			 */
			const suggestMove = (game, depth, abortSignal) =>
				new Promise((resolve, reject) => {
					/**
					 * Error handler for {@link suggestMove}. It is given a name so it can be detached when there's no errors.
					 * @param {ErrorEvent} event
					 */
					const errorHandler = event => {
						worker.terminate();
						reject(event);
					};
					worker.addEventListener('error', errorHandler, { once: true });

					worker.addEventListener('message', event => {
						worker.removeEventListener('error', errorHandler);

						if (abortSignal?.aborted) {
							reject(abortSignal);
						}
						else if ('error' in event.data) {
							reject(event.data);
						}
						else {
							resolve(event.data);
						}
					}, { once: true });

					worker.postMessage([game, depth]);
				});

			const key = Symbol();
			activeWorkers.set(key, worker);
			workerRegistry.register(suggestMove, key);
			resolve(suggestMove);
		}, { once: true });
	});

if (globalThis.WorkerGlobalScope) {
	const { suggestMove } = await import('./ai.js');
	postMessage('ACK');
	addEventListener('message',
		/**
		 * @param {MessageEvent<[import('./game').Game, number]>} event
		 */
		event => {
			try {
				postMessage(suggestMove(...event.data));
			}
			catch (error) {
				postMessage({ error });
			}
		});
}
