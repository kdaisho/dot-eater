
const CELL = {
	NONE: 0,
	WALL: 1,
	DOT: 2,
	MAX: 3
};

const cells = [
	[1,1,1,1,2,1,1,1,1],
	[1,2,2,2,2,2,2,2,1],
	[1,2,1,2,1,2,1,2,1],
	[1,2,1,2,1,2,1,2,1],
	[2,2,2,2,1,2,2,2,2],
	[1,2,1,2,2,2,1,2,1],
	[1,2,1,1,1,1,1,2,1],
	[1,2,2,2,2,2,2,2,1],
	[1,1,1,1,2,1,1,1,1]
];

const cellAA = [
	"<span class=\"none\"></span>",
	"<span class=\"wall\"></span>",
	"<span class=\"dot\"><span></span></span>"
];

const characterAA = [
	"@",
	"E"
];

function Cell() {

}

function draw() {
	const root = document.getElementById("root");
	let html: string = "";

	for (let i = 0; i < cells.length; i++) {
		for (let j = 0; j < cells[i].length; j++) {
			html += cellAA[cells[i][j]];
		}
		html += "<br>";
	}

	root.innerHTML = html;
}

draw();