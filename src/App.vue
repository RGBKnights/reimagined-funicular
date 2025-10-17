<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

type GameStatus = 'playing' | 'won' | 'lost'

type Cell = {
  x: number
  y: number
  hasMine: boolean
  adjacentMines: number
  isRevealed: boolean
  isFlagged: boolean
  wasTriggered?: boolean
  isMisflagged?: boolean
}

type Layer = {
  id: number
  color: string
  cells: Cell[][]
  flatCells: Cell[]
  mines: number
  status: GameStatus
  revealedCount: number
  flagsUsed: number
}

const palette = [
  '#6C5CE7',
  '#00B894',
  '#FD8A5E',
  '#0984E3',
  '#E17055',
  '#00CEC9',
  '#FAB1A0',
  '#FFE66D',
  '#A29BFE',
  '#55EFC4'
]

const pending = reactive({
  width: 10,
  height: 10,
  depth: 3,
  mineDensity: 0.16
})

const width = ref(pending.width)
const height = ref(pending.height)
const depth = ref(pending.depth)
const mineDensity = ref(pending.mineDensity)

const layers = ref<Layer[]>([])

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${width.value}, var(--cell-size))`,
  gridTemplateRows: `repeat(${height.value}, var(--cell-size))`
}))

const totalMines = computed(() =>
  layers.value.reduce((total, layer) => total + layer.mines, 0)
)

const totalFlags = computed(() =>
  layers.value.reduce((total, layer) => total + layer.flagsUsed, 0)
)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function applySettings() {
  width.value = clamp(pending.width, 4, 32)
  height.value = clamp(pending.height, 4, 24)
  depth.value = clamp(pending.depth, 1, 10)
  mineDensity.value = Math.min(Math.max(pending.mineDensity, 0.05), 0.4)
  newGame()
  pending.width = width.value
  pending.height = height.value
  pending.depth = depth.value
  pending.mineDensity = Number(mineDensity.value.toFixed(2))
}

function newGame() {
  const layerCount = depth.value
  layers.value = Array.from({ length: layerCount }, (_, index) =>
    createLayer(index)
  )
}

function createLayer(index: number): Layer {
  const totalCells = width.value * height.value
  const mineCount = Math.max(
    1,
    Math.min(totalCells - 1, Math.round(totalCells * mineDensity.value))
  )
  const cells = createBoard(width.value, height.value, mineCount)
  return {
    id: index,
    color: palette[index % palette.length],
    cells,
    flatCells: cells.flat(),
    mines: mineCount,
    status: 'playing',
    revealedCount: 0,
    flagsUsed: 0
  }
}

function createBoard(w: number, h: number, mines: number): Cell[][] {
  const cells: Cell[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      hasMine: false,
      adjacentMines: 0,
      isRevealed: false,
      isFlagged: false
    }))
  )

  const positions = Array.from({ length: w * h }, (_, idx) => idx)
  shuffle(positions)
  for (let i = 0; i < mines; i++) {
    const pos = positions[i]
    const x = pos % w
    const y = Math.floor(pos / w)
    cells[y][x].hasMine = true
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!cells[y][x].hasMine) {
        cells[y][x].adjacentMines = countAdjacentMines(cells, x, y)
      }
    }
  }

  return cells
}

function shuffle<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
}

function countAdjacentMines(cells: Cell[][], x: number, y: number) {
  let count = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (cells[ny]?.[nx]?.hasMine) count++
    }
  }
  return count
}

function getNeighbors(cells: Cell[][], cell: Cell) {
  const neighbors: Cell[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = cell.x + dx
      const ny = cell.y + dy
      const neighbor = cells[ny]?.[nx]
      if (neighbor) neighbors.push(neighbor)
    }
  }
  return neighbors
}

function revealCell(layerIndex: number, cell: Cell) {
  const layer = layers.value[layerIndex]
  if (!layer || layer.status !== 'playing') return
  if (cell.isFlagged || cell.isRevealed) return

  if (cell.hasMine) {
    cell.wasTriggered = true
    layer.status = 'lost'
    revealAllMines(layer)
    return
  }

  floodReveal(layer, cell)
  checkWin(layer)
}

function floodReveal(layer: Layer, start: Cell) {
  const queue: Cell[] = []
  const enqueue = (target: Cell) => {
    if (target.isRevealed || target.hasMine) return
    target.isRevealed = true
    layer.revealedCount++
    if (target.adjacentMines === 0) {
      queue.push(target)
    }
  }

  enqueue(start)

  while (queue.length > 0) {
    const current = queue.shift() as Cell
    for (const neighbor of getNeighbors(layer.cells, current)) {
      if (neighbor.isFlagged || neighbor.hasMine) continue
      if (!neighbor.isRevealed) {
        neighbor.isRevealed = true
        layer.revealedCount++
        if (neighbor.adjacentMines === 0) {
          queue.push(neighbor)
        }
      }
    }
  }
}

function revealAllMines(layer: Layer) {
  for (const cell of layer.flatCells) {
    if (cell.hasMine) {
      cell.isRevealed = true
    } else if (cell.isFlagged) {
      cell.isMisflagged = true
    }
  }
}

function toggleFlag(layerIndex: number, cell: Cell) {
  const layer = layers.value[layerIndex]
  if (!layer || layer.status !== 'playing') return
  if (cell.isRevealed) return

  cell.isFlagged = !cell.isFlagged
  layer.flagsUsed += cell.isFlagged ? 1 : -1
}

function checkWin(layer: Layer) {
  const safeCells = width.value * height.value - layer.mines
  if (layer.revealedCount >= safeCells) {
    layer.status = 'won'
    for (const cell of layer.flatCells) {
      if (cell.hasMine && !cell.isFlagged) {
        cell.isFlagged = true
        layer.flagsUsed++
      }
    }
  }
}

function layerStyle(index: number, color: string) {
  const glow = hexToRgba(color, 0.35)
  const surface = hexToRgba(color, 0.12)
  return {
    '--layer-color': color,
    zIndex: layers.value.length - index,
    borderColor: hexToRgba(color, 0.55),
    boxShadow: `0 18px 40px ${glow}, 0 12px 18px ${hexToRgba(color, 0.2)}`,
    background: `linear-gradient(165deg, ${surface} 0%, rgba(255,255,255,0.95) 55%, #ffffff 100%)`
  }
}

