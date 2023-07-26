import { ConnectNBoard } from './board.js';
import { createGame, createSettings, hasWinner } from './game.js';
import * as soundEffects from './sound-effects.js';

const _ = Object.freeze;

/**
 * @type {ReadonlyArray<readonly [hex: string, name: string]>}
 */
const defaultColors = _([
	_(/**@type {const}*/(['#f55c3d', 'Red'])),
	_(/**@type {const}*/(['#3db8f5', 'Blue'])),
	_(/**@type {const}*/(['#5cd65c', 'Green'])),
	_(/**@type {const}*/(['#ffbb33', 'Yellow'])),
]);

export class ConnectNApp extends HTMLElement {
	shadowRoot = this.attachShadow({ mode: 'open', delegatesFocus: true });
	history = /**@type {import('./game.js').Game[]}*/([]);

	constructor() {
		super();
		this.shadowRoot.adoptedStyleSheets = [styles];
		this.shadowRoot.append(template.content.cloneNode(true));
		const $ = this.shadowRoot.querySelector.bind(this.shadowRoot);
		this.container = /**@type {HTMLDivElement}*/($('#container'));
		this.undoButton = /**@type {HTMLButtonElement}*/($('#undo-button'));
		this.soundEffects = /**@type {HTMLInputElement}*/($("[name='sound-effects']"));
		this.vibrations = /**@type {HTMLInputElement}*/($("[name='vibrations']"));
		this.menuToggle = /**@type {HTMLInputElement}*/($("[name='menu']"));
		this.menu = /**@type {HTMLDivElement}*/($('#menu'));
		this.form = /**@type {HTMLFormElement}*/($('#form'));
		this.playerCount = /**@type {HTMLInputElement}*/($("[name='player-count']"));
		this.playerFields = /**@type {HTMLDivElement}*/($('#player-fields'));
		this.clearHistoryButton = /**@type {HTMLButtonElement}*/($('#clear-history'));
		this.historyContainer = /**@type {HTMLDivElement}*/($('#history-boards'));
		this.board = /**@type {ConnectNBoard}*/($('#board'));
		customElements.upgrade(this.board);
		// We use event capturing because we want to initialize the audio context before other events (that may play a sound effect or vibrate) are dispatched.
		this.addEventListener('pointerdown', this.onFirstInteraction, { once: true, capture: true });
		this.addEventListener('keydown', this.onFirstInteraction, { once: true, capture: true });
		this.container.addEventListener('click', this.onClick);
		this.undoButton.addEventListener('click', this.undoMove);
		/**@type {HTMLButtonElement}*/($('#restart-button')).addEventListener('click', this.restartGame);
		this.vibrations.addEventListener('input', () => this.vibrate(120));
		/**@type {HTMLInputElement}*/($("[name='particle-effects']")).addEventListener('input', () => this.board.particleEffects = !this.board.particleEffects);
		this.menuToggle.addEventListener('input', this.onMenuToggle);
		this.menu.addEventListener('transitionend', this.onMenuTransitionEnd);
		this.form.addEventListener('click', this.onFormClick);
		this.form.addEventListener('submit', this.onFormSubmit);
		this.form.addEventListener('reset', this.onFormReset);
		this.playerCount.addEventListener('input', this.onPlayerCountChange);
		this.playerFields.addEventListener('input', this.onPlayerFieldInput);
		this.clearHistoryButton.addEventListener('click', this.clearHistory);
		this.historyContainer.addEventListener('click', this.restoreState);
		/**@type {HTMLButtonElement}*/($('#scroll-to-top')).addEventListener('click', this.scrollToTop);
		this.board.addEventListener('keydown', this.onKeyDown);
		this.board.addEventListener('column-change', this.onColumnChange);
		this.board.addEventListener('column-overflow', this.onColumnOverflow);
		this.board.addEventListener('game-change', /**@type {any}*/(this.onGameChange));
		this.board.addEventListener('game-over', /**@type {any}*/(this.onGameOver));
		this.board.addEventListener('piece-impact', this.onPieceImpact);
		this.onPlayerCountChange();
	}

	onPlayerCountChange = () => {
		const count = Number(this.playerCount.value);
		if (!Number.isSafeInteger(count) || count < 1 || count > defaultColors.length) {
			return;
		}
		const fields = this.playerFields.querySelectorAll('.player');
		let i = 0;
		for (; i < count; i++) {
			if (fields[i]) {
				continue;
			}
			const color = this.container.style.getPropertyValue(`--connect-n-player-${i}`);
			const j = escape(i);
			const p = escape(i + 1);
			this.playerFields.insertAdjacentHTML('beforeend', /*html*/`
				<div class='player field' style='background: var(--connect-n-player-${j}); color: ${escape(colorContrast(color))}'>
					<label class='label' aria-label='Player ${p} Color Picker' title='Player ${p} Color Picker'>
						${icon('player-index')}
						<div class='field-text'>${p}</div>
						<div class='button'>
							${icon('bucket')}
						</div>
						<input class='input hidden-input' name='player-color' type='color' list='player-palette' value='${escape(color)}' data-player=${j} />
					</label>
					<label class='button' aria-label='Player ${p} AI Toggle' title='Player ${p} AI Toggle'>
						<input class='hidden-input' name='player-ai' type='checkbox' data-player=${j} ${this.board.aiPlayers.has(i) ? 'checked' : ''} />
						${icon('ai')}
					</label>
				</div>
			`.replace(/[\t\n]/g, ''));
		}
		for (; i < fields.length; i++) {
			fields[i].remove();
		}
	};

