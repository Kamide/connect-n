interface HTMLElementTagNameMap {
	'connect-n-app': import('./src/app.js').ConnectNApp;
	'connect-n-board': import('./src/board.js').ConnectNBoard;
}

interface Array<T> {
	with(index: number, value: T): T[];
}

interface ReadonlyArray<T> {
	with(index: number, value: T): T[];
}

interface CSSStyleDeclaration {
	d: string;
}
