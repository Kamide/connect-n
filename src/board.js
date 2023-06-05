import { createMoveSuggester } from './ai-worker.js';
import { clampColumn, columnMidpointOf, createGame, createSettings, firstColumn, hasSameGeometry, isValidColumn, lastColumnOf, playColumn, validConnectionsOf } from './game.js';

const fps = 1000 / 60;
const settings = createSettings(7, 6, 4, 2);
const createElement = /**@type {<K extends keyof SVGElementTagNameMap>(qualifiedName: K) => SVGElementTagNameMap[K]}*/(document.createElementNS.bind(document, 'http://www.w3.org/2000/svg'));

export class ConnectNBoard extends HTMLElement {
	static observedAttributes = /**@type {const}*/(['playable', 'particle-effects']);

	shadowRoot = this.attachShadow({ mode: 'open', delegatesFocus: true });
	activeColumn = -1;
	activePoint = new DOMPoint();
	aiDepth = 4;
	aiPlayers = new Set();
	cellHeight = 60;
	cellWidth = 60;
	enableDiffing = true;
	playbackRate = 1;

	/**
	 * Used to calculate SVG regular (non-presentation) attributes such as `viewBox` for `<svg>` and `width` and `height` for `<pattern>`.
	 * This is used instead of `getBBox` or `computedStyleMap` because they are less performant as the number of boards increases (well over 16ms when there are more than 10 boards).
	 */
	geometry = {
		paddingTop: 12,
		paddingBottom: 56,
		paddingLeft: 12,
		paddingRight: 12,
		marginTop: 0,
		marginBottom: -44,
		marginLeft: 0,
		marginRight: 0,
		strokeWidth: 4,
	};

	_game = createGame(settings);
	get game() { return this._game; }
	set game(newGame) {
		this.suggestMoveAbortController?.abort();
		const oldGame = this._game;
		this._game = newGame;
		this.render(newGame, oldGame);
	}

	_playable = false;
	get playable() { return this._playable; }
	set playable(on) { this.toggleAttribute('playable', on); }

	_particleEffects = false;
	get particleEffects() { return this._particleEffects; }
	set particleEffects(on) { this.toggleAttribute('particle-effects', on); }

	constructor() {
		super();
		this.shadowRoot.adoptedStyleSheets = [styles];
		this.shadowRoot.append(template.content.cloneNode(true));
		const $ = /**@type {(id: string) => SVGElement}*/(/**@type {any}*/(this.shadowRoot.getElementById.bind(this.shadowRoot)));
		this.svg = /**@type {SVGSVGElement}*/($('svg'));
		this.holeFillPattern = /**@type {SVGPatternElement}*/($('hole-fill-pattern'));
		this.holeStrokePattern = /**@type {SVGPatternElement}*/($('hole-stroke-pattern'));
		this.piecesBottomLayer = /**@type {SVGGElement}*/($('pieces-bottom-layer'));
		this.pieces = /**@type {SVGGElement}*/($('pieces'));
		this.piecesTopLayer = /**@type {SVGGElement}*/($('pieces-top-layer'));
		this.activePiece = /**@type {SVGPathElement}*/($('active-piece'));
		this.activePiece.remove();
		this.connections = /**@type {SVGGElement}*/($('connections'));
		this.particles = /**@type {SVGGElement}*/($('particles'));
	}

	clone() {
		const board = new ConnectNBoard();
		board.enableDiffing = false;
		board.game = this.game;
		const pieces = /**@type {SVGGElement}*/(this.pieces.cloneNode(true));
		board.pieces.replaceWith(pieces);
		board.pieces = pieces;
		return board;
	}

	connectedCallback() {
		this.render(this.game);
	}

	disconnectedCallback() {
		this.aiAnimation?.cancel();
		this.bounceAnimation?.cancel();
		this.fallingAnimation?.cancel();
	}

