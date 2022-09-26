import { ConnectNBoard } from './src/connect-n-board.js';
import { ConnectNGame } from './src/connect-n-game.js';

customElements.define('connect-n-board', ConnectNBoard);
customElements.define('connect-n-game', ConnectNGame);
document.body.append(new ConnectNGame());
