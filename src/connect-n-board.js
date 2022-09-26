import { connectNSvg } from './connect-n-svg.js';
import { columnIsFull, columnIsValid, gameOver, makeMove, nextRow } from './connect-n.js';

export const GAME_CHANGE_EVENT = 'connect-n-board-game-change';

export class ConnectNBoard extends HTMLElement {
	disabled = false;
	/**@type {import('./connect-n.js').Game | undefined}*/#game;
	/**@type {SVGElement | undefined}*/#svg;
	/**@type {Map<string, SVGCircleElement>}*/#slots = new Map();

	constructor() {
		super();
		const shadow = this.attachShadow({ mode: 'open' });
		shadow.adoptedStyleSheets = [styleSheet];
	}

	get game() {
		return this.#game;
	}

	set game(game) {
		this.#game = game;
		this.#slots = new Map();
		// @ts-ignore
		this.shadowRoot.replaceChildren();

		if (game) {
			const svg = this.#svg = connectNSvg(game, (column) => {
				column.addEventListener('click', this.columnClickHandler);
			}, (slot) => {
				this.#slots.set(slot.dataset.columnIndex + ',' + slot.dataset.rowIndex, slot);
			});
			// @ts-ignore
			this.shadowRoot.append(svg);
		}
	}

	/**
	 * @param {number} player
	 * @param {string} color
	 */
	setPlayerColor(player, color) {
		this.#svg?.style.setProperty(`--player-${player}-color`, color);
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
				this.#game = makeMove(this.#game, columnIndex);
				this.dispatchEvent(new CustomEvent(GAME_CHANGE_EVENT, { detail: this.#game }));

				const slot = this.#slots.get(columnIndex + ',' + rowIndex);
				if (slot) {
					slot.style.fill = `var(--player-${activePlayer}-color)`;
					slot.dataset.player = String(activePlayer);
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
`);