	/**
	 * @param {(typeof ConnectNBoard.observedAttributes)[number]} name
	 * @param {string | null} oldValue
	 * @param {string | null} newValue
	 */
	attributeChangedCallback(name, oldValue, newValue) {
		const on = newValue !== null;
		if (name === 'playable') {
			if (on !== this._playable) {
				this._playable = on;
				const toggle = (on ? this.svg.addEventListener : this.svg.removeEventListener).bind(this.svg);
				toggle('pointerdown', this.onPointerDown);
				toggle('pointerup', this.onPointerUp);
				toggle('blur', this.unsetPointerId);
				toggle('keydown', this.onKeyDown);
			}
		}
		else if (name === 'particle-effects') {
			if (on !== this._particleEffects) {
				this._particleEffects = on;
				for (const animation of this.particles.getAnimations({ subtree: true })) {
					// A Promise.allSettled that removes the particles from the DOM is waiting for this event.
					animation.finish();
				}
			}
		}
	}

	updateSvgMatrix = () => {
		// Optional chaining is used here because getScreenCTM returns null in Firefox when the SVG is dimensionless.
		this.svgMatrix = this.svg.getScreenCTM()?.inverse();
	};

	updatePlaybackRate(playbackRate = 1) {
		if (playbackRate !== this.playbackRate && Number.isFinite(playbackRate) && playbackRate > 0) {
			this.playbackRate = playbackRate;
			for (const animation of this.shadowRoot.getAnimations()) {
				animation.updatePlaybackRate(playbackRate);
			}
		}
	}

	/**
	 * @param {import('./game.js').Game} newGame
	 * @param {import('./game.js').Game} [oldGame]
	 */
	async render(newGame, oldGame) {
		if (!this.isConnected) {
			return;
		}

		this.fallingAnimation?.commitStyles();
		this.aiAnimation?.cancel();
		this.fallingAnimation?.commitStyles();
		this.fallingAnimation?.cancel();

		// We want the active piece to hit the topmost piece first before starting the next move.
		// This means we will be awaiting this value, but we need to make sure to unset it first.
		// Otherwise, we will get a stale closure and the next move will never start.
		// Although there is a finally block to unset this, it occurs asynchronously.
		this.fallingAnimation = /**@type {Animation | undefined}*/(undefined);

		const geometryChanged = !oldGame || !hasSameGeometry(newGame, oldGame);
		if (geometryChanged) {
			this.svg.style.setProperty('--connect-n-column-count', String(newGame.settings.columnCount));
			this.svg.style.setProperty('--connect-n-row-count', String(newGame.settings.rowCount));
			this.svg.viewBox.baseVal.x = -1 * this.geometry.paddingLeft - this.geometry.strokeWidth / 2 - this.geometry.marginLeft;
			this.svg.viewBox.baseVal.y = -1 * this.geometry.paddingTop - this.geometry.strokeWidth / 2 - this.cellHeight - this.geometry.marginTop;
			this.svg.viewBox.baseVal.width = newGame.settings.columnCount * this.cellWidth + this.geometry.paddingLeft + this.geometry.paddingRight + this.geometry.strokeWidth + this.geometry.marginLeft + this.geometry.marginRight;
			this.svg.viewBox.baseVal.height = (newGame.settings.rowCount + 1) * this.cellHeight + this.geometry.paddingTop + this.geometry.paddingBottom + this.geometry.strokeWidth + this.geometry.marginTop + this.geometry.marginBottom;
			this.holeStrokePattern.width.baseVal.value = this.holeFillPattern.width.baseVal.value = 1 / newGame.settings.columnCount;
			this.holeStrokePattern.height.baseVal.value = this.holeFillPattern.height.baseVal.value = 1 / newGame.settings.rowCount;
		}

		if (this.enableDiffing) {
			const shouldAnimate = this.playable && !geometryChanged && Math.abs(newGame.pieces.length - oldGame.pieces.length) === 1;
			const pieces = this.pieces.querySelectorAll('path');
			let i = 0;

			// Adding pieces to the DOM.
			for (; i < newGame.pieces.length; i++) {
				const { column, row, player } = newGame.pieces[i];
				const fill = `var(--connect-n-player-${player})`;
				let piece = pieces[i];
				if (piece) {
					if (Number(piece.dataset.column) !== column) {
						piece.style.setProperty('--connect-n-column', piece.dataset.column = String(column));
					}
					if (Number(piece.dataset.row) !== row) {
						piece.style.setProperty('--connect-n-row', piece.dataset.row = String(row));
					}
					if (piece.style.fill !== fill) {
						piece.style.fill = fill;
					}
				}
				else {
					piece = createElement('path');
					piece.classList.add('piece');
					piece.style.setProperty('--connect-n-column', piece.dataset.column = String(column));
					piece.style.setProperty('--connect-n-row', piece.dataset.row = String(row));
					piece.style.fill = fill;
					this.pieces.append(piece);
					if (shouldAnimate) {
						this.animatePiece(piece, newGame, column, row, player);
					}
				}
			}

			// Removing pieces from the DOM.
			for (; i < pieces.length; i++) {
				const piece = pieces[i];
				if (shouldAnimate) {
					this.piecesBottomLayer.append(piece);
					const animation = piece.animate([
						{},
						{ transform: 'scale(0)' },
					], {
						composite: 'add',
						duration: 24 * fps,
						easing: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
					});
					animation.updatePlaybackRate(this.playbackRate);
					animation.finished.then(() => piece.remove());
				}
				else {
					piece.remove();
				}
			}
		}

		try { await this.fallingAnimation?.finished; }
		catch { return; }
		finally { this.startMove(newGame); }

		if (newGame.over) {
			try { await this.bounceAnimation?.finished; }
			catch { return; }

			this.renderConnections(newGame);
		}
		else if (oldGame?.over) {
			this.connections.replaceChildren();
		}
	}

