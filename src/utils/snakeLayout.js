export const SNAKE_FRAME_W = 640
export const SNAKE_FRAME_H = 360
export const SNAKE_GAP_X = 60
export const SNAKE_GAP_Y = 40
export const SNAKE_ROWS_PER_COL = 6
export const SNAKE_ORIGIN_X = 80
// Bumped from 80 → 240 to leave room above the snake for the project Header.
export const SNAKE_ORIGIN_Y = 240

// Singleton "project header" sits in canvas coords directly above the snake.
// Editor + presentation read this; exports render the header inside each
// slide instead (see slideRender.js).
export const HEADER_LAYOUT = {
  x: 80,
  y: 80,
  width: 1280,
  height: 120,
}

export const computeSnakePosition = (index) => {
  const safeIndex = Math.max(0, index | 0)
  const col = Math.floor(safeIndex / SNAKE_ROWS_PER_COL)
  const rowInCol = safeIndex % SNAKE_ROWS_PER_COL
  // Even columns flow top->bottom. Odd columns flow bottom->top.
  const yIndex = (col % 2 === 0) ? rowInCol : (SNAKE_ROWS_PER_COL - 1 - rowInCol)
  return {
    x: SNAKE_ORIGIN_X + col * (SNAKE_FRAME_W + SNAKE_GAP_X),
    y: SNAKE_ORIGIN_Y + yIndex * (SNAKE_FRAME_H + SNAKE_GAP_Y),
    width: SNAKE_FRAME_W,
    height: SNAKE_FRAME_H,
  }
}

export const computeSnakeLayouts = (count) => {
  return Array.from({ length: count }, (_, i) => computeSnakePosition(i))
}