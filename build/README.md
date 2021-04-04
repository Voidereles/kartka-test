Kartka Wielkanocna

```js
const canvas = document.getElementById("three-canvas");

import { Game } from './Game';

// initiates the game and loads the models
// takes canvas element as an argument
const game = new Game( canvas ); 

let score = game.getScore(); // returns current score

game.start(); // resets and starts the game
game.stop(); // stops the game
```

Install dependencies:
```
npm install
```

To build:
```
npm run build
```

Tu run development server:
```
npm run start
```