	/**
	* @param {SVGPathElement} piece
	* @param {import('./game.js').Game} game
	* @param {number} column
	* @param {number} row
	* @param {number} player
	*/
	async animatePiece(piece, game, column, row, player) {
		this.fallingAnimation = piece.animate([
			{ '--connect-n-row': game.settings.rowCount },
			{ '--connect-n-row': row },
		], {
			duration: 8 * fps * (game.settings.rowCount - row),
			easing: 'cubic-bezier(0.5, 0, 0.75, 0)',
		});
		this.fallingAnimation.updatePlaybackRate(this.playbackRate);

		try { await this.fallingAnimation.finished; }
		catch { return; }
		finally { this.fallingAnimation = undefined; }

		this.dispatchEvent(new CustomEvent('piece-impact', { detail: { column, row, player } }));
		this.renderParticles(game, column, row, player);

		for (const previous of /**@type {NodeListOf<SVGPathElement>}*/(this.pieces.querySelectorAll(`[data-column='${CSS.escape(String(column))}']:not([data-row='${CSS.escape(String(row))}'])`))) {
			const r = Number(previous.dataset.row);
			if (r < row) {
				const decay = (r + 1) / row;
				if (decay) {
					const animation = previous.animate([
						{},
						{ '--connect-n-row': 0.1 * decay },
						{},
					], {
						composite: 'add',
						duration: 4.5 * fps,
					});
					animation.updatePlaybackRate(this.playbackRate);
				}
			}
		}

		const up = 'cubic-bezier(0.25, 1, 0.5, 1)';
		const down = 'cubic-bezier(0.76, 0, 0.24, 1)';
		const decay = 1 / (row / 2 + 1);
		this.bounceAnimation = piece.animate([
			{ '--connect-n-row': row, easing: up },
			{ '--connect-n-row': row + 0.5 * decay, easing: down, offset: 3 / 12 },
			{ '--connect-n-row': row, easing: up, offset: 6 / 12 },
			{ '--connect-n-row': row + 0.2 * decay, easing: down, offset: 8 / 12 },
			{ '--connect-n-row': row, easing: up, offset: 10 / 12 },
			{ '--connect-n-row': row + 0.1 * decay, easing: down },
		], { duration: 24 * fps * decay });
		this.bounceAnimation.updatePlaybackRate(this.playbackRate);

		try { await this.bounceAnimation.finished; }
		catch { return; }
		finally { this.bounceAnimation = undefined; }
	}

