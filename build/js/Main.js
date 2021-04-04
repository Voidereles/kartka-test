import { Game } from './Game.js';

const canvas = document.getElementsByClassName("three-canvas")[0];
const menu = document.getElementsByClassName('menu')[0];
const gameOverScoreDiv = document.getElementsByClassName('game-over-score')[0];
const startBtn = document.getElementsByClassName('start')[0];
const scoreDiv = document.getElementsByClassName('score')[0];

init();
function init() {

    const game = new Game( canvas );

    startBtn.addEventListener( 'click', () => {
        game.start();
        menu.style.display = 'none';
        scoreDiv.textContent = 'Score: 0';
    }, false );

    document.addEventListener( 'Game Over', () => {
        game.stop();
        menu.style.display = 'inline-block';
        gameOverScoreDiv.textContent = 'Your Score: ' + game.getScore();
    }, false );
}