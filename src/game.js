/**
 * @typedef {Readonly<_Game>} Game Stores game state.
 * @typedef _Game Shallow copy of {@link Game}.
 * @property {Settings} settings Stores number of columns, rows, pieces needed to win, and players.
 * @property {number} currentPlayer 0-based index of the player to make a move.
 * @property {number} winner 0-based index of the winner. -1 is used to represent no winner.
 * @property {boolean} over True if the game is over and no more valid moves can be made.
 * @property {ReadonlyArray<number>} playableColumns Array of indices of columns that can be played and aren't full.
 * @property {ReadonlyArray<Piece>} pieces Array of {@link Piece} sorted by when they were played where the first piece is at index 0.
 * @property {ReadonlyArray<Connection>} connections Array of {@link Connection}.
 * @property {ReadonlyArray<ReadonlyArray<Subgraph>>} graph 2D matrix of {@link Subgraph} indexed by column and row.
 *
 * @typedef {Readonly<_Settings>} Settings Stores game settings.
 * @typedef _Settings Shallow copy of {@link Settings}.
 * @property {number} columnCount Number of columns on the board in the range [1, 2^32 - 1].
 * @property {number} rowCount Number of rows on the board in the range [1, 2^32 - 1].
 * @property {number} winCondition Minimum number of connecting pieces needed to win in the range [1, 2^32 - 1].
 * @property {number} playerCount Number of players in the range [1, 2^32 - 1].
 * @property {boolean} invalid Will be set to `true` by factory function {@link createSettings} if any setting is invalid.
 *
 * @typedef {Readonly<_Piece>} Piece Stores position and associated player information of a game piece.
 * @typedef _Piece Shallow copy of {@link Piece}.
 * @property {number} column 0-based index of which column the piece is located.
 * @property {number} row 0-based row index of which row the piece is located.
 * @property {number} player 0-based player index of who played the piece.
 *
 * @typedef {ReadonlyArray<number>} Connection Array of piece indices (referencing indices of {@link Game.pieces}) sorted ascending by the piece's row and column. A connection can be valid (contains two or more piece indices) or invalid (contains one connection index). A connection becomes invalid when its piece indices are moved to another connection.
 * @typedef {'-' | '|' | '/' | '\\'} ConnectionType ASCII representation of the line a connection forms.
 *
 * @typedef {Readonly<_Subgraph>} Subgraph Relates pieces (referencing indices of {@link Game.pieces}) and their connections (referencing indices of {@link Game.connections}) in a game.
 * @typedef _Subgraph Shallow copy of {@link Subgraph}.
 * @property {number} piece Piece index referencing a key of {@link Game.pieces}.
 * @property {Readonly<Record<ConnectionType, number>>} connections A map of indices of connections (referencing indices of {@link Game.connections}) that contain the piece given by {@link Subgraph.piece}. The keys are {@link ConnectionType}.
 */

const _ = Object.freeze;

/**
 * @param {number} value
 * @returns {boolean}
 */
const isInvalidSetting = value => !Number.isSafeInteger(value) || value < 1 || value > 2 ** 32 - 1;

/**
 * @param {number} columnCount
 * @param {number} rowCount
 * @param {number} winCondition
 * @param {number} playerCount
 * @returns {Settings}
 */
export const createSettings = (columnCount, rowCount, winCondition, playerCount) => ({
	columnCount, rowCount, winCondition, playerCount,
	invalid:
		isInvalidSetting(columnCount) ||
		isInvalidSetting(rowCount) ||
		isInvalidSetting(winCondition) ||
		isInvalidSetting(playerCount),
});

/**
 * Creates a new game. The game will be over if invalid settings are given.
 * @param {Settings} settings
 * @returns {Game}
 */
export const createGame = settings => {
	const over = settings.invalid;
	const graph = over ? _([]) : _(Array(settings.columnCount).fill(_([])));
	return _({
		settings,
		currentPlayer: 0,
		winner: -1,
		over,
		playableColumns: _([...graph.keys()]),
		pieces: _([]),
		connections: _([]),
		graph,
	});
};

/**
 * @param {ReadonlyArray<Piece>} pieces
 * @returns {(a: number, b: number) => number}
 */
const sortByAscendingRowAndColumn = pieces => (a, b) =>
	pieces[a].row === pieces[b].row
		? pieces[a].column - pieces[b].column
		: pieces[a].row - pieces[b].row;

/**
 * @type {ReadonlyArray<readonly [connectionType: ConnectionType, columnOffset: number, rowOffset: number]>}
 */