	/**
	 * @param {Event} event
	 */
	onPlayerFieldInput = event => {
		const target = /**@type {HTMLInputElement}*/(event.target);
		if (target.name === 'player-color') {
			const i = Number(target.dataset.player);
			this.container.style.setProperty(`--connect-n-player-${i}`, target.value);
			/**@type {HTMLDivElement}*/(/**@type {HTMLLabelElement}*/(target.parentElement).parentElement).style.color = colorContrast(target.value);
		}
		else if (target.name === 'player-ai') {
			this.board[target.checked ? 'addAi' : 'removeAi'](Number(target.dataset.player));
		}
	};

	/**
	 * @param {SubmitEvent} event
	 */
	onFormSubmit = event => {
		event.preventDefault();
		const form = new FormData(/**@type {HTMLFormElement}*/(event.target));
		const game = createGame(createSettings(
			Number(form.get('column-count')),
			Number(form.get('row-count')),
			Number(form.get('win-condition')),
			Number(form.get('player-count')),
		));
		if (!game.over) {
			this.board.game = game;
			this.clearHistory();
		}
	};

	onFormReset = () => {
		for (let i = 0; i < defaultColors.length; i++) {
			this.container.style.setProperty(`--connect-n-player-${i}`, defaultColors[i][0]);
		}
		// Input values get reset after this event listener is called so we want to wait until the next tick occurs.
		requestAnimationFrame(this.onPlayerCountChange);
		this.board.removeAi();
	};

	/**
	 * @param {boolean} condition
	 * @param {boolean} disable
	 */
	toggleHistoryButtons(condition, disable) {
		if (condition) {
			this.undoButton.disabled = disable;
			this.clearHistoryButton.disabled = disable;
		}
	}

	clearHistory = () => {
		this.history = [];
		this.historyContainer.replaceChildren();
		this.toggleHistoryButtons(true, true);
	};

	/**
	 * @param {MouseEvent} event
	 */
	restoreState = ({ target }) => {
		if (target instanceof ConnectNBoard) {
			for (const board of this.historyContainer.querySelectorAll('connect-n-board')) {
				this.history.pop();
				board.remove();
				if (board === target) {
					break;
				}
			}
			this.board.game = target.game;
			this.toggleHistoryButtons(this.history.length === 0, true);
		}
	};

	undoMove = () => {
		const game = this.history.pop();
		if (game) {
			this.board.suggestMoveAbortController?.abort();
			this.board.game = game;
			this.historyContainer.firstElementChild?.remove();
			this.toggleHistoryButtons(this.history.length === 0, true);
		}
	};

	restartGame = () => {
		this.board.game = createGame(this.board.game.settings);
		this.clearHistory();
	};