	/**
	 * @param {import('./game.js').Game} game
	 * @param {number} column
	 * @param {number} row
	 * @param {number} player
	 */
	renderParticles(game, column, row, player) {
		if (!this.particleEffects) {
			return;
		}

		const fragment = document.createDocumentFragment();
		const startingAngle = Math.random() * 2 * Math.PI;
		const count = 12;

		for (let i = 0; i < count; i++) {
			const angle = 2 * Math.PI / count * i + startingAngle;
			let x = this.cellWidth * (column + 0.5);
			let y = this.cellHeight * (game.settings.rowCount - row);
			let offsetPath = `M ${x},${y} `;

			for (let i = 0; i < 10; i++) {
				x += this.cellWidth / 15 * Math.cos(angle) + (Math.round(Math.random()) ? 1 : -1) * Math.random() * this.cellWidth / 30;
				y += this.cellHeight / 15 * Math.sin(angle) + (Math.round(Math.random()) ? 1 : -1) * Math.random() * this.cellHeight / 30 + this.cellHeight / 60 * (i - 4);
				offsetPath += `L ${x},${y} `;
			}

			// Optional chaining is used here because there are no pieces before the first row.
			const previousPlayer = game.pieces[game.graph[column][row - 1]?.piece]?.player ?? player;
			const path = createElement('path');
			path.classList.add('particle');
			path.style.color = `color-mix(in hsl, var(--connect-n-player-${player}), var(--connect-n-player-${previousPlayer}))`;
			path.style.offsetPath = `path('${CSS.escape(offsetPath)}')`;
			path.style.transform = 'scale(0)';
			fragment.append(path);

			const duration = (Math.random() * 24 * fps + 12 * fps);

			const pathOffsetAnimation = path.animate([
				{},
				{ offsetDistance: '100%' },
			], {
				duration,
				easing: 'cubic-bezier(0.61, 1, 0.88, 1)',
			});
			pathOffsetAnimation.updatePlaybackRate(this.playbackRate);

			const scaleAnimation = path.animate([
				{},
				{ transform: `scale(${Math.random() * 0.75 + 0.25})`, offset: 0.1 },
				{ transform: `scale(${Math.random() * 0.75 + 0.25})`, offset: 0.6 },
				{},
			], { duration });
			scaleAnimation.updatePlaybackRate(this.playbackRate);

			Promise.allSettled([pathOffsetAnimation.finished, scaleAnimation.finished]).then(() => path.remove());
		}

		this.particles.append(fragment);
	}

	/**
	 * @param {import('./game.js').Game} game
	 */
	renderConnections(game) {
		if (game !== this.game) {
			return;
		}

		const fragment = document.createDocumentFragment();

		for (const connection of validConnectionsOf(game)) {
			const transform = (/**@type {import('./game.js').Piece}*/piece) => [
				(piece.column + 0.5) * this.cellWidth,
				(game.settings.rowCount - piece.row - 0.5) * this.cellHeight,
			];
			const point = transform(game.pieces[connection[0]]).join(',');
			const point2 = transform(game.pieces[connection[connection.length - 1]]).join(',');
			const d = `path('${CSS.escape(`M ${point} L ${point2}`)}')`;

			const stroke = createElement('path');
			stroke.classList.add('connection-stroke');
			stroke.style.color = `var(--connect-n-player-${game.pieces[connection[0]].player})`;
			stroke.style.d = d;

			const outline = createElement('path');
			outline.classList.add('connection-outline');
			outline.style.d = d;

			const group = createElement('g');
			group.append(outline, stroke);
			fragment.append(group);

			if (this.playable) {
				// Animation is applied to the group instead of each element individually because these custom properties are inheritable.
				const animation = group.animate([
					{ '--connect-n-connection-stroke-width': 0, '--connect-n-connection-outline-width': 0 },
					{},
				], {
					duration: 60 * fps,
					easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
				});
				animation.updatePlaybackRate(this.playbackRate);
			}
		}

		this.connections.replaceChildren(fragment);
		this.dispatchEvent(new CustomEvent('game-over', { detail: game }));
	}

