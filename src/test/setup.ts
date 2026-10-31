// Runs before every test file. Main starts on the opening on every load;
// the tests of the rest of the game start on the title, as the game did
// before it had one. main.opening.test.ts clears this to test the opening.
;(globalThis as { skipOpening?: boolean }).skipOpening = true