	onMenuToggle = () => {
		this.menu.inert = true;
		this.menu.hidden = false;

		if (this.menuToggle.checked) {
			// We have to remove the data-hidden attribute *after* the next repaint to get a transition.
			// The *after* part is why there are two calls to requestAnimationFrame which happens *before* the next repaint.
			// If we remove the data-hidden attribute in the same tick, there will be only 1 unique frame painted which means no animation is made.
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (this.menuToggle.checked) {
						delete this.menu.dataset.hidden;
					}
				});
			});
		}
		else {
			this.menu.ariaExpanded = 'false';
			this.menu.dataset.hidden = '';
		}
	};

	/**
	 * @param {TransitionEvent} event
	 */
	onMenuTransitionEnd = event => {
		if (event.propertyName === 'opacity') {
			this.menu.ariaExpanded = String(this.menuToggle.checked);
			this.menu.hidden = this.menu.inert = !this.menuToggle.checked;
		}
	};

	onFirstInteraction = () => {
		this.audioContext = new AudioContext();
		this.hasInteractedOnce = true;
		this.removeEventListener('pointerdown', this.onFirstInteraction);
		this.removeEventListener('keydown', this.onFirstInteraction);
	};

	/**
	 * @param {keyof typeof soundEffects} name
	 */
	playSoundEffect(name) {
		if (this.soundEffects.checked && this.audioContext) {
			const play = soundEffects[name];
			play(this.audioContext);
		}
	}

	/**
	 * @param {number | number[]} pattern
	 */
	vibrate(pattern) {
		if (this.vibrations.checked && this.hasInteractedOnce) {
			navigator.vibrate(pattern);
		}
	}

	onColumnChange = () => {
		this.playSoundEffect('tick');
		this.vibrate(3);
	};

	onColumnOverflow = () => {
		this.playSoundEffect('buzz');
		this.vibrate([6, 6, 12, 6, 6]);
	};

	/**
	 * @param {CustomEvent<Record<'newGame' | 'oldGame', import('./game.js').Game>>} event
	 */
	onGameChange = event => {
		const length = this.history.push(event.detail.oldGame);
		this.toggleHistoryButtons(length === 1, false);
		const board = this.board.clone();
		board.geometry.paddingBottom = board.geometry.paddingTop;
		board.geometry.marginBottom = 0;
		board.geometry.marginTop = -1 * board.cellHeight;
		board.className = 'history-board';
		this.historyContainer.prepend(board);
	};

	/**
	 * @param {CustomEvent<import('./game.js').Game>} event
	 */
	onGameOver = event => {
		if (hasWinner(event.detail)) {
			this.playSoundEffect('fanfare');
			this.vibrate([60, 15, 240]);
		}
	};

	onPieceImpact = () => {
		this.playSoundEffect('tack');
		this.vibrate(6);
	};

	/**
	 * @param {MouseEvent} event
	 */
	onClick = ({ target }) => {
		if (target instanceof HTMLButtonElement || target instanceof HTMLInputElement) {
			this.playSoundEffect('plop');
			this.vibrate(2);
		}
	};

	/**
	 * @param {MouseEvent} event
	 */
	onFormClick = ({ target }) => {
		if (target instanceof HTMLButtonElement) {
			if (target.dataset.decrease) {
				const input = /**@type {HTMLInputElement}*/(this.form.querySelector(`[name='${CSS.escape(target.dataset.decrease)}']`));
				const value = Number(input.value) - 1;
				if (value >= Number(input.min)) {
					input.value = String(value);
					input.dispatchEvent(new Event('input'));
				}
			}
			else if (target.dataset.increase) {
				const input = /**@type {HTMLInputElement}*/(this.form.querySelector(`[name='${CSS.escape(target.dataset.increase)}']`));
				const value = Number(input.value) + 1;
				if (value <= Number(input.max)) {
					input.value = String(value);
					input.dispatchEvent(new Event('input'));
				}
			}
		}
		else if (target instanceof HTMLInputElement) {
			target.select();
		}
	};

	/**
	 * @param {KeyboardEvent} event
	 */
	onKeyDown = ({ key }) => {
		if (key === 'w' || key === 'W' || key === 'ArrowUp') {
			this.undoMove();
		}
		else if (key === 'Backspace') {
			this.restartGame();
		}
	};

	scrollToTop = () => {
		this.menu.scrollTo({ top: 0, behavior: 'smooth' });
		this.menu.focus();
	};
}

/**
 * https://www.w3.org/TR/WCAG20/
 * @param {number} component
 * @returns {number}
 */
const relativeLuminance = component => {
	component /= 255;
	return component <= 0.03928
		? component / 12.92
		: ((component + 0.055) / 1.055) ** 2.4;
};

/**
 * Returns black or white depending on which contrasts with the given color the most.
 * This can be replaced with CSS `color-contrast()` when it's supported by browsers.
 * @param {string} color
 * @returns {string}
 */
const colorContrast = color => {
	const bits = Number.parseInt(color.substring(1), 16);
	const r = relativeLuminance(bits >> 16);
	const g = relativeLuminance((bits >> 8) & 0x00ff);
	const b = relativeLuminance(bits & 0xff);
	const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return L > 0.179 ? '#000000' : '#ffffff';
};

/**
 * @param {any} html
 * @returns {string}
 */
const escape = html => String(html).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

/**
 * @param {string} name
 * @returns {string}
 */
const icon = name => /*html*/`
<svg class='icon ${escape(name)}-icon' aria-hidden='true' viewBox='0 0 24 24'>
	<path class='icon-path' />
</svg>`;

/**
 * @param {string} name
 * @param {string} label
 * @param {boolean} checked
 * @returns {string}
 */
const toggle = (name, label, checked = true) => /*html*/`
<label class='button' aria-label='${escape(label)}' title='${escape(label)}'>
	<input class='hidden-input' name='${escape(name)}' type='checkbox' ${checked ? 'checked' : ''} />
	${icon(name)}
</label>`;

/**
 * @param {string} name
 * @param {string} label
 * @param {number} min
 * @param {number} value
 * @param {number} max
 * @returns {string}
 */
const field = (name, label, min, value, max) => /*html*/`
<div class='field'>
	<label class='label' aria-label='${escape(label)}' title='${escape(label)}'>
		${icon(name)}
		<input class='input' name='${escape(name)}' type='number' required min='${escape(min)}' value='${escape(value)}' max='${escape(max)}' step='1' size='${escape(String(max).length)}' style='--size: ${escape(String(max).length)}' />
	</label>
	<button class='button' type='button' aria-label='Decrease ${escape(label)}' title='Decrease ${escape(label)}' data-decrease='${escape(name)}'>
		${icon('minus')}
	</button>
	<button class='button' type='button' aria-label='Increase ${escape(label)}' title='Increase ${escape(label)}' data-increase='${escape(name)}'>
		${icon('plus')}
	</button>
</div>`;

