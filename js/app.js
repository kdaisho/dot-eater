"use strict";
var CELL = {
    NONE: 0,
    WALL: 1,
    DOT: 2,
    MAX: 3
};
var cells = [
    [1, 1, 1, 1, 2, 1, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 2, 1, 2, 1, 2, 1],
    [1, 2, 1, 2, 1, 2, 1, 2, 1],
    [2, 2, 2, 2, 1, 2, 2, 2, 2],
    [1, 2, 1, 2, 2, 2, 1, 2, 1],
    [1, 2, 1, 1, 1, 1, 1, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 2, 1, 1, 1, 1]
];
var cellAA = [
    "<span class=\"none\"></span>",
    "<span class=\"wall\"></span>",
    "<span class=\"dot\"><span></span></span>"
];
var characterAA = [
    "@",
    "E"
];
function Cell() {
}
function draw() {
    var root = document.getElementById("root");
    var html = "";
    for (var i = 0; i < cells.length; i++) {
        for (var j = 0; j < cells[i].length; j++) {
            html += cellAA[cells[i][j]];
        }
        html += "<br>";
    }
    root.innerHTML = html;
}
draw();