function cellClasses(cell: Cell) {
  return [
    'cell',
    cell.isRevealed ? 'revealed' : 'hidden',
    cell.hasMine ? 'mine' : '',
    cell.wasTriggered ? 'triggered' : '',
    cell.isFlagged && !cell.isRevealed ? 'flagged' : '',
    cell.isMisflagged ? 'misflagged' : '',
    !cell.hasMine && cell.isRevealed && cell.adjacentMines > 0
      ? `number-${cell.adjacentMines}`
      : ''
  ]
}

function hexToRgba(hex: string, alpha: number) {
  const sanitized = hex.replace('#', '')
  const value = sanitized.length === 3
    ? sanitized
        .split('')
        .map((ch) => ch + ch)
        .join('')
    : sanitized
  const bigint = parseInt(value, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

onMounted(() => {
  newGame()
})

defineExpose({
  applySettings,
  newGame,
  revealCell,
  toggleFlag,
  layers,
  pending,
  width,
  height,
  depth,
  mineDensity
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Layered Minesweeper</h1>
      <p>
        Stack multiple Minesweeper boards and tackle them layer by layer. Use the
        controls below to tweak the board dimensions (X × Y) and the number of
        layers (Z), then start a fresh challenge.
      </p>
    </header>

    <section class="controls" aria-label="Debug controls">
      <form class="control-form" @submit.prevent="applySettings">
        <div class="control-group">
          <label for="width">Width (X)</label>
          <input id="width" v-model.number="pending.width" type="number" min="4" max="32" />
        </div>
        <div class="control-group">
          <label for="height">Height (Y)</label>
          <input id="height" v-model.number="pending.height" type="number" min="4" max="24" />
        </div>
        <div class="control-group">
          <label for="depth">Layers (Z)</label>
          <input id="depth" v-model.number="pending.depth" type="number" min="1" max="10" />
        </div>
        <div class="control-group">
          <label for="density">Mine density</label>
          <input
            id="density"
            v-model.number="pending.mineDensity"
            type="number"
            step="0.01"
            min="0.05"
            max="0.4"
          />
        </div>
        <button type="submit" class="primary">Apply &amp; Restart</button>
      </form>
      <button class="secondary" type="button" @click="newGame">New Game</button>
      <div class="summary">
        <span><strong>Total mines:</strong> {{ totalMines }}</span>
        <span><strong>Flags placed:</strong> {{ totalFlags }}</span>
      </div>
    </section>

    <section class="board-stack" role="region" aria-live="polite">
      <div
        v-for="(layer, layerIndex) in layers"
        :key="layer.id"
        class="board-layer"
        :class="layer.status"
        :style="layerStyle(layerIndex, layer.color)"
      >
        <header class="layer-header" :style="{ backgroundColor: layer.color }">
          <div class="layer-title">Layer {{ layerIndex + 1 }}</div>
          <div class="layer-meta">
            <span>Status: <strong>{{ layer.status }}</strong></span>
            <span>Mines: {{ layer.mines }}</span>
            <span>Flags: {{ layer.flagsUsed }}</span>
          </div>
        </header>
        <div class="grid" :style="gridStyle">
          <button
            v-for="cell in layer.flatCells"
            :key="`${cell.x}-${cell.y}`"
            type="button"
            :class="cellClasses(cell)"
            @click="revealCell(layerIndex, cell)"
            @contextmenu.prevent="toggleFlag(layerIndex, cell)"
          >
            <span v-if="cell.isRevealed && cell.hasMine">💣</span>
            <span v-else-if="!cell.isRevealed && cell.isFlagged">🚩</span>
            <span
              v-else-if="cell.isRevealed && !cell.hasMine && cell.adjacentMines > 0"
            >
              {{ cell.adjacentMines }}
            </span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.app-shell {
  max-width: min(1100px, 100vw - 2rem);
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.app-header h1 {
  margin: 0 0 0.5rem;
  font-size: clamp(2rem, 4vw, 2.8rem);
}

.app-header p {
  margin: 0;
  max-width: 60ch;
  color: #52606d;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.control-form {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem;
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 120px;
}

.control-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.control-group input {
  padding: 0.45rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s ease;
}

.control-group input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

button.primary,
button.secondary {
  border: none;
  border-radius: 0.75rem;
  padding: 0.75rem 1.25rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

button.primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  box-shadow: 0 12px 25px rgba(99, 102, 241, 0.25);
}

button.secondary {
  background: white;
  color: #0f172a;
  box-shadow: 0 12px 25px rgba(15, 23, 42, 0.15);
}

button.primary:hover,
button.secondary:hover {
  transform: translateY(-1px);
}

button.primary:active,
button.secondary:active {
  transform: translateY(0);
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem 1rem;
  background: white;
  border-radius: 0.75rem;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.board-stack {
  position: relative;
  display: grid;
  place-items: center;
  padding: 3rem;
  min-height: 320px;
}

.board-layer {
  --cell-size: 32px;
  position: relative;
  grid-area: 1 / 1;
  border-radius: 1.25rem;
  overflow: hidden;
  border: 2px solid rgba(15, 23, 42, 0.08);
  background-color: #fff;
  transform-origin: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.board-layer:hover {
  transform: scale(1.01);
}

.board-layer::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
  mix-blend-mode: screen;
}

.board-layer.playing {
  filter: drop-shadow(0 24px 50px rgba(15, 23, 42, 0.18));
}

.board-layer.won {
  filter: drop-shadow(0 24px 40px rgba(34, 197, 94, 0.35));
}

.board-layer.lost {
  filter: drop-shadow(0 24px 40px rgba(239, 68, 68, 0.35));
}

.layer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  color: #f8fafc;
  background: linear-gradient(120deg, var(--layer-color), rgba(15, 23, 42, 0.75));
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.18);
}

.layer-title {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.layer-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.9rem;
}

.layer-meta span strong {
  font-weight: 700;
}

.grid {
  display: grid;
  gap: 4px;
  padding: 1.25rem 1.5rem 1.75rem;
  background: rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(3px);
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.cell {
  width: var(--cell-size);
  height: var(--cell-size);
  border-radius: 0.5rem;
  border: none;
  font-weight: 700;
  font-size: 1rem;
  display: grid;
  place-items: center;
  cursor: pointer;
  user-select: none;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(226, 232, 240, 0.4));
  color: #1e293b;
  box-shadow: inset 0 -2px 0 rgba(15, 23, 42, 0.1);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.cell.hidden:hover {
  transform: translateY(-1px);
  box-shadow: inset 0 -2px 0 rgba(15, 23, 42, 0.2);
}

.cell.revealed {
  cursor: default;
  background: linear-gradient(145deg, rgba(224, 242, 254, 0.95), rgba(191, 219, 254, 0.35));
  box-shadow: none;
}

.cell.flagged {
  background: rgba(255, 243, 178, 0.95);
}

.cell.mine.revealed {
  background: rgba(248, 113, 113, 0.95);
  color: #fff;
}

.cell.triggered {
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.6);
}

.cell.misflagged {
  background: rgba(248, 113, 113, 0.7);
  color: white;
}

.cell.number-1 {
  color: #2563eb;
}

.cell.number-2 {
  color: #059669;
}

.cell.number-3 {
  color: #dc2626;
}

.cell.number-4 {
  color: #1d4ed8;
}

.cell.number-5 {
  color: #b91c1c;
}

.cell.number-6 {
  color: #0e7490;
}

.cell.number-7 {
  color: #4338ca;
}

.cell.number-8 {
  color: #374151;
}

@media (max-width: 960px) {
  .board-stack {
    padding: 2rem 1rem 5rem;
    min-height: 280px;
  }

  .board-layer {
    --cell-size: 28px;
    transform-origin: center;
  }

  .layer-meta {
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
  }
}

@media (max-width: 640px) {
  .controls {
    flex-direction: column;
    align-items: stretch;
  }

  .summary {
    flex-direction: row;
    justify-content: space-between;
  }

  .board-stack {
    min-height: 240px;
  }
}
</style>