export const template = document.createElement('template');
template.innerHTML = /*html*/`
<div part='container' id='container' style='${escape(defaultColors.reduce((css, [hex], i) => css + `--connect-n-player-${i}: ${hex}; `, ''))}'>
	<div id='layout'>
		<nav id='nav'>
			<button id='undo-button' class='button' type='button' aria-label='Undo' title='Undo'disabled>
				${icon('undo')}
			</button>
			<button id='restart-button' class='button' type='button' aria-label='Restart' title='Restart'>
				${icon('restart')}
			</button>
			${toggle('sound-effects', 'Sound Effects')}
			${toggle('vibrations', 'Vibrations')}
			${toggle('rounded-corners', 'Rounded Corners')}
			${toggle('particle-effects', 'Particle Effects')}
			${toggle('antialiasing', 'Antialiasing')}
			${toggle('menu', 'Menu', false)}
		</nav>
		<div id='menu' role='menu' aria-expanded='false' tabindex='0' inert data-hidden hidden>
			<form id='form'>
				<div class='header'>
					<img class='image' src='${escape(import.meta.resolve('./icon.svg'))}' alt='Connect N' title='Connect N' />
					<button class='button' type='reset' aria-label='Reset New Game Form' title='Reset New Game Form'>
						${icon('reset')}
					</button>
				</div>
				${field('column-count', 'Column Count', 1, 7, 15)}
				${field('row-count', 'Row Count', 1, 6, 15)}
				${field('win-condition', 'Number of Pieces Needed to Win', 1, 4, 15)}
				${field('player-count', 'Player Count', 1, 2, 4)}
				<div id='player-fields'></div>
				<button class='submit button' type='submit' aria-label='New Game' title='New Game'>
					${icon('play')}
				</button>
			</form>
			<div id='history'>
				<div class='header'>
					<div class='image'>
						${icon('history')}
					</div>
					<button id='clear-history' class='button' type='button' aria-label='Clear History' title='Clear History' disabled>
						${icon('trash')}
					</button>
				</div>
				<div id='history-boards'></div>
			</div>
			<button id='scroll-to-top' class='submit button' type='button' aria-label='Scroll to Top' title='Scroll to Top'>
				${icon('turn-around')}
			</button>
		</div>
		<connect-n-board exportparts='svg: board' id='board' playable particle-effects></connect-n-board>
	</div>
	<datalist id='player-palette'>
		${defaultColors.reduce((html, [hex, name]) => html + /*html*/`
			<option value='${escape(hex)}'>${escape(name)}</option>`, '')}
	</datalist>
</div>
`.replace(/[\t\n]/g, '');