	/**
	 * @param {import('./game.js').Game} game
	 */
	startMove(game) {
		if (game.over || !this.playable) {
			this.activePiece.remove();
		}
		else {
			if (!isValidColumn(game, this.activeColumn)) {
				this.updateActiveColumn(columnMidpointOf(game));
			}
			this.activePiece.style.fill = `var(--connect-n-player-${game.currentPlayer})`;
			this.piecesTopLayer.append(this.activePiece);
			const animation = this.activePiece.animate([
				{ transform: 'scale(0)' },
				{},
			], {
				composite: 'add',
				duration: 24 * fps,
				easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
			});
			animation.updatePlaybackRate(this.playbackRate);

			if (this.aiPlayers.has(game.currentPlayer)) {
				animation.finished.then(() => this.useAi(game));
			}
		}
	}

	endMove() {
		const column = Math.round(Number(this.activePiece.dataset.column));
		if (this.game.playableColumns.includes(column)) {
			this.activePiece.remove();
			const oldGame = this.game;
			const newGame = playColumn(oldGame, column);
			this.dispatchEvent(new CustomEvent('game-change', { detail: { newGame, oldGame } }));
			this.game = newGame;
		}
		else {
			const animation = this.activePiece.animate([
				{},
				{ transform: 'translateX(-25%)' },
				{},
				{ transform: 'translateX(25%)' },
				{},
			], {
				composite: 'add',
				duration: 7.5 * fps,
				iterations: 2,
			});
			animation.updatePlaybackRate(this.playbackRate);
			this.dispatchEvent(new CustomEvent('column-overflow', { detail: column }));
		}
	}

	/**
	 * @param {number} column
	 */
	updateActiveColumn(column) {
		column = clampColumn(this.game, column);
		this.activeColumn = column;
		this.activePiece.style.setProperty('--connect-n-column', this.activePiece.dataset.column = String(column));
	}

	/**
	 * @param {PointerEvent} event
	 */
	updateActivePoint(event) {
		this.activePoint.x = event.x;
		const x = this.activePoint.matrixTransform(this.svgMatrix).x - this.cellWidth / 2;
		this.updateActiveColumn(x / this.cellWidth);
	}

	/**
	 * Used to determine if pointer and keyboard events are available to human players.
	 * @returns {boolean}
	 */
	canInteract() {
		return this.activePiece.isConnected && !this.aiPlayers.has(this.game.currentPlayer);
	}

	/**
	 * @param {PointerEvent} event
	 */
	onPointerDown = event => {
		if (this.canInteract() && event.button === 0) {
			this.pointerId = event.pointerId;
			this.updateSvgMatrix();
			this.updateActivePoint(event);
			this.svg.addEventListener('pointermove', this.onPointerMove);
		}
	};

	/**
	 * @param {PointerEvent} event
	 */
	onPointerMove = event => {
		if (this.pointerId !== undefined) {
			const oldColumn = Math.round(this.activeColumn);
			this.updateActivePoint(event);
			const newColumn = Math.round(this.activeColumn);
			if (oldColumn !== newColumn) {
				this.dispatchEvent(new CustomEvent('column-change', { detail: { newColumn, oldColumn } }));
			}
		}
		else {
			this.svg.removeEventListener('pointermove', this.onPointerMove);
		}
	};

	unsetPointerId = () => this.pointerId = undefined;

	/**
	 * @param {PointerEvent} event
	 */
	onPointerUp = event => {
		if (this.canInteract() && event.button === 0 && event.pointerId === this.pointerId) {
			this.updateActiveColumn(Math.round(Number(this.activePiece.dataset.column)));
			this.endMove();
		}
		this.unsetPointerId();
		this.svg.removeEventListener('pointermove', this.onPointerMove);
	};

