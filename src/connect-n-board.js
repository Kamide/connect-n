import { connectNSvg } from './connect-n-svg.js';
import { columnIsFull, columnIsValid, gameOver, makeMove, nextRow } from './connect-n.js';

export const GAME_CHANGE_EVENT = 'connect-n-board-game-change';

export class ConnectNBoard extends HTMLElement {
	shadowRoot = this.attachShadow({ mode: 'open' });
	disabled = false;
	/**@type {import('./connect-n.js').Game | undefined}*/#game;
	/**@type {SVGElement | undefined}*/#svg;
	/**@type {Map<string, SVGCircleElement>}*/#slots = new Map();

	constructor() {
		super();
		this.shadowRoot.adoptedStyleSheets = [styleSheet];
	}

	get game() {
		return this.#game;
	}

	set game(game) {
		this.#game = game;
		this.#slots = new Map();
		this.shadowRoot.replaceChildren();

		if (game) {
			const svg = this.#svg = connectNSvg(game, (column) => {
				column.addEventListener('click', this.columnClickHandler);
			}, (slot) => {
				this.#slots.set(slot.dataset.columnIndex + ',' + slot.dataset.rowIndex, slot);
			});

			if (!this.disabled && !gameOver(game)) {
				svg.style.setProperty('--cursor', `var(--player-${game.activePlayer}-cursor)`);
			}

			this.shadowRoot.append(svg);
		}
	}

	/**
	 * @param {number} player
	 * @param {string} color
	 */
	setPlayerColor(player, color) {
		this.#svg?.style.setProperty(`--player-${player}-color`, color);
		this.#svg?.style.setProperty(`--player-${player}-cursor`, `url(${CSS.escape(this.pieceCursor(color))}), grab`);
	}

	/**
	 * @param {string} color
	 * @returns {string}
	 */
	pieceCursor(color) {
		return 'data:image/svg+xml,' + encodeURIComponent(/*xml*/`
			<svg xmlns='http://www.w3.org/2000/svg' viewBox='-8 -8 16 16' width='32' height='32'>
				<circle r='7' stroke='black' stroke-width='1' fill='${color}' />
			</svg>
		`.replace(/[\t\n]/g, ''));
	}

	/**
	 * @param {Event} event
	 */
	columnClickHandler = (event) => {
		if (!this.disabled && this.#game && event.target instanceof SVGRectElement) {
			const columnIndex = parseInt(event.target.dataset.columnIndex ?? 'NaN');

			if (!gameOver(this.#game) && columnIsValid(this.#game, columnIndex) && !columnIsFull(this.#game, columnIndex)) {
				const rowIndex = nextRow(this.#game, columnIndex);
				const activePlayer = this.#game.activePlayer;
				const nextGame = this.#game = makeMove(this.#game, columnIndex);
				this.dispatchEvent(new CustomEvent(GAME_CHANGE_EVENT, { detail: nextGame }));

				const slot = this.#slots.get(columnIndex + ',' + rowIndex);
				if (slot) {
					slot.style.fill = `var(--player-${activePlayer}-color)`;
					slot.dataset.player = String(activePlayer);
				}

				if (gameOver(nextGame)) {
					this.#svg?.style.removeProperty('--cursor');
				}
				else {
					this.#svg?.style.setProperty('--cursor', `var(--player-${nextGame.activePlayer}-cursor)`);
				}
			}
		}
	};
}

export const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/*css*/ `
	:host {
		display: block;
		box-sizing: border-box;
		user-select: none; /* prevent nearby text selection */
	}

	svg {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	.column {
		cursor: var(--cursor);
	}
`);

customElements.define('connect-n-board', ConnectNBoard);