export const styles = new CSSStyleSheet();
styles.replaceSync(/*css*/`
:host {
	display: block;
}
#container {
	line-height: 1;
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	container-type: size;
	container-name: container;
	background: var(--connect-n-app-background-color);
	color: var(--connect-n-app-foreground-color);
	overflow: hidden;
}
#container:not(:has([name='rounded-corners']:checked)) {
	--connect-n-piece-path: path('M -24,-24 H 24 V 24 H -24 Z');
	--connect-n-hole-path: var(--connect-n-piece-path);
	--connect-n-particle-path: path('M -3,-3 H 3 V 3 H -3 Z');
	--connect-n-board-radius: 0;
}
#container:not(:has([name='antialiasing']:checked)) {
	image-rendering: pixelated;
	shape-rendering: crispEdges;
	text-rendering: optimizeSpeed;
}
#layout {
	display: flex;
	width: 100%;
	height: 100%;
}
#nav {
	display: flex;
	overflow: auto;
}
#nav .icon {
	padding: 25%;
}
.button {
	position: relative;
	box-sizing: border-box;
	padding: 0;
	aspect-ratio: 1;
	background: none;
	color: inherit;
	font: inherit;
	border: none;
	outline-offset: -0.375em;
	user-select: none;
	transition: opacity 0.1s;
}
@media (hover: hover) {
	.button:not([disabled]):hover .icon-path {
		transform: scale(1.25);
	}
}
.button:not([disabled]):is(:active, :has(:active)) .icon-path {
	transform: scale(0.875);
}
.button:is(:focus-visible, :has(:focus-visible)) {
	border-radius: 0.75em;
	outline: 0.125em solid var(--connect-n-app-accent-color);
}
.button:disabled {
	opacity: 0.5;
}
.icon {
	display: block;
	fill: none;
	stroke: currentColor;
	stroke-width: 1;
	stroke-linecap: round;
	stroke-linejoin: round;
	pointer-events: none;
	user-select: none;
}
.icon-path {
	d: inherit;
	transform-origin: center;
	transition: d 0.1s, transform 0.1s;
}
.hidden-input {
	position: absolute;
	top: 0;
	left: 0;
	margin: 0;
	width: 100%;
	height: 100%;
	display: block;
	border: none;
	outline: none;
	opacity: 0;
	z-index: -1;
	contain: strict;
}
.hidden-input:checked + .icon {
	d: var(--d);
}
#menu {
	box-sizing: border-box;
	padding: 1.5em;
	background: var(--connect-n-app-menu-background-color);
	border-radius: 0.75em;
	outline-offset: -0.125em;
	overflow: auto;
	transition: margin 0.2s, opacity 0.2s, transform 0.2s;
}
#menu:focus-visible {
	outline: 0.125em solid var(--connect-n-app-accent-color);
}
#menu[data-hidden] {
	opacity: 0;
}
.header, .field {
	margin-block-end: 0.5em;
}
.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.image, .header .button {
	width: var(--connect-n-app-nav-size);
	height: var(--connect-n-app-nav-size);
}
.header .icon {
	padding: 25%;
}
.field {
	display: flex;
	min-inline-size: min-content;
	background: var(--connect-n-app-background-color);
	--outline-color: var(--connect-n-app-accent-color);
}
.field, .submit.button {
	border-radius: 0.5em;
	outline-offset: -0.125em;
}
@media (hover: hover) {
	.field:has(.input:hover) {
		outline: 0.125em solid color-mix(in srgb, var(--outline-color), transparent);
	}
}
.field:has(.input:focus) {
	outline: 0.125em solid var(--outline-color);
}
.field .icon, .submit .icon {
	width: var(--connect-n-app-icon-size);
	height: var(--connect-n-app-icon-size);
	padding: 0.375em;
}
.field .button {
	border-radius: 0.625em;
	outline-color: var(--outline-color);
}
.label {
	flex: 1;
	display: flex;
	position: relative;
}
.input {
	flex: 1;
	appearance: textfield;
	inline-size: 100%;
	min-inline-size: calc(var(--size) * 1ch);
	padding: 0;
	background: none;
	color: inherit;
	font: inherit;
	border: none;
	outline: none;
}
.input::-webkit-inner-spin-button, .input::-webkit-outer-spin-button {
	appearance: none;
}
.field-text {
	flex: 1;
	align-self: center;
}
.player {
	--outline-color: currentColor;
}
.submit {
	background: var(--connect-n-app-button-background-color);
	inline-size: 100%;
	aspect-ratio: unset;
}
.submit {
	transition: filter 0.1s;
}
@media (hover: hover) {
	.submit:hover {
		filter: brightness(1.25);
	}
}
.submit:active {
	filter: brightness(0.875);
}
.submit .icon {
	margin: auto;
}
#history {
	margin-block-start: 1.5em;
	--connect-n-board-fill: var(--connect-n-app-background-color);
	--connect-n-board-padding-bottom: var(--connect-n-board-padding-top);
	--connect-n-board-margin-bottom: 0px;
	--connect-n-board-margin-top: calc(-1 * var(--connect-n-cell-height));
}
.history-board::part(svg) {
	margin-block-end: 0.5em;
}
@media (hover: hover) {
	.history-board::part(svg):hover {
		--connect-n-board-stroke: color-mix(in srgb, var(--connect-n-app-accent-color), transparent);
	}
}
.history-board::part(svg):is(:active, :focus-visible) {
	--connect-n-board-stroke: var(--connect-n-app-accent-color);
}
.history-board::part(svg):active {
	filter: brightness(1.25);
}
#board::part(svg) {
	flex: 1;
	box-sizing: border-box;
	padding-inline: 0.375em;
	touch-action: pinch-zoom;
	transition: padding 0.1s;
	overflow: clip;
	min-width: 0;
	min-height: 0;
}
@container container (orientation: landscape) {
	#nav {
		flex-direction: column;
		inline-size: var(--connect-n-app-nav-size);
		block-size: 100%;
	}
	#nav .button:first-child {
		margin-block-start: auto;
	}
	#nav .button:last-child {
		margin-block-end: auto;
	}
	#menu {
		margin-block: 0.75em;
		inline-size: var(--connect-n-app-menu-inline-size);
		max-inline-size: calc(100% - 2 * var(--connect-n-app-nav-size));
	}
	#menu[data-hidden] {
		margin-inline-start: calc(-1 * var(--connect-n-app-menu-inline-size));
		transform: translateX(calc(-1 * var(--connect-n-app-nav-size)));
	}
	#layout:not(:has([name='menu']:checked)) #board::part(svg) {
		padding-inline-start: 0;
		padding-inline-end: var(--connect-n-app-nav-size);
	}
}
@container container (orientation: portrait) {
	#layout {
		flex-direction: column;
	}
	#nav {
		block-size: var(--connect-n-app-nav-size);
	}
	#nav .button:first-child {
		margin-inline-start: auto;
	}
	#nav .button:last-child {
		margin-inline-end: auto;
	}
	#menu {
		margin-inline: 0.75em;
		block-size: var(--connect-n-app-menu-block-size);
		max-block-size: calc(100% - 2 * var(--connect-n-app-nav-size));
	}
	#menu[data-hidden] {
		margin-block-start: calc(-1 * var(--connect-n-app-menu-block-size));
		transform: translateY(calc(-1 * var(--connect-n-app-nav-size)));
	}
}
.undo-icon { d: path('m 4.5,11.5 h 15 m -8,-7 -7,7 7,7'); }
.restart-icon { d: path('m 19.5,4.5 v 4 h -4 M 19,8 C 17.421088,5.7919147 14.713815,4.4382782 12,4.5 9.914449,4.5474328 7.854308,5.411134 6.3740228,6.8810076 4.8937375,8.3508812 4.0139394,10.413956 4,12.5 3.9859911,14.596445 4.848825,16.683573 6.3332299,18.164053 7.8176349,19.644532 9.9035088,20.501293 12,20.5 c 2.266296,-0.0014 4.513484,-1.011367 6.01913,-2.705218 C 19.524775,16.100931 20.264315,13.75083 20,11.5'); }
.sound-effects-icon { d: path('M 20,4 4,20 m 10.499777,-8.875007 c 0.01227,0.506088 0.01227,1.243953 0,1.750015 m 0,-1.441192 c 0.0079,0.327473 0.0079,0.804915 0,1.132362 M 10.500224,9 H 7.500223 c -0.5522848,0 -1,0.4477153 -1,1 v 4 c 0,0.552285 0.4477152,1 1,1 h 3.000001 l 3.292448,4.292893 c 0.26094,0.26094 0.707105,0.07613 0.707105,-0.292893 V 5 c 0,-0.3690249 -0.482526,-0.585713 -0.707105,-0.2928932 z'); --d: path('m 12.5,11.5 0,0 M 17.511378,6.5363053 c 2.651496,3.1599303 2.651496,7.7674597 0,10.9273897 M 15.213244,8.4646681 c 1.715674,2.0446609 1.715674,5.0260029 0,7.0706639 M 8.5002239,9 H 5.500223 c -0.5522848,0 -1,0.4477153 -1,1 v 4 c 0,0.552285 0.4477152,1 1,1 h 3.0000009 l 3.2924481,4.292893 c 0.26094,0.26094 0.707105,0.07613 0.707105,-0.292893 V 5 c 0,-0.3690249 -0.482526,-0.585713 -0.707105,-0.2928932 z'); }
.vibrations-icon { d: path('M 20,4 4,20 M 20.5,10 v 4 m -2,-5 v 6 m -15,-5 v 4 m 2,-5 v 6 M 9,4.5 h 6 c 0.831,0 1.5,0.669 1.5,1.5 v 12 c 0,0.831 -0.669,1.5 -1.5,1.5 H 9 C 8.169,19.5 7.5,18.831 7.5,18 V 6 C 7.5,5.169 8.169,4.5 9,4.5 Z'); --d: path('m 16.5,7.5 0,0 m 4,1.5 v 6 m -2,-7 v 8 M 3.5,9 v 6 m 2,-7 v 8 M 9,4.5 h 6 c 0.831,0 1.5,0.669 1.5,1.5 v 12 c 0,0.831 -0.669,1.5 -1.5,1.5 H 9 C 8.169,19.5 7.5,18.831 7.5,18 V 6 C 7.5,5.169 8.169,4.5 9,4.5 Z'); }
.rounded-corners-icon { d: path('M 20.000002,4 4,19.999998 M 13.000082,5.5760815 c 2.789316,0.4305923 4.993244,2.6345202 5.423836,5.4238365 M 7.5,7.5 H 12 c 2.485281,0 4.5,2.0147186 4.5,4.5 v 7.5 h -9 z'); --d: path('m 15.181981,8.8180199 0,0 M 13.999754,4.5764101 c 2.789316,0.4305923 4.993244,2.6345202 5.423836,5.4238369 M 7.5,7.5 H 12 c 2.485281,0 4.5,2.0147186 4.5,4.5 v 7.5 h -9 z'); }
.particle-effects-icon { d: path('m 12.5,3.5 -1,3 z M 20,4 4,20 Z m -9.5,5.5 c -2.209139,0 -4,1.790861 -4,4 0,2.209139 1.790861,4 4,4 2.209139,0 4,-1.790861 4,-4 0,-2.209139 -1.790861,-4 -4,-4 z m 10,2 -3,1 z'); --d: path('m 11.5,4.5 -1,3 z m 6,2 -3,3 z m -8,4 c -2.209139,0 -4,1.790861 -4,4 0,2.209139 1.790861,4 4,4 2.209139,0 4,-1.790861 4,-4 0,-2.209139 -1.790861,-4 -4,-4 z m 10,2 -3,1 z'); }
.antialiasing-icon { d: path('M 19.999999,4 4,20.000003 M 13.42776,6.6715284 C 15.839457,7.3177406 17.51644,9.5032281 17.51644,12 c 0,2.496772 -1.676983,4.68226 -4.08868,5.328472 M 11.5,4.5 v 15 m 3.8e-5,-2 C 8.6270256,17.277718 6.4091297,14.881599 6.4091282,12 6.4091282,9.1184149 8.6270025,6.722301 11.5,6.5'); --d: path('m 16.596301,7.4036987 0,0 M 13.682324,5.7214822 C 16.524017,6.4829116 18.5,9.0580632 18.5,12 c 0,2.941937 -1.975983,5.517089 -4.817676,6.278518 M 11.5,3.5 v 17 M 11.4986,18.480629 C 8.1133401,18.218715 5.5000018,15.395377 5.5,12 5.5,8.6046393 8.1133129,5.7813074 11.498555,5.519371'); }
.menu-icon { d: path('m 17.5,6.5 0,0 M 17.5,6.5 17.5,6.5 M 4.5,18.5 h 15 m -15,-6 h 15 m -15,-6 h 15'); --d: path('m 13.5,3.5 6,6 m 0,-6 -6,6 m -7,9 h 14 M 5,12.5 h 10.5 m -12,-6 h 7'); }
.reset-icon { d: path('m 4.5,4.5 v 4 h 4 M 5,8 C 6.578912,5.7919147 9.286185,4.4382782 12,4.5 14.085551,4.547433 16.145692,5.411134 17.625977,6.8810076 19.106262,8.3508812 19.98606,10.413956 20,12.5 20.01401,14.596445 19.151175,16.683573 17.66677,18.164053 16.182365,19.644532 14.096491,20.501293 12,20.5 9.733704,20.4986 7.486516,19.488633 5.98087,17.794782 4.475225,16.100931 3.735685,13.75083 4,11.5'); }
.minus-icon { d: path('m 14.5,12.5 h -5'); }
.plus-icon { d: path('M 16,12.5 H 9 M 12.5,9 v 7'); }
.column-count-icon { d: path('m 13.5,16.5 2,2 2,-2 m -2,-11 v 13 m -2,-11 2,-2 2,2 m -11,9 2,2 2,-2 m -2,-11 v 13 m -2,-11 2,-2 2,2'); }
.row-count-icon { d: path('m 7.5,13.5 -2,2 2,2 m 11,-2 -13,0 m 11,-2 2,2 -2,2 m -9,-11 -2,2 2,2 m 11,-2 -13,0 m 11,-2 2,2 -2,2'); }
.win-condition-icon { d: path('m 8.5,19.5 v -11 l 7,7 v -11 m -9,13 2,2 2,-2 m 3,-11 2,-2 2,2'); }
.player-count-icon { d: path('m 16.5,18.5 h 3.168806 c 0,0 -0.0851,-3.846339 -1.285714,-5.142857 C 17.769204,12.69422 16.71517,12.5 15.811663,12.5 c -0.365381,0 -0.754473,0.03216 -1.130022,0.113839 M 17.5,9 c 0,0.8284271 -0.671573,1.5 -1.5,1.5 -0.828427,0 -1.5,-0.6715729 -1.5,-1.5 0,-0.8284271 0.671573,-1.5 1.5,-1.5 0.828427,0 1.5,0.6715729 1.5,1.5 z M 7,13.5 c 0.7162028,-0.773411 1.9459074,-1 3,-1 1.054093,0 2.283797,0.226589 3,1 1.400721,1.512607 1.5,6 1.5,6 h -9 c 0,0 0.099279,-4.487393 1.5,-6 z M 12.5,8 c 0,1.3807119 -1.119288,2.5 -2.5,2.5 C 8.6192881,10.5 7.5,9.3807119 7.5,8 7.5,6.6192881 8.6192881,5.5 10,5.5 c 1.380712,0 2.5,1.1192881 2.5,2.5 z'); }
.player-index-icon { d: path('m 6,13.5 c 0.7162028,-0.773411 1.9459074,-1 3,-1 1.054093,0 2.283797,0.226589 3,1 1.400721,1.512607 1.5,6 1.5,6 h -9 c 0,0 0.099279,-4.487393 1.5,-6 z M 11.5,8 C 11.5,9.3807119 10.380712,10.5 9,10.5 7.6192881,10.5 6.5,9.3807119 6.5,8 6.5,6.6192881 7.6192881,5.5 9,5.5 c 1.380712,0 2.5,1.1192881 2.5,2.5 z m 4,5.5 2.25,-9 m 3,0 -2.25,9 m -4,-3 h 7 m 0.5,-3 h -7'); }
.bucket-icon { d: path('M 8.6336813,10.732051 C 6.7774172,11.266207 5.453175,12.701064 4.7497063,14.5 c -0.1277307,0.326638 -0.2286034,0.666032 -0.2660476,1.014752 -0.037444,0.348719 -0.0097,0.707999 0.112906,1.036595 0.1226044,0.328596 0.3440677,0.624925 0.6428284,0.808635 0.2987606,0.18371 0.8479589,0.211075 1.1820355,0.104304 0.2703454,-0.0864 0.5358818,-0.242173 0.6964711,-0.476191 0.1605893,-0.234017 0.2550954,-0.508734 0.3044437,-0.788229 0.098696,-0.558991 0.022328,-1.13236 0.034543,-1.699866 0.030209,-1.403568 0.1728084,-2.78666 1.1767949,-3.767949 z M 16.894659,7.3197467 c 1.908235,-0.2443186 3.332212,0.1620187 3.553604,0.9882678 v 0 c 0.194302,0.7251418 -0.576334,1.642404 -1.991698,2.3706515 -0.583836,0.300402 -1.249179,0.553656 -1.942879,0.739532 M 19.248266,12 l 0.25144,0.5 c 0.549377,0.951547 -0.748827,2.700283 -2.883974,3.93301 -2.135147,1.232731 -4.432673,1.250593 -5.116026,0.06699 L 8.6336813,10.732051 C 8,9.456751 9.2279985,7.6964562 11.38368,6.5 13.549482,5.2979265 15.925631,5.5032763 16.365731,6.2679492 l 2.191552,4.3579988 M 16.365731,6.2679492 c 0.616364,1.0675728 -0.614854,2.9323357 -2.75,4.1650628 -2.135147,1.232727 -4.3656857,1.366611 -4.9820497,0.299039'); }
.ai-icon { d: path('m 14,8.5 -4,4 m 0,-4 4,4 m -4.5,6 c 1.667667,0.001 3.334333,0.001 5,0 m -2.5,-3 c 10e-4,0.667667 10e-4,2.334333 0,3 M 6.5,5.5 h 11 c 0.554,0 1,0.446 1,1 v 8 c 0,0.554 -0.446,1 -1,1 h -11 c -0.554,0 -1,-0.446 -1,-1 v -8 c 0,-0.554 0.446,-1 1,-1 z'); --d: path('m 15,8.5 -4,4 m -2,-2 2,2 m -1.5,6 c 1.667667,0.001 3.334333,0.001 5,0 m -2.5,-3 c 10e-4,0.667667 10e-4,2.334333 0,3 M 6.5,5.5 h 11 c 0.554,0 1,0.446 1,1 v 8 c 0,0.554 -0.446,1 -1,1 h -11 c -0.554,0 -1,-0.446 -1,-1 v -8 c 0,-0.554 0.446,-1 1,-1 z'); }
.play-icon { d: path('m 18.5,12 -11,6.5 v -13 z'); }
.history-icon { d: path('m 11.5,8.5 v 5 h 3 m -10,-9 v 4 h 4 M 5,8 C 6.578912,5.7919147 9.286185,4.4382782 12,4.5 14.085551,4.547433 16.145692,5.411134 17.625977,6.8810076 19.106262,8.3508812 19.98606,10.413956 20,12.5 20.01401,14.596445 19.151175,16.683573 17.66677,18.164053 16.182365,19.644532 14.096491,20.501293 12,20.5 9.733704,20.4986 7.486516,19.488633 5.98087,17.794782 4.475225,16.100931 3.735685,13.75083 4,11.5'); }
.trash-icon { d: path('m 9.5,5.5 c 0,-0.704866 0,-1.4107179 0.83385,-1.7641579 0.83385,-0.3534401 2.50045,-0.3534401 3.3333,0 C 14.5,4.0892821 14.5,4.795134 14.5,5.5 m -1,3 v 7.989655 M 10.5,8.5 v 7.989655 M 4.5,5.5 h 15 M 6.0051814,5.5 6.8810435,18 C 6.9401013,18.842853 7.6550806,19.489655 8.5,19.489655 h 7 c 0.84492,0 1.559899,-0.646802 1.618957,-1.489655 L 17.994819,5.5'); }
.turn-around-icon { d: path('m 15.5,10.5 -2,-2 -2,2 m -2,-1 v 4 a 2,2 45 0 0 2,2 2,2 135 0 0 2,-2 v -5 m -0.734495,-5.6860649 8.420559,8.4205589 c 0.42409,0.42409 0.42409,1.10692 0,1.53101 l -8.420559,8.420559 c -0.42409,0.42409 -1.106921,0.42409 -1.531011,0 L 2.8139358,12.765505 c -0.4240901,-0.42409 -0.4240902,-1.106921 -3e-7,-1.531011 L 11.234495,2.8139349 c 0.424089,-0.42409 1.10692,-0.4240899 1.53101,2e-7 z'); }
`);

export const rootStyles = new CSSStyleSheet();
rootStyles.replaceSync(/*css*/`
:root {
	--connect-n-app-icon-size: 1.5em;
	--connect-n-app-nav-size: 3em;
	--connect-n-app-menu-inline-size: 16em;
	--connect-n-app-menu-block-size: 25.5em;
	--connect-n-app-background-color: var(--connect-n-board-stroke);
	--connect-n-app-menu-background-color: var(--connect-n-board-fill);
	--connect-n-app-button-background-color: #545454;
	--connect-n-app-foreground-color: #e0e0e0;
	--connect-n-app-accent-color: #808080;
}
`);

document.adoptedStyleSheets.push(rootStyles);
customElements.define('connect-n-app', ConnectNApp);