	/**
	 * @param {KeyboardEvent} event
	 */
	onKeyDown = event => {
		if (!this.canInteract() || event.ctrlKey || event.altKey || event.shiftKey) {
			return;
		}
		const { key } = event;
		if (key === 'a' || key === 'A' || key === 'ArrowLeft') { // Left
			this.unsetPointerId();
			this.updateActiveColumn(Math.round(this.activeColumn - 0.6));
		}
		else if (key === 'd' || key === 'D' || key === 'ArrowRight') { // Right
			this.unsetPointerId();
			this.updateActiveColumn(Math.round(this.activeColumn + 0.5));
		}
		else if (key === 's' || key === 'S' || key === 'ArrowDown') { // Down
			this.unsetPointerId();
			this.updateActiveColumn(Math.round(this.activeColumn));
			this.endMove();
		}
		else if (key === '1' || key === 'Delete') { // First Column
			this.unsetPointerId();
			this.updateActiveColumn(firstColumn);
		}
		else if (key === '2' || key === 'End') { // Middle Column
			this.unsetPointerId();
			this.updateActiveColumn(columnMidpointOf(this.game));
		}
		else if (key === '3' || key === 'PageDown') { // Last Column
			this.unsetPointerId();
			this.updateActiveColumn(lastColumnOf(this.game));
		}
	};

	/**
	 * @param {number} player
	 */
	async addAi(player) {
		this.aiPlayers.add(player);

		try { await this.createMoveSuggester(); }
		catch { return; }

		if (this.playable && !this.game.over && this.game.currentPlayer === player && this.activePiece.isConnected && !this.suggestMoveAbortController) {
			this.useAi(this.game);
		}
	}

	/**
	 * @param {number} [player]
	 */
	removeAi(player) {
		if (player === undefined) {
			this.aiPlayers.clear();
		}
		else {
			this.aiPlayers.delete(player);
		}
		if (this.aiPlayers.size === 0) {
			this.createMoveSuggesterAbortController?.abort();
			this.suggestMove = undefined;
		}
	}

	async createMoveSuggester() {
		if (!this.suggestMove) {
			this.createMoveSuggesterAbortController = new AbortController();

			try { this.suggestMove = await createMoveSuggester(this.createMoveSuggesterAbortController.signal); }
			catch { return; }
			finally { this.createMoveSuggesterAbortController = undefined; }
		}
	}

	/**
	 * @param {import('./game.js').Game} game
	 */
	async useAi(game) {
		await this.createMoveSuggester();
		if (game !== this.game) {
			return;
		}

		let column;

		if (this.suggestMove) {
			this.suggestMoveAbortController?.abort();
			this.suggestMoveAbortController = new AbortController();

			try { column = (await this.suggestMove(game, this.aiDepth, this.suggestMoveAbortController.signal)).column; }
			catch { return; }
			finally { this.suggestMoveAbortController = undefined; }

			if (game !== this.game) {
				return;
			}
		}
		else {
			column = game.playableColumns[Math.trunc(Math.random() * game.playableColumns.length)];
		}

		this.aiAnimation = this.activePiece.animate([
			{},
			{ '--connect-n-column': column },
		], {
			duration: Math.max(1, Math.abs(this.activeColumn - column)) * 4 * fps,
			easing: 'ease',
		});
		this.aiAnimation.updatePlaybackRate(this.playbackRate);

		try { await this.aiAnimation.finished; }
		catch { return; }
		finally { this.aiAnimation = undefined; }

		this.updateActiveColumn(column);
		this.endMove();
	}
}

