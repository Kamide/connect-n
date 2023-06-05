import { firstRow, hasWinner, isValidColumn, isValidRow, lastRowAt, middleColumnsOf, playColumn } from './game.js';

/**
 * @typedef {Readonly<_SuggestedMove>} SuggestedMove A suggested column to play and its score.
 * @typedef _SuggestedMove Shallow copy of {@link SuggestedMove}.
 * @property {number} column 0-based index of the column to play.
 * @property {number} score A positive number indicates a good move and a negative number indicates a bad move.
 */

const _ = Object.freeze;

/**
 * Suggests a column to play for the current player in a game. Increasing depth increases runtime. Default parameters are for internal use only. Implemented with minimax algorithm.
 * @param {import('./game.js').Game} game
 * @param {number} depth
 * @param {number} [currentPlayer]
 * @param {number} [alpha]
 * @param {number} [beta]
 * @returns {SuggestedMove}
 */
export const suggestMove = (game, depth, currentPlayer = game.currentPlayer, alpha = -Infinity, beta = Infinity) => {
	if (game.over || depth <= 0) {
		return _({ column: -1, score: scoreOf(game, currentPlayer) });
	}
	else {
		const playableColumns = shuffle([...game.playableColumns]);
		let column = playableColumns[Math.trunc(Math.random() * playableColumns.length)];
		let score = game.currentPlayer === currentPlayer ? -Infinity : Infinity;

		for (const c of playableColumns) {
			const s = suggestMove(playColumn(game, c), depth - 1, currentPlayer, alpha, beta).score;

			if (game.currentPlayer === currentPlayer) {
				if (s > score) {
					column = c;
					score = s;
				}

				alpha = Math.max(alpha, score);
				if (alpha >= beta) {
					break;
				}
			}
			else {
				if (s < score) {
					column = c;
					score = s;
				}

				beta = Math.min(beta, score);
				if (alpha >= beta) {
					break;
				}
			}
		}

		return _({ column, score });
	}
};

/**
 * @type {Readonly<Record<import('./game.js').ConnectionType, ReadonlyArray<readonly [pieceIndex: number, columnOffset: number, rowOffset: number]>>>}
 */
const offsets = (_({
	'-': _([_(/**@type {const}*/([0, -1, 0])), _(/**@type {const}*/([-1, 1, 0]))]),
	'|': _([_(/**@type {const}*/([-1, 0, 1]))]),
	'/': _([_(/**@type {const}*/([0, -1, 1])), _(/**@type {const}*/([-1, 1, 1]))]),
	'\\': _([_(/**@type {const}*/([0, 1, -1])), _(/**@type {const}*/([-1, -1, 1]))]),
}));

/**
 * @param {import('./game.js').Game} game
 * @param {number} currentPlayer
 * @returns {number}
 */
const scoreOf = (game, currentPlayer) => {
	if (hasWinner(game)) {
		if (game.winner === currentPlayer) {
			return Infinity;
		}
		else {
			return -Infinity;
		}
	}

	let score = 0;

	for (const column of middleColumnsOf(game)) {
		for (let row = firstRow; row <= lastRowAt(game, column); row++) {
			if (game.pieces[game.graph[column][row].piece].player === currentPlayer) {
				score += game.settings.winCondition - 1;
			}
		}
	}

	for (const column of game.playableColumns) {
		const row = lastRowAt(game, column);
		const subgraph = game.graph[column][row];
		if (!subgraph) {
			continue;
		}

		for (const [type, i] of /**@type {[import('./game.js').ConnectionType, number][]}*/(Object.entries(subgraph.connections))) {
			const connection = game.connections[i];
			const offset = offsets[type];
			let holes = 0;

			for (const [p, columnOffset, rowOffset] of offset) {
				const column2 = game.pieces[/**@type {number}*/(connection.at(p))].column + columnOffset;
				if (!isValidColumn(game, column2)) {
					continue;
				}
				const row2 = game.pieces[/**@type {number}*/(connection.at(p))].row + rowOffset;
				if (!isValidRow(game, row2)) {
					continue;
				}
				if (!game.graph[column2][row2]) {
					holes++;
				}
			}

			if (connection.length >= game.settings.winCondition - 1 && holes >= 1) {
				if (game.pieces[subgraph.piece].player === currentPlayer) {
					score += game.settings.winCondition + 1;
				}
				else {
					score -= game.settings.winCondition;
				}
			}
			else if (connection.length >= game.settings.winCondition - 2 && holes >= 2 && game.pieces[subgraph.piece].player === currentPlayer) {
				score += game.settings.winCondition - 2;
			}
		}
	}

	return score;
};

/**
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
const shuffle = array => {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.trunc(Math.random() * (i + 1));

		// Swap elements at index i and j.
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
};
