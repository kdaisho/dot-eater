const cell = {
	none: 0,
	wall: 1,
	dot: 2,
	max: 3,
	maxHeight: 8
};

const direction = {
	up: 0,
	left: 1,
	down: 2,
	right: 3
};

const directions = [
	new Vec2(0, -1),
	new Vec2(-1, 0),
	new Vec2(0, 1),
	new Vec2(1, 0)
];

const cells = [
	[1,1,1,1,0,1,1,1,1],
	[1,0,0,0,0,0,0,0,1],
	[1,0,1,0,1,0,1,0,1],
	[1,0,1,0,1,0,1,0,1],
	[0,0,0,0,1,0,0,0,0],
	[1,0,1,0,0,0,1,0,1],
	[1,0,1,1,1,1,1,0,1],
	[1,0,0,0,0,0,0,0,1],
	[1,1,1,1,0,1,1,1,1]
];

const character = {
	player: 0,
	enemy1: 1,
	enemy2: 2,
	// max: 3
};

const cellAA = [
	"<span class=\"none\"></span>",
	"<span class=\"wall\"></span>",
	"<span class=\"dot\"><span></span></span>"
];

function Vec2(x, y) {
	this.x = x;
	this.y = y;
}

function Character(aa) {
	this.aa = aa;
}

const characters = [
	new Character("<span class=\"me\"><span>@</span></span>"),
	new Character("<span class=\"me\"><span>E</span></span>"),
	new Character("<span class=\"me\"><span>D</span></span>")
];

const player = characters[character.player];
const enemies = [];
let intervalId = null;

function init() {
	player.pos = new Vec2(4, 1);
	initDots();
	enemies[0] = characters[character.enemy1];
	enemies[1] = characters[character.enemy2];

	enemies[0].pos = new Vec2(1, 4);
	enemies[1].pos = new Vec2(7, 4);
	for (let i = 0; i < enemies.length; i++) {
		enemies[i].lastPos = new Vec2(enemies[i].pos.x, enemies[i].pos.y);
	}

	intervalId = setInterval(interval, 1000);
	addEventListener("keydown", onKeyDown);
	draw();
}

function initDots() {
	for (let i = 0; i < cells.length; i++) {
		for (let j = 0; j < cells[i].length; j++) {
			if (cells[i][j] === cell.none) {
				cells[i][j] = cell.dot;
			}
		}
	}
}

function onKeyDown(event) {
	let targetPos = new Vec2(player.pos.x, player.pos.y);
	switch (event.key) {
		case "w":
			// if (targetPos.y > 0) {
				targetPos.y--;
			// }
			break;
		case "s":
			// if (targetPos.y < cell.maxHeight) {
				targetPos.y++
			// }
			break;
		case "a":
			targetPos.x--;
			break;
		case "d":
			targetPos.x++;
			break;
	}

	loopPos(targetPos);

	if (cells[targetPos.y][targetPos.x] >= cell.max) {
		return;
	}

	switch (cells[targetPos.y][targetPos.x]) {
		case cell.none:
			player.pos = new Vec2(targetPos.x, targetPos.y);
		case cell.wall:
			break;
		case cell.dot:
			cells[targetPos.y][targetPos.x] = cell.none;
			player.pos = new Vec2(targetPos.x, targetPos.y);
			break;
		default:
			console.log("No element found");
	}
	draw();
}

function interval() {
	for (let i = 0; i < enemies.length; i++) {
		enemyMove(enemies[i]);
	}
	draw();
}

function enemyMove(enemy) {
	const pos = [];
	let v = null;
	console.log('yo');
	for (let i = 0; i < Object.keys(direction).length; i++) {
		v = new Vec2(enemy.pos.x + directions[i].x, enemy.pos.y + directions[i].y);
		console.log(v);
		if (cells[v.y][v.x] !== cell.wall) {
			pos.push(v);
		}
	}
	const r = Math.floor(Math.random() * pos.length);
	enemy.pos = pos[r];
}

function loopPos(v) {
	console.log("V", v);
	if (v.x < 0) {
		v.x = cells[v.y].length - 1;
	}
	if (v.x >= cells[v.y].length) {
		v.x = 0;
	}
}

function draw() {
	const root = document.getElementById("root");
	let html = "";
	let str = "";
	for (let i = 0; i < cells.length; i++) {
		for (let j = 0; j < cells[i].length; j++) {
			str = cellAA[cells[i][j]];
			for (k = 0; k < characters.length; k++) {
				if ((i === characters[k].pos.y) && (j === characters[k].pos.x)) {
					str = characters[k].aa;
				}
			}
			html += str;
		}
		html += "<br>";
	}

	root.innerHTML = html;
}

init();