// Firefox requires viewBox to be set on <svg> or else baseVal will be null.
// Firefox requires width='0' and height='0' to be set on <pattern> or else unitType will be % and not px by default.
export const template = document.createElement('template');
template.innerHTML = /*xml*/`
<svg part='svg' id='svg' tabindex='0' viewBox='0 0 0 0'>
	<defs id='defs'>
		<pattern id='hole-fill-pattern' width='0' height='0'>
			<path id='hole-fill' />
		</pattern>
		<pattern id='hole-stroke-pattern' width='0' height='0'>
			<path id='hole-stroke' />
		</pattern>
		<mask id='board-mask' maskUnits='userSpaceOnUse'>
			<rect id='board-mask-bounding-box' />
			<rect id='board-mask-holes' fill='url(#hole-fill-pattern)' />
		</mask>
		<rect id='cell' />
		<rect id='viewport' />
	</defs>
	<g id='pieces-bottom-layer'></g>
	<g id='pieces'></g>
	<g id='pieces-top-layer'>
		<path id='active-piece' class='piece' />
	</g>
	<rect id='board' mask='url(#board-mask)' />
	<rect id='holes' fill='url(#hole-stroke-pattern)' />
	<g id='connections' mask='url(#board-mask)'></g>
	<g id='particles'></g>
</svg>
`.replace(/[\t\n]/g, '');

export const styles = new CSSStyleSheet();
styles.replaceSync(/*css*/`
:host {
	display: block;
	overflow: hidden;
	user-select: none;
	contain: layout paint;
}
#svg {
	width: 100%;
	height: 100%;
	outline: none;
}
#hole-fill, #hole-stroke {
	d: var(--connect-n-hole-path);
	transform: translateX(calc(var(--connect-n-cell-width) / 2)) translateY(calc(var(--connect-n-cell-height) / 2));
}
#hole-stroke {
	fill: none;
	stroke: var(--connect-n-hole-stroke);
	stroke-width: var(--connect-n-hole-stroke-width);
}
#cell {
	width: var(--connect-n-cell-width);
	height: var(--connect-n-cell-height);
}
#viewport {
	x: calc(-1 * var(--connect-n-board-padding-left) - var(--connect-n-board-stroke-width) / 2 - var(--connect-n-board-margin-left));
	y: calc(-1 * var(--connect-n-board-padding-top) - var(--connect-n-board-stroke-width) / 2 - var(--connect-n-cell-height) - var(--connect-n-board-margin-top));
	width: calc(var(--connect-n-column-count) * var(--connect-n-cell-width) + var(--connect-n-board-padding-left) + var(--connect-n-board-padding-right) + var(--connect-n-board-stroke-width) + var(--connect-n-board-margin-left) + var(--connect-n-board-margin-right));
	height: calc((var(--connect-n-row-count) + 1) * var(--connect-n-cell-height) + var(--connect-n-board-padding-top) + var(--connect-n-board-padding-bottom) + var(--connect-n-board-stroke-width) + var(--connect-n-board-margin-top) + var(--connect-n-board-margin-bottom));
}
#board {
	x: calc(-1 * var(--connect-n-board-padding-left));
	y: calc(-1 * var(--connect-n-board-padding-top));
	width: calc(var(--connect-n-column-count) * var(--connect-n-cell-width) + var(--connect-n-board-padding-left) + var(--connect-n-board-padding-right));
	height: calc(var(--connect-n-row-count) * var(--connect-n-cell-height) + var(--connect-n-board-padding-top) + var(--connect-n-board-padding-bottom));
	rx: var(--connect-n-board-radius);
	fill: var(--connect-n-board-fill);
	stroke: var(--connect-n-board-stroke);
	stroke-width: var(--connect-n-board-stroke-width);
}
#board-mask-bounding-box {
	x: calc(var(--connect-n-board-padding-left) * -1 - var(--connect-n-board-stroke-width) / 2);
	y: calc(var(--connect-n-board-padding-top) * -1 - var(--connect-n-board-stroke-width) / 2);
	width: calc(var(--connect-n-column-count) * var(--connect-n-cell-width) + var(--connect-n-board-padding-left) + var(--connect-n-board-padding-right) + var(--connect-n-board-stroke-width));
	height: calc(var(--connect-n-row-count) * var(--connect-n-cell-height) + var(--connect-n-board-padding-top) + var(--connect-n-board-padding-bottom) + var(--connect-n-board-stroke-width));
	fill: white;
}
#board-mask-holes, #holes {
	width: calc(var(--connect-n-column-count) * var(--connect-n-cell-width));
	height: calc(var(--connect-n-row-count) * var(--connect-n-cell-height));
}
.piece {
	d: var(--connect-n-piece-path);
	stroke: var(--connect-n-piece-stroke);
	stroke-width: var(--connect-n-piece-stroke-width);
	transform: translateX(calc((var(--connect-n-column) + 0.5) * var(--connect-n-cell-width))) translateY(calc((var(--connect-n-row-count) - var(--connect-n-row) - 0.5) * var(--connect-n-cell-height)));
	transform-box: fill-box;
	transform-origin: bottom;
}
:host([playable]) .piece {
	/* Create a new stacking context to hardware accelerate animations with --connect-n-row. */
	will-change: transform;
}
#active-piece {
	--connect-n-row: var(--connect-n-row-count);
}
#connections {
	/* Create a new stacking context to hardware accelerate mask. */
	will-change: transform;
}
.connection {
	stroke-linecap: round;
	stroke-linejoin: round;
}
.connection-stroke {
	stroke: var(--connect-n-connection-stroke);
	stroke-width: var(--connect-n-connection-stroke-width);
}
.connection-outline {
	stroke: var(--connect-n-connection-outline);
	stroke-width: calc(var(--connect-n-connection-stroke-width) + 2 * var(--connect-n-connection-outline-width));
}
.particle {
	d: var(--connect-n-particle-path);
	fill: var(--connect-n-particle-fill);
	stroke: var(--connect-n-particle-stroke);
	stroke-width: var(--connect-n-particle-stroke-width);
	offset-rotate: 0deg;
	mix-blend-mode: plus-lighter;
}
`);

