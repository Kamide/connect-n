import { newGame, newSettings } from './connect-n.js';
import { ConnectNBoard, GAME_CHANGE_EVENT } from './connect-n-board.js';

export class ConnectNGame extends HTMLElement {
	#settingsHidden = false;
	/**@type {HTMLDivElement}*/#menu;
	/**@type {HTMLInputElement}*/#columnCountInput;
	/**@type {HTMLInputElement}*/#rowCountInput;
	/**@type {HTMLInputElement}*/#piecesToWinInput;
	/**@type {HTMLDivElement}*/#historyContainer;
	/**@type {ConnectNBoard}*/#board;

	constructor() {
		super();
		const shadow = this.attachShadow({ mode: 'open' });
		shadow.adoptedStyleSheets = [styleSheet];

		const container = document.createElement('div');
		container.classList.add('container');

		const menu = this.#menu = document.createElement('div');
		menu.classList.add('menu');
		menu.innerHTML = /*html*/`
			<header>
				<h1>Connect N</h1>
			</header>

			<section>
				<h2>Board</h2>
				<div class="form">
					<label>
						<span class="label">Columns</span>
						<input name="column-count" type="number" min="2" value="7" />
					</label>
					<label>
						<span class="label">Rows</span>
						<input name="row-count" type="number" min="2" value="6" />
					</label>
					<label>
						<span class="label" title="Pieces to Win">N</span>
						<input name="pieces-to-win" type="number" min="2" value="4" />
					</label>
					<button class="new-game" type="button">New Game</button>
				</div>
			</section>

			<section>
				<h2>Players</h2>
				<svg class="palette" viewBox="0 0 9 2">
					<rect x="0" y="0" width="1" height="1" fill="#7f7f7f" />
					<rect x="0" y="1" width="1" height="1" fill="#c3c3c3" />
					<rect x="1" y="0" width="1" height="1" fill="#880015" />
					<rect x="1" y="1" width="1" height="1" fill="#b97a57" />
					<rect x="2" y="0" width="1" height="1" fill="#ed1c24" />
					<rect x="2" y="1" width="1" height="1" fill="#ffaec9" />
					<rect x="3" y="0" width="1" height="1" fill="#ff7f27" />
					<rect x="3" y="1" width="1" height="1" fill="#ffc90e" />
					<rect x="4" y="0" width="1" height="1" fill="#fff200" />
					<rect x="4" y="1" width="1" height="1" fill="#efe4b0" />
					<rect x="5" y="0" width="1" height="1" fill="#22b14c" />
					<rect x="5" y="1" width="1" height="1" fill="#b5e61d" />
					<rect x="6" y="0" width="1" height="1" fill="#00a2e8" />
					<rect x="6" y="1" width="1" height="1" fill="#99d9ea" />
					<rect x="7" y="0" width="1" height="1" fill="#3f48cc" />
					<rect x="7" y="1" width="1" height="1" fill="#7092be" />
					<rect x="8" y="0" width="1" height="1" fill="#a349a4" />
					<rect x="8" y="1" width="1" height="1" fill="#c8bfe7" />
				</svg>
				<div class="form players">
					<label>
						<span class="label">1</span>
						<input name="player-color" type="color" value="#ffc90e" data-player="0" />
					</label>
					<label>
						<span class="label">2</span>
						<input name="player-color" type="color" value="#00a2e8" data-player="1" />
					</label>
				</div>
			</section>

			<section>
				<h2>History</h2>
				<button class="clear-history" type="button">Clear</button>
				<div class="history"></div>
			</section>
		`;
		menu.addEventListener('transitionend', () => {
			if (menu.hasAttribute('data-closing')) {
				menu.setAttribute('data-closed', '');
			}
		});

		this.#columnCountInput = /**@type {HTMLInputElement}*/(menu.querySelector('[name="column-count"]'));
		this.#rowCountInput = /**@type {HTMLInputElement}*/(menu.querySelector('[name="row-count"]'));
		this.#piecesToWinInput = /**@type {HTMLInputElement}*/(menu.querySelector('[name="pieces-to-win"]'));
		/**@type {HTMLButtonElement}*/(menu.querySelector('.new-game')).addEventListener('click', () => this.newGameFromSettings());
		this.#historyContainer = /**@type {HTMLDivElement}*/(menu.querySelector('.history'));
		/**@type {HTMLButtonElement}*/(menu.querySelector('.clear-history')).addEventListener('click', () => this.#historyContainer.replaceChildren());

		const palette = /**@type {SVGElement}*/(menu.querySelector('.palette'));
		palette.addEventListener('click', (event) => {
			if (event.target instanceof SVGRectElement) {
				const fill = event.target.getAttribute('fill');

				if (fill) {
					const colorInput = /**@type {HTMLInputElement}*/(this.#menu.querySelector('[name="player-color"][data-player="0"]'));
					colorInput.value = fill;
					colorInput.dispatchEvent(new Event('input'));
				}
			}
		});
		palette.addEventListener('contextmenu', (event) => {
			if (event.target instanceof SVGRectElement) {
				const fill = event.target.getAttribute('fill');

				if (fill) {
					event.preventDefault();
					const colorInput = /**@type {HTMLInputElement}*/(this.#menu.querySelector('[name="player-color"][data-player="1"]'));
					colorInput.value = fill;
					colorInput.dispatchEvent(new Event('input'));
				}
			}
		});

		const board = this.#board = new ConnectNBoard();
		board.classList.add('board');
		this.newGameFromSettings();
		// @ts-ignore
		board.addEventListener(GAME_CHANGE_EVENT, ({ detail: game }) => this.addToHistory(game));

		[...this.#menu.querySelectorAll('[name="player-color"]')].forEach((colorInput, player) => {
			colorInput.addEventListener('input', () => {
				this.#board.setPlayerColor(player, /**@type {HTMLInputElement}*/(colorInput).value);
			});
		});

		const menuButton = document.createElement('button');
		menuButton.classList.add('menu-button');
		menuButton.type = 'button';
		menuButton.textContent = '⋮';
		menuButton.addEventListener('click', () => this.settingsHidden = !this.settingsHidden);

		container.append(menu, board);
		shadow.append(menuButton, container);
	}

	get playerColors() {
		return [...this.#menu.querySelectorAll('[name="player-color"]')].map(colorInput => /**@type {HTMLInputElement}*/(colorInput).value);
	}

	get settingsHidden() {
		return this.#settingsHidden;
	}

	set settingsHidden(settingsHidden) {
		this.#settingsHidden = settingsHidden;
		if (settingsHidden) {
			this.#menu.setAttribute('data-closing', '');
		}
		else {
			this.#menu.removeAttribute('data-closed');
			// let transition start before removing attribute
			setTimeout(() => this.#menu.removeAttribute('data-closing'), 1000 / 60);
		}
	}

	newGameFromSettings() {
		const game = newGame(newSettings(
			parseInt(this.#columnCountInput.value),
			parseInt(this.#rowCountInput.value),
			parseInt(this.#piecesToWinInput.value),
			2,
		));
		this.#board.game = game;
		this.playerColors.map((color, player) => this.#board.setPlayerColor(player, color));
		this.addToHistory(game);
	}

	/**
	 * @param {import('./connect-n.js').Game} game
	 */
	addToHistory(game) {
		const historyBoard = new ConnectNBoard();
		historyBoard.classList.add('history-board');
		historyBoard.disabled = true;
		historyBoard.game = game;
		this.playerColors.map((color, player) => historyBoard.setPlayerColor(player, color));
		historyBoard.tabIndex = 0;
		historyBoard.addEventListener('click', () => {
			this.#board.game = game;
			this.playerColors.map((color, player) => this.#board.setPlayerColor(player, color));
		});
		this.#historyContainer.prepend(historyBoard);
	}
}

export const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/*css*/`
	:host {
		--connect-n-game-padding: 1.5em;
		--connect-n-game-menu-width: 300px;
		--connect-n-game-border-color: rgb(0,0,0, 0.1);
		--connect-n-game-active-border-color: hsl(40, 100%, 50%);
		--connect-n-game-outline-color: hsl(50, 100%, 50%, 0.5);
		--connect-n-game-shadow-color: rgb(0,0,0, 0.5);
		display: block;
		overflow: hidden;
		box-sizing: border-box;
	}

	.container {
		display: flex;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	.menu-button {
		position: absolute;
		width: calc(var(--connect-n-game-padding) / 2);
		height: 100%;
		border: none;
		background: none;
		box-sizing: border-box;
		font-size: 1em;
		z-index: 1;
		font-family: inherit;
		font-weight: bold;
	}

	.menu-button::before {
		content: '';
		display: block;
		position: absolute;
		top: 50%;
		left: 0;
		width: calc(4 * var(--connect-n-game-padding));
		height: calc(4 * var(--connect-n-game-padding));
		transform: translateX(-50%) translateY(-50%) scale(0);
		border-radius: 50%;
		background: var(--connect-n-game-outline-color);
		z-index: -1;
		transition: 0.2s transform;
	}

	.menu-button:hover::before {
		transform: translateX(-50%) translateY(-50%) scale(1);
	}

	.menu {
		width: var(--connect-n-game-menu-width);
		display: flex;
		flex-direction: column;
		box-shadow: 0 0 4px var(--connect-n-game-shadow-color);
		box-sizing: border-box;
		overflow: auto;
		transition: 0.2s margin;
	}

	.menu[data-closing] {
		margin-left: calc(-1 * var(--connect-n-game-menu-width));
	}

	.menu[data-closed] {
		display: none;
	}

	header {
		padding: var(--connect-n-game-padding);
		border-bottom: thin solid var(--connect-n-game-border-color);
	}

	h1, h2 {
		margin: 0;
		font-size: 1.5em;
		font-weight: lighter;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 1em;
		padding: var(--connect-n-game-padding);
	}

	section:not(:last-child) {
		border-bottom: thin solid var(--connect-n-game-border-color);
	}

	.form {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: baseline;
		column-gap: 0.5em;
		row-gap: 0.75em;
	}

	.players {
		align-items: center; /* baseline of color input is wonky */
	}

	.label {
		display: block;
		text-align: end;
	}

	label {
		display: contents;
	}

	input {
		width: 100%;
		box-sizing: border-box;
		font-family: inherit;
	}

	input, button:not(.menu-button), .history-board {
		padding: 0.25em 0.75em;
		border: thin solid var(--connect-n-game-border-color);
		border-radius: 0.25em;
		outline: 0 solid var(--connect-n-game-outline-color);
		transition: 0.2s outline;
	}

	:is(input, button:not(.menu-button), .history-board):hover {
		border-color: var(--connect-n-game-active-border-color);
	}

	:is(input, button:not(.menu-button), .history-board):focus {
		border-color: var(--connect-n-game-active-border-color);
		outline-width: thick;
	}

	button:not(.menu-button) {
		padding: 0.25em 0.75em;
		background: #e9f0f0;
		font-family: inherit;
	}

	:is(button:not(.menu-button), .history-board):active {
		background: #d9e0e0;
	}

	input[type='color'] {
		padding: 0;
		overflow: hidden;
	}

	input[type='color']::-moz-color-swatch { /* no wrapper */
		padding: 0;
		border: thin solid white;
		border-radius: 0.25em;
	}

	input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	input[type='color']::-webkit-color-swatch {
		border: thin solid white;
		border-radius: 0.25em;
	}

	.new-game {
		grid-column-end: span 2;
	}

	.history {
		display: grid;
		align-items: center; /* fix aspect-ratio width overflow */
		gap: 1em;
	}

	.history-board {
		aspect-ratio: 64/27;
	}

	.board {
		padding: var(--connect-n-game-padding);
		flex: 1;
	}
`);
