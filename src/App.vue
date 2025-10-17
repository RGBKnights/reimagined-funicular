<script setup lang="ts">
import { computed, ref, watch } from 'vue'

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
  '#c9b896',
  '#a89984',
  '#b89968',
  '#9a8871',
  '#8b7e66',
  '#d4c5a9',
  '#a39080',
  '#c7b89d',
  '#9f8f7c',
  '#baa88e'
]

type Preset = {
  label: string
  width: number
  height: number
  depth: number
}

const presets: Record<string, Preset> = {
  micro: { label: 'Micro · 5×5×2', width: 5, height: 5, depth: 2 },
  small: { label: 'Small · 9×9×3', width: 9, height: 9, depth: 3 },
  medium: { label: 'Medium · 15×15×5', width: 15, height: 15, depth: 5 },
  large: { label: 'Large · 24×24×7', width: 24, height: 24, depth: 7 }
}

type PresetKey = keyof typeof presets

const presetOptions = Object.entries(presets).map(([key, value]) => ({
  key: key as PresetKey,
  ...value
}))

const selectedPreset = ref<PresetKey>('micro')
const hasConfigured = ref(false)
const hasWon = ref(false)

const width = ref(presets[selectedPreset.value].width)
const height = ref(presets[selectedPreset.value].height)
const depth = ref(presets[selectedPreset.value].depth)
const mineDensity = ref(0.16)

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
const overallStatus = computed(() => {
  if (hasWon.value) return 'won'
  if (layers.value.some((layer) => layer.status === 'lost')) return 'lost'
  return hasConfigured.value ? 'playing' : 'idle'
})
function startGame() {
  hasWon.value = false
  hasConfigured.value = true
  newGame()
}

function resetGame() {
  hasConfigured.value = false
  hasWon.value = false
  layers.value = []
}

function newGame() {
  const layerCount = depth.value
  layers.value = Array.from({ length: layerCount }, (_, index) =>
    createLayer(index)
  )
}

function applyPreset(key: PresetKey) {
  const preset = presets[key]
  if (!preset) return
  width.value = preset.width
  height.value = preset.height
  depth.value = preset.depth
}

watch(selectedPreset, (key) => {
  applyPreset(key)
  if (hasConfigured.value) {
    newGame()
  }
})

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
    endGame(layerIndex, cell)
    return
  }

  floodReveal(layer, cell)
  checkWin(layerIndex)
}

function endGame(triggeredLayerIndex: number, triggeredCell: Cell) {
  triggeredCell.wasTriggered = true
  triggeredCell.isRevealed = true

  layers.value.forEach((layer, index) => {
    if (layer.status === 'lost' && index !== triggeredLayerIndex) return
    layer.status = 'lost'
    revealAllMines(layer)
  })
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
  checkLayerCleared(layerIndex)
}

function checkLayerCleared(layerIndex: number) {
  const layer = layers.value[layerIndex]
  if (!layer) return
  if (layer.flagsUsed !== layer.mines) return
  const solved = layer.flatCells.every((cell) =>
    cell.hasMine ? cell.isFlagged : !cell.isFlagged
  )
  if (!solved) return
  layers.value.splice(layerIndex, 1)
  if (layers.value.length === 0) {
    hasConfigured.value = false
    hasWon.value = true
  }
}

function checkWin(layerIndex: number) {
  const layer = layers.value[layerIndex]
  if (!layer) return
  const safeCells = layer.flatCells.length - layer.mines
  if (layer.revealedCount >= safeCells) {
    layer.status = 'won'
    for (const cell of layer.flatCells) {
      if (cell.hasMine && !cell.isFlagged) {
        cell.isFlagged = true
        layer.flagsUsed++
      }
    }
    checkLayerCleared(layerIndex)
  }
}