const stroke = '#282828';
const path = "path('M 24,0 A 24,24 0 0 1 0,24 24,24 0 0 1 -24,0 24,24 0 0 1 0,-24 24,24 0 0 1 24,0 Z')";

export const rootStyles = new CSSStyleSheet();
rootStyles.replaceSync(/*css*/`
:root {
	--connect-n-column-count: ${settings.columnCount};
	--connect-n-row-count: ${settings.rowCount};
	--connect-n-board-padding-top: 12px;
	--connect-n-board-padding-bottom: 56px;
	--connect-n-board-padding-left: 12px;
	--connect-n-board-padding-right: 12px;
	--connect-n-board-margin-top: 0px;
	--connect-n-board-margin-bottom: -44px;
	--connect-n-board-margin-left: 0px;
	--connect-n-board-margin-right: 0px;
	--connect-n-board-radius: 40px;
	--connect-n-board-fill: #383838;
	--connect-n-board-stroke: ${stroke};
	--connect-n-board-stroke-width: 4px;
	--connect-n-cell-width: 60px;
	--connect-n-cell-height: 60px;
	--connect-n-piece-path: ${path};
	--connect-n-piece-stroke: ${stroke};
	--connect-n-piece-stroke-width: 4px;
	--connect-n-hole-path: ${path};
	--connect-n-hole-stroke: ${stroke};
	--connect-n-hole-stroke-width: 4px;
	--connect-n-connection-stroke: currentColor;
	--connect-n-connection-outline: ${stroke};
	--connect-n-particle-path: path('M 3,0 A 3,3 0 0 1 0,3 3,3 0 0 1 -3,0 3,3 0 0 1 0,-3 3,3 0 0 1 3,0 Z');
	--connect-n-particle-fill: currentColor;
	--connect-n-particle-stroke: ${stroke};
	--connect-n-particle-stroke-width: 1px;
}
@property --connect-n-column {
	syntax: '<number>';
	initial-value: 0;
	inherits: true;
}
@property --connect-n-row {
	syntax: '<number>';
	initial-value: 0;
	inherits: true;
}
@property --connect-n-connection-stroke-width {
	syntax: '<length>';
	initial-value: 12px;
	inherits: true;
}
@property --connect-n-connection-outline-width {
	syntax: '<length>';
	initial-value: 4px;
	inherits: true;
}
`);

document.adoptedStyleSheets.push(rootStyles);
customElements.define('connect-n-board', ConnectNBoard);