const offsets = _([
	_(/**@type {const}*/(['-', -1, 0])), // Left
	_(/**@type {const}*/(['-', 1, 0])), // Right
	_(/**@type {const}*/(['|', 0, -1])), // Down
	// Up is omitted because a piece to be played is always the topmost piece in a column.
	_(/**@type {const}*/(['/', -1, -1])), // Left & Down
	_(/**@type {const}*/(['/', 1, 1])), // Right & Up
	_(/**@type {const}*/(['\\', 1, -1])), // Right & Down
	_(/**@type {const}*/(['\\', -1, 1])), // Left & Up
]);

/**
 * Drops a piece for the current player in the given column. The same game given will be returned if the given column is full or out of range.
 * @param {Game} game
 * @param {number} column
 * @returns {Game}
 */
export const playColumn = (game, column) => {
	if (game.over || !game.playableColumns.includes(column)) {
		return game;
	}

	const { settings, currentPlayer } = game;
	const { rowCount, winCondition, playerCount } = settings;
	let { winner, playableColumns, pieces, connections, graph } = game;

	const row = graph[column].length;
	playableColumns = row < rowCount - 1 ? playableColumns : _(playableColumns.filter(c => c !== column));

	let subgraph = /**@type {Subgraph}*/(_({
		piece: pieces.length,
		connections: _({}),
	}));
	graph = _(_with(graph, column, _([...graph[column], subgraph])));

	const piece = _({
		column: column,
		row: row,
		player: currentPlayer,
	});
	pieces = _([...pieces, piece]);
	const byAscendingRowAndColumn = sortByAscendingRowAndColumn(pieces);

	if (winCondition <= 1) {
		// No connections will be made because the first player will always be the winner and a valid connection contains 2 or more piece indices.
		winner = currentPlayer;
	}
	else { // Check if connections will be made or modified.
		for (const [connectionType, columnOffset, rowOffset] of offsets) {
			const column2 = column + columnOffset;
			const row2 = row + rowOffset;

			// Optional chaining is used here because comparisonColumn can be out of range when it's testing the left and right border.
			// comparisonRow can also be out of range if it's testing the top and bottom border or checking a column that isn't full.
			let subgraph2 = graph[column2]?.[row2];
			if (!subgraph2 || pieces[subgraph2.piece].player !== currentPlayer) {
				continue;
			}

			/**
			 * Index of {@link currentConnection}.
			 * @type {number}
			 */
			let i;
			/**
			 * The connection to be made or modified.
			 * @type {Connection}
			 */
			let currentConnection;
			/**
			 * Does the comparison piece have this connection type?
			 */
			const a = connectionType in subgraph2.connections;
			/**
			 * Does the piece to be played have this connection type?
			 */
			const b = connectionType in subgraph.connections;

			if (a && b) { // The piece to be played is positioned between two connections which need to be invalidated and merged into a new connection.
				i = connections.length;
				const j = subgraph2.connections[connectionType];
				const k = subgraph.connections[connectionType];

				currentConnection = _([...connections[j], ...connections[k]].sort(byAscendingRowAndColumn));
				connections = _(_with(connections, j, _([i])));
				connections = _(_with(connections, k, _([i])));
				connections = _([...connections, currentConnection]);

				// Replace the invalid connection indices j and k with the new connection index i.
				for (const p of currentConnection) {
					const c = pieces[p].column;
					const r = pieces[p].row;
					let s = graph[c][r];

					s = _({
						...s,
						connections: _({
							...s.connections,
							[connectionType]: i,
						}),
					});
					graph = _(_with(graph, c, _(_with(graph[c], r, s))));
				}
			}
			else if (a) { // Add the piece to be played to current connection.
				i = subgraph2.connections[connectionType];
				currentConnection = _([...connections[i], subgraph.piece].sort(byAscendingRowAndColumn));
				connections = _(_with(connections, i, currentConnection));
			}
			else if (b) { // Add the comparison piece to the current connection.
				i = subgraph.connections[connectionType];
				currentConnection = _([...connections[i], subgraph2.piece].sort(byAscendingRowAndColumn));
				connections = _(_with(connections, i, currentConnection));
			}
			else { // Add both pieces to a new connection.
				i = connections.length;
				currentConnection = _([subgraph2.piece, subgraph.piece].sort(byAscendingRowAndColumn));
				connections = _([...connections, currentConnection]);
			}

			if (!a) { // A connection of this type has not been made before for the comparison piece.
				subgraph2 = _({
					...subgraph2,
					connections: _({
						...subgraph2.connections,
						[connectionType]: i,
					}),
				});
				graph = _(_with(graph, column2, _(_with(graph[column2], row2, subgraph2))));
			}
			if (!b) { // A connection of this type has not been made before for the piece to be played.
				subgraph = _({
					...subgraph,
					connections: _({
						...subgraph.connections,
						[connectionType]: i,
					}),
				});
				graph = _(_with(graph, column, _(_with(graph[column], row, subgraph))));
			}

			if (currentConnection.length >= winCondition) {
				winner = currentPlayer;
			}
		}
	}

	return _({
		settings,
		currentPlayer: (currentPlayer + 1) % playerCount,
		winner,
		over: winner > -1 || playableColumns.length === 0,
		playableColumns,
		pieces,
		connections,
		graph,
	});
};