function layerStyle(index: number, color: string) {
  const glow = hexToRgba(color, 0.25)
  const surface = mixWithWhite(color, 0.2)
  const highlight = mixWithWhite(color, 0.4)
  return {
    '--layer-color': color,
    '--cell-base': surface,
    '--cell-highlight': highlight,
    '--cell-border': hexToRgba(color, 0.35),
    '--cell-shadow': hexToRgba(color, 0.2),
    zIndex: layers.value.length - index,
    borderColor: hexToRgba(color, 0.35),
    boxShadow: `0 18px 40px ${glow}, 0 12px 18px ${hexToRgba(color, 0.18)}`,
    background: 'transparent'
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
    cell.isRevealed && !cell.hasMine && cell.adjacentMines === 0 ? 'emptied' : '',
    !cell.hasMine && cell.isRevealed && cell.adjacentMines > 0
      ? `number-${cell.adjacentMines}`
      : ''
  ]
}

function parseHexColor(hex: string) {
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
  return { r, g, b }
}

function mixWithWhite(hex: string, amount: number) {
  const { r, g, b } = parseHexColor(hex)
  const clampAmount = Math.min(Math.max(amount, 0), 1)
  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * clampAmount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = parseHexColor(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

defineExpose({
  startGame,
  resetGame,
  newGame,
  revealCell,
  toggleFlag,
  layers,
  hasConfigured,
  hasWon,
  selectedPreset,
  presetOptions,
  width,
  height,
  depth,
  mineDensity,
  overallStatus
})
</script>

<template>
  <div class="app-shell">
    <section
      v-if="!hasConfigured && !hasWon"
      class="setup-section"
      aria-label="Game overview and setup"
    >
      <header class="app-header">
        <div class="brand">
          <span class="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#6366f1" />
                  <stop offset="1" stop-color="#f472b6" />
                </linearGradient>
              </defs>
              <rect x="6" y="10" width="26" height="26" rx="6" fill="rgba(45, 212, 191, 0.65)" />
              <rect x="12" y="6" width="26" height="26" rx="8" fill="rgba(96, 165, 250, 0.7)" />
              <rect x="18" y="12" width="24" height="24" rx="7" fill="url(#logo-gradient)" />
            </svg>
          </span>
          <h1 class="brand-name">Layered Minesweeper</h1>
        </div>
        <p>
          Stack multiple Minesweeper boards, pick how deep you want to dig, and uncover every layer without triggering a mine.
        </p>
      </header>
      <p class="setup-copy">
        Choose a preset to set the width, height, and number of layers before diving in.
      </p>
      <div class="setup-actions">
        <div class="preset-panel">
          <label class="preset-label" for="preset">Map size</label>
          <select id="preset" class="preset-select" v-model="selectedPreset">
            <option v-for="option in presetOptions" :key="option.key" :value="option.key">
              {{ option.label }}
            </option>
          </select>
        </div>
        <button class="primary" type="button" @click="startGame">
          Start Game
        </button>
      </div>
    </section>

    <section
      v-else-if="hasConfigured"
      class="game-section"
      aria-label="Active game"
    >
      <header class="game-header">
        <h2 class="game-title">
          <span class="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logo-gradient-game" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#6366f1" />
                  <stop offset="1" stop-color="#f472b6" />
                </linearGradient>
              </defs>
              <rect x="6" y="10" width="26" height="26" rx="6" fill="rgba(45, 212, 191, 0.65)" />
              <rect x="12" y="6" width="26" height="26" rx="8" fill="rgba(96, 165, 250, 0.7)" />
              <rect x="18" y="12" width="24" height="24" rx="7" fill="url(#logo-gradient-game)" />
            </svg>
          </span>
          Layered Minesweeper
        </h2>
      </header>
      <div class="game-controls">
        <button class="primary" type="button" @click="resetGame">New Game</button>
        <div class="summary">
          <span><strong>Total mines:</strong> {{ totalMines }}</span>
          <span><strong>Flags placed:</strong> {{ totalFlags }}</span>
        </div>
      </div>
      <div class="board-stack" role="region" aria-live="polite">
        <div
          v-for="(layer, layerIndex) in layers"
          :key="layer.id"
          class="board-layer"
          :class="layer.status"
          :style="layerStyle(layerIndex, layer.color)"
        >
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
      </div>
    </section>

    <section
      v-else
      class="victory-section"
      aria-label="Victory summary"
    >
      <header class="victory-header">
        <span class="victory-badge" aria-hidden="true">🎉</span>
        <h2>You Cleared Every Layer!</h2>
      </header>
      <p class="victory-copy">
        Awesome work! You navigated all {{ depth }} layers without tripping a single mine. Ready to try again?
      </p>
      <div class="victory-actions">
        <button class="primary" type="button" @click="startGame">
          Play Again
        </button>
        <button class="secondary" type="button" @click="resetGame">
          Back to Settings
        </button>
      </div>
    </section>
  </div>
</template>

<style>
.app-shell {
  max-width: min(1100px, 100vw - 2rem);
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-height: 100vh;
}

.app-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.75rem;
  animation: float 3s ease-in-out infinite;
}

.app-header h1 {
  margin: 0 0 0.5rem;
  font-size: clamp(2rem, 4vw, 2.8rem);
  background: linear-gradient(135deg, #ffd93d 0%, #ff6b6b 50%, #a8e6cf 100%);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 3s ease-in-out infinite;
  font-weight: 900;
  letter-spacing: -0.02em;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.app-header p {
  margin: 0;
  max-width: 60ch;
  color: #ffffff;
  text-align: center;
  font-size: 1.1rem;
  font-weight: 500;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.setup-section {
  display: grid;
  gap: 1.5rem;
  justify-items: center;
  background: rgba(255, 255, 255, 0.95);
  padding: 3rem 2rem;
  border-radius: 2rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  backdrop-filter: blur(10px);
}

.brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.brand-logo {
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 1rem;
  background: linear-gradient(135deg, rgba(255, 217, 61, 0.3), rgba(255, 107, 107, 0.3));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 25px rgba(255, 107, 107, 0.3);
  transition: transform 0.3s ease;
}

.brand-logo:hover {
  transform: rotate(360deg) scale(1.1);
}

.brand-logo svg {
  width: 100%;
  height: 100%;
  display: block;
}

.brand-name {
  margin: 0;
}

.setup-copy {
  margin: 0;
  max-width: 48ch;
  color: #475569;
  text-align: center;
  font-size: 1.05rem;
  font-weight: 500;
}

.setup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}

.game-section {
  display: grid;
  gap: 1.5rem;
  background: rgba(255, 255, 255, 0.95);
  padding: 2rem;
  border-radius: 2rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.victory-section {
  display: grid;
  gap: 1.5rem;
  align-items: center;
  justify-items: center;
  text-align: center;
  padding: 3rem 2.5rem;
  background: linear-gradient(135deg, rgba(255, 217, 61, 0.95), rgba(168, 230, 207, 0.95));
  border-radius: 2rem;
  box-shadow: 0 25px 60px rgba(255, 217, 61, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  animation: pulse 2s ease-in-out infinite;
}

.game-header {
  display: flex;
  align-items: center;
  justify-content: center;
}

.game-title {
  margin: 0;
  font-size: clamp(1.75rem, 3vw, 2.4rem);
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 800;
  color: #1e293b;
}

.victory-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.victory-header h2 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.8rem);
  color: #1e293b;
  font-weight: 900;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.victory-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 5rem;
  height: 5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd93d, #ff6b6b);
  color: white;
  font-size: 2.5rem;
  box-shadow: 0 18px 35px rgba(255, 217, 61, 0.5);
  animation: pulse 1.5s ease-in-out infinite;
}

.victory-copy {
  margin: 0;
  max-width: 48ch;
  color: #1e293b;
  font-size: 1.1rem;
  font-weight: 500;
}

.victory-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}

.game-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: center;
}

.preset-panel {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, #f8fafc, #e2e8f0);
  border-radius: 1rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.preset-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preset-select {
  padding: 0.5rem 0.75rem;
  border: 2px solid #cbd5e1;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  background: white;
  transition: all 0.2s ease;
  cursor: pointer;
}

.preset-select:focus {
  outline: none;
  border-color: #ff6b6b;
  box-shadow: 0 0 0 4px rgba(255, 107, 107, 0.2);
  transform: scale(1.02);
}

button.primary {
  border: none;
  border-radius: 1rem;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  background: linear-gradient(135deg, #ff6b6b, #ffd93d);
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  box-shadow: 0 8px 20px rgba(255, 107, 107, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: relative;
  overflow: hidden;
}

button.primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
}

button.primary:hover::before {
  left: 100%;
}

button.primary:hover {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 12px 30px rgba(255, 107, 107, 0.5);
}

button.primary:active {
  transform: translateY(-1px) scale(0.98);
}

button.secondary {
  border: 2px solid rgba(255, 107, 107, 0.5);
  border-radius: 1rem;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  background: white;
  color: #ff6b6b;
  box-shadow: 0 8px 18px rgba(255, 107, 107, 0.2);
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

button.secondary:hover {
  transform: translateY(-3px) scale(1.02);
  border-color: #ff6b6b;
  box-shadow: 0 12px 22px rgba(255, 107, 107, 0.3);
  background: rgba(255, 107, 107, 0.05);
}

button.secondary:active {
  transform: translateY(-1px) scale(0.98);
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-radius: 1rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border: 2px solid rgba(253, 224, 71, 0.5);
  font-weight: 600;
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
  border-radius: 1.5rem;
  overflow: hidden;
  border: 3px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  transform-origin: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}

.board-layer.playing {
  filter: drop-shadow(0 24px 50px rgba(15, 23, 42, 0.25));
  animation: float 4s ease-in-out infinite;
}

.board-layer.won {
  filter: drop-shadow(0 24px 40px rgba(34, 197, 94, 0.35));
}

.board-layer.lost {
  filter: drop-shadow(0 24px 40px rgba(239, 68, 68, 0.35));
}

.grid {
  display: grid;
  gap: 4px;
  padding: 1.25rem 1.5rem 1.75rem;
  background: transparent;
  backdrop-filter: none;
  border-top: none;
  pointer-events: none;
}

.cell {
  width: var(--cell-size);
  height: var(--cell-size);
  border-radius: 0.5rem;
  border: 1px solid transparent;
  font-weight: 800;
  font-size: 1.1rem;
  display: grid;
  place-items: center;
  cursor: pointer;
  user-select: none;
  background: linear-gradient(150deg, var(--layer-color, #e2e8f0), var(--cell-base, #cbd5f5));
  color: #0f172a;
  box-shadow: inset 0 -3px 0 var(--cell-shadow, rgba(15, 23, 42, 0.15));
  pointer-events: auto;
  transition: all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
}

.cell::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), transparent);
  border-radius: 0.5rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.cell.hidden:hover::before {
  opacity: 1;
}

.cell.hidden {
  border-color: var(--cell-border, rgba(148, 163, 184, 0.35));
}

.cell.hidden:hover {
  transform: scale(1.1) translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15), inset 0 -3px 0 var(--cell-shadow, rgba(15, 23, 42, 0.15));
}

.cell.hidden:active {
  transform: scale(0.95);
}

.cell.revealed {
  cursor: default;
  background: linear-gradient(150deg, var(--cell-highlight, #eff6ff), rgba(255, 255, 255, 0.85));
  border-color: var(--cell-border, rgba(148, 163, 184, 0.35));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.cell.flagged {
  background: linear-gradient(135deg, #ffd93d, #ffeaa7);
  animation: pulse 0.5s ease-in-out;
  border-color: rgba(255, 217, 61, 0.5);
}

.cell.mine.revealed {
  background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
  color: #fff;
  animation: pulse 0.3s ease-in-out;
}

.cell.triggered {
  box-shadow: 0 0 0 4px rgba(248, 113, 113, 0.8), 0 0 20px rgba(248, 113, 113, 0.6);
  animation: pulse 0.5s ease-in-out infinite;
}

.cell.misflagged {
  background: rgba(248, 113, 113, 0.7);
  color: white;
}

.cell.emptied {
  visibility: hidden;
  pointer-events: none;
  border-color: transparent;
  box-shadow: none;
  background: transparent;
  color: transparent;
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
  .setup-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .game-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .summary {
    flex-direction: row;
    justify-content: space-between;
  }

  .victory-section {
    padding: 2.5rem 1.75rem;
  }

  .victory-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .board-stack {
    min-height: 240px;
  }
}
</style>

