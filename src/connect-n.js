/**
 * @typedef {Readonly<{
 * 	columnCount: number;
 * 	rowCount: number;
 * 	slotCount: number;
 * 	piecesToWin: number;
 * 	playerCount: number;
 * }>} Settings
 */

/**
 * @typedef {Readonly<{
 * 	settings: Settings;
 * 	piecesPlayed: number;
 * 	activePlayer: number;
 * 	occupancies: ReadonlyArray<number>;
 * 	board: ReadonlyArray<ReadonlyArray<number>>;
 * 	winner: number;
 * 	winningPieces: ReadonlyArray<ReadonlyArray<number>>;
 * 	draw: boolean;
 * }>} Game
 */

/**
 * @param {number} columnCount
 * @param {number} rowCount
 * @param {number} piecesToWin
 * @param {number} playerCount
 * @returns {Settings}
 */
export function newSettings(columnCount = 7, rowCount = 6, piecesToWin = 4, playerCount = 2) {
	columnCount = Math.max(Math.floor(columnCount), 2);
	rowCount = Math.max(Math.floor(rowCount), 2);
	const slotCount = columnCount * rowCount;
	piecesToWin = Math.max(Math.floor(piecesToWin), 2);
	playerCount = Math.max(Math.floor(playerCount), 2);
	return Object.freeze({ columnCount, rowCount, slotCount, piecesToWin, playerCount });
}

/**
 * @param {Settings} settings
 * @returns {Game}
 */
export function newGame(settings = newSettings()) {
	return Object.freeze({
		settings,
		piecesPlayed: 0,
		activePlayer: 0,
		occupancies: Object.freeze(Array(settings.columnCount).fill(0)),
		board: emptyBoard(settings.columnCount, settings.rowCount),
		winner: -1,
		winningPieces: Object.freeze([]),
		draw: false,
	});
}

/**
 * @param {number} columnCount
 * @param {number} rowCount
 * @returns {ReadonlyArray<ReadonlyArray<number>>}
 */
export function emptyBoard(columnCount, rowCount) {
	const board = [];

	for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
		board.push(Object.freeze(Array(rowCount).fill(-1)));
	}

	return Object.freeze(board);
}

/**
 * @param {Game} game
 * @param {number} columnIndex
 * @returns {Game}
 */
export function makeMove(game, columnIndex) {
	if (!columnIsValid(game, columnIndex)) {
		throw new RangeError(`[connect-n] columnIndex must be in range [0,${game.settings.columnCount - 1}].`);
	} else if (gameOver(game) || columnIsFull(game, columnIndex)) {
		return game;
	}

	const { activePlayer, occupancies: previousTargetRows, board: previousBoard } = game;
	const rowIndex = nextRow(game, columnIndex);

	const piecesPlayed = game.piecesPlayed + 1;
	const nextActivePlayer = (activePlayer + 1) % game.settings.playerCount;

	const board = Object.freeze([
		...previousBoard.slice(0, columnIndex),
		Object.freeze([
			...previousBoard[columnIndex].slice(0, rowIndex),
			activePlayer,
			...previousBoard[columnIndex].slice(rowIndex + 1),
		]),
		...previousBoard.slice(columnIndex + 1),
	]);

	const winningPieces = getWinningPieces(game.settings, board, columnIndex, rowIndex, activePlayer);

	return Object.freeze({
		...game,
		piecesPlayed,
		activePlayer: nextActivePlayer,
		occupancies: Object.freeze([
			...previousTargetRows.slice(0, columnIndex),
			rowIndex + 1,
			...previousTargetRows.slice(columnIndex + 1),
		]),
		board,
		winner: winningPieces.length > 0 ? activePlayer : -1,
		winningPieces,
		draw: piecesPlayed === game.settings.slotCount,
	});
}

/**
 * @param {Settings} settings
 * @param {ReadonlyArray<ReadonlyArray<number>>} board
 * @param {number} columnIndex
 * @param {number} rowIndex
 * @param {number} activePlayer
 * @returns {ReadonlyArray<ReadonlyArray<number>>}
 */
export function getWinningPieces(settings, board, columnIndex, rowIndex, activePlayer) {
	const { columnCount, rowCount, piecesToWin } = settings;

	const horizontalMatches = [];
	for (let c = Math.max(columnIndex - (piecesToWin - 1), 0); c < Math.min(columnIndex + piecesToWin, columnCount); c++) {
		if (board[c][rowIndex] === activePlayer) {
			horizontalMatches.push(Object.freeze([c, rowIndex]));
		} else if (horizontalMatches.length > 0) {
			break;
		}
	}
	if (horizontalMatches.length >= piecesToWin) {
		return Object.freeze(horizontalMatches);
	}

	const verticalMatches = [];
	for (let r = Math.max(rowIndex - (piecesToWin - 1), 0); r < Math.min(rowIndex + piecesToWin, rowCount); r++) {
		if (board[columnIndex][r] === activePlayer) {
			verticalMatches.push(Object.freeze([columnIndex, r]));
		} else if (verticalMatches.length > 0) {
			break;
		}
	}
	if (verticalMatches.length >= piecesToWin) {
		return Object.freeze(verticalMatches);
	}

	const diagonal45Matches = [];
	for (let i = -(piecesToWin - 1); i <= piecesToWin - 1; i++) {
		const c = columnIndex + i;
		const r = rowIndex + i;

		if (c >= 0 && c < columnCount && r >= 0 && r < rowCount) {
			if (board[c][r] === activePlayer) {
				diagonal45Matches.push(Object.freeze([c, r]));
			} else if (diagonal45Matches.length > 0) {
				break;
			}
		}
	}
	if (diagonal45Matches.length >= piecesToWin) {
		return Object.freeze(diagonal45Matches);
	}

	const diagonal135Matches = [];
	for (let i = -(piecesToWin - 1); i <= piecesToWin - 1; i++) {
		const c = columnIndex + i;
		const r = rowIndex - i;

		if (c >= 0 && c < columnCount && r >= 0 && r < rowCount) {
			if (board[c][r] === activePlayer) {
				diagonal135Matches.push(Object.freeze([c, r]));
			} else if (diagonal135Matches.length > 0) {
				break;
			}
		}
	}
	if (diagonal135Matches.length >= piecesToWin) {
		return Object.freeze(diagonal135Matches);
	}

	return Object.freeze([]);
}

/**
 * @param {Game} game
 * @param {number} columnIndex
 * @returns {boolean}
 */
export function columnIsValid(game, columnIndex) {
	return columnIndex >= 0 && columnIndex < game.settings.columnCount;
}

/**
 * @param {Game} game
 * @param {number} columnIndex
 * @returns {boolean}
 */
export function columnIsFull(game, columnIndex) {
	return nextRow(game, columnIndex) >= game.settings.rowCount;
}

/**
 * @param {Game} game
 * @param {number} columnIndex
 * @returns {number}
 */
export function nextRow(game, columnIndex) {
	return game.occupancies[columnIndex];
}

/**
 * @param {Game} game
 * @returns {boolean}
 */
export function gameOver(game) {
	return game.winner >= 0 || game.draw;
}
