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
		winner: isWinner(game.settings, board, columnIndex, rowIndex, activePlayer) ? activePlayer : -1,
		draw: piecesPlayed === game.settings.slotCount,
	});
}

/**
 * @param {Settings} settings
 * @param {ReadonlyArray<ReadonlyArray<number>>} board
 * @param {number} columnIndex
 * @param {number} rowIndex
 * @param {number} activePlayer
 * @returns {boolean}
 */
export function isWinner(settings, board, columnIndex, rowIndex, activePlayer) {
	const { columnCount, rowCount, piecesToWin } = settings;

	let horizontal = 0;
	let firstMatchFound = false;
	for (let c = Math.max(columnIndex - (piecesToWin - 1), 0); c < Math.min(columnIndex + piecesToWin, columnCount); c++) {
		if (board[c][rowIndex] === activePlayer) {
			firstMatchFound = true;
			horizontal++;
		} else if (firstMatchFound) {
			break;
		}
	}
	if (horizontal >= piecesToWin) {
		return true;
	}

	let vertical = 0;
	firstMatchFound = false;
	for (let r = Math.max(rowIndex - (piecesToWin - 1), 0); r < Math.min(rowIndex + piecesToWin, rowCount); r++) {
		if (board[columnIndex][r] === activePlayer) {
			firstMatchFound = true;
			vertical++;
		} else if (firstMatchFound) {
			break;
		}
	}
	if (vertical >= piecesToWin) {
		return true;
	}

	let diagonal = 0;
	firstMatchFound = false;
	for (let i = -(piecesToWin - 1); i <= piecesToWin - 1; i++) {
		const c = columnIndex + i;
		const r = rowIndex + i;

		if (c >= 0 && c < columnCount && r >= 0 && r < rowCount) {
			if (board[c][r] === activePlayer) {
				firstMatchFound = true;
				diagonal++;
			} else if (firstMatchFound) {
				break;
			}
		}
	}
	if (diagonal >= piecesToWin) {
		return true;
	}

	diagonal = 0;
	firstMatchFound = false;
	for (let i = -(piecesToWin - 1); i <= piecesToWin - 1; i++) {
		const c = columnIndex + i;
		const r = rowIndex - i;

		if (c >= 0 && c < columnCount && r >= 0 && r < rowCount) {
			if (board[c][r] === activePlayer) {
				firstMatchFound = true;
				diagonal++;
			} else if (firstMatchFound) {
				break;
			}
		}
	}
	if (diagonal >= piecesToWin) {
		return true;
	}

	return false;
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