/**
 * Checks if two games have the same number of columns and rows.
 * @param {Game} a
 * @param {Game} b
 * @returns {boolean}
 */
export const hasSameGeometry = (a, b) => a.settings.columnCount === b.settings.columnCount && a.settings.rowCount === b.settings.rowCount;

/**
 * Checks if a game has a winner.
 * @param {Game} game
 * @returns {boolean}
 */
export const hasWinner = game => game.winner > -1;

/**
 * If there is a winner, winning connections will be returned. Otherwise, valid connections will be returned.
 * @param {Game} game
 * @returns {ReadonlyArray<Connection>}
 */
export const validConnectionsOf = game => game.connections.filter(
	hasWinner(game)
		? connection => connection.length >= game.settings.winCondition
		: connection => connection.length >= 2);

/**
 * Returns a number which may have a fractional part that is halfway between the first and last column indices.
 * @param {Game} game
 * @returns {number}
 */
export const columnMidpointOf = game => (game.settings.columnCount - 1) / 2;

/**
 * If a game has an odd number of columns, a set with one column index (the middle column) will be returned. Otherwise, the game has an even number of columns and a set with two column indices (the two middle columns) will be returned.
 * @param {Game} game
 * @returns {Set<number>}
 */
export const middleColumnsOf = game => {
	const middleColumn = columnMidpointOf(game);
	return new Set([Math.floor(middleColumn), Math.ceil(middleColumn)]);
};

/**
 * Index of the first column of any game.
 */
export const firstColumn = 0;

/**
 * Index of the first row of any game.
 */
export const firstRow = 0;

/**
 * Index of the last column of a given game.
 * @param {Game} game
 * @returns {number}
 */
export const lastColumnOf = game => game.settings.columnCount - 1;

/**
 * Index of the last row played in a given column of a game.
 * @param {Game} game
 * @param {number} column
 * @returns {number}
 */
export const lastRowAt = (game, column) => game.graph[column].length - 1;

/**
 * Checks if a number which may have a fractional part is a valid column index.
 * @param {Game} game
 * @param {number} column
 * @returns {boolean}
 */
export const isValidColumn = (game, column) => column >= firstColumn && column <= lastColumnOf(game);

/**
 * Checks if a number which may have a fractional part is a valid row index.
 * @param {Game} game
 * @param {number} row
 * @returns {boolean}
 */
export const isValidRow = (game, row) => row >= 0 && row <= game.settings.rowCount - 1;

/**
 * Restricts a number to the valid column index range of a game. Numbers past the lower and upper bound will be clamped to the first column and last column indices respectively.
 * @param {Game} game
 * @param {number} column
 * @returns {number}
 */
export const clampColumn = (game, column) => Math.min(Math.max(column, firstColumn), lastColumnOf(game));

const _with = typeof Array.prototype.with === 'function' ?
	/**
	 * @template T
	 * @param {ReadonlyArray<T>} array
	 * @param {number} index
	 * @param {T} value
	 * @returns {T[]}
	 */
	(array, index, value) => array.with(index, value) :
	/**
	 * @template T
	 * @param {ReadonlyArray<T>} array
	 * @param {number} index
	 * @param {T} value
	 * @returns {T[]}
	 */
	(array, index, value) => {
		let zeroBasedIndex = Math.trunc(index);
		if (zeroBasedIndex < 0) {
			zeroBasedIndex = array.length + zeroBasedIndex;
		}
		if (zeroBasedIndex < 0 || zeroBasedIndex >= array.length) {
			throw new RangeError(`Invalid index : ${index}`);
		}
		const newArray = Array(array.length);
		for (let i = 0; i < array.length; i++) {
			newArray[i] = i === zeroBasedIndex ? value : array[i];
		}
		return newArray;
	};
