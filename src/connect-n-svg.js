/**
 * @param {import('./connect-n.js').Game} game
 * @param {(column: SVGRectElement) => void} [columnCallback]
 * @param {(slot: SVGCircleElement) => void} [slotCallback]
 */
export function connectNSvg(game, columnCallback, slotCallback) {
	const width = game.settings.columnCount * 100;
	const height = game.settings.rowCount * 100;

	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('xmlns', NS);
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

	const style = document.createElementNS(NS, 'style');
	style.textContent = /*css*/`
		.board {
			--column-count: ${game.settings.columnCount};
			--row-count: ${game.settings.rowCount};

			--board-width: ${width}px;
			--board-height: ${height}px;
			--board-min-dimension: min(var(--board-width) / var(--column-count), var(--board-height) / var(--row-count));

			--slot-radius-multiplier: 0.4;
			--slot-stroke-width-multiplier: 0.02;
			--slot-stroke-color: currentColor;

			--column-color: transparent;
			--player--1-color: transparent; /* empty slot */
		}

		.column {
			x: calc(var(--board-width) / var(--column-count) * var(--column-index));
			width: calc(var(--board-width) / var(--column-count));
			height: var(--board-height);
			fill: var(--column-color);
			cursor: grab;
		}

		.slot {
			cx: calc(var(--board-width) / var(--column-count) / 2 + var(--board-width) / var(--column-count) * var(--column-index));
			cy: calc(var(--board-height) - (var(--board-height) / var(--row-count) / 2 + var(--board-height) / var(--row-count) * var(--row-index)));
			r: calc(var(--board-min-dimension) * var(--slot-radius-multiplier));
			stroke: var(--slot-stroke-color);
			stroke-width: calc(var(--board-min-dimension) * var(--slot-stroke-width-multiplier));
			pointer-events: none;
		}
	`;

	const board = document.createElementNS(NS, 'g');
	board.classList.add('board');

	for (let columnIndex = 0; columnIndex < game.settings.columnCount; columnIndex++) {
		const c = String(columnIndex);
		const column = document.createElementNS(NS, 'rect');
		column.classList.add('column');
		column.style.setProperty('--column-index', c);
		column.dataset.columnIndex = c;
		board.append(column);
		columnCallback?.(column);

		for (let rowIndex = 0; rowIndex < game.settings.rowCount; rowIndex++) {
			const r = String(rowIndex);
			const p = String(game.board[columnIndex][rowIndex]);
			const slot = document.createElementNS(NS, 'circle');
			slot.classList.add('slot');
			slot.style.setProperty('--column-index', c);
			slot.style.setProperty('--row-index', r);
			slot.style.fill = `var(--player-${p}-color)`;
			slot.dataset.columnIndex = c;
			slot.dataset.rowIndex = r;
			slot.dataset.player = p;
			board.append(slot);
			slotCallback?.(slot);
		}
	}

	svg.append(style, board);
	return svg;
}

const NS = 'http://www.w3.org/2000/svg';
