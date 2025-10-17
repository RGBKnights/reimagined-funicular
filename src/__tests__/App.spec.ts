import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from '../App.vue'

type TestCell = {
  x: number
  y: number
  hasMine: boolean
  adjacentMines: number
  isRevealed: boolean
  isFlagged: boolean
  wasTriggered?: boolean
  isMisflagged?: boolean
}

describe('Layered Minesweeper gameplay', () => {
  it('reveals contiguous safe cells and flags remaining mines when a layer is cleared', () => {
    const wrapper = mount(App)
    const vm = wrapper.vm as any

    const cells = createBoard(3, 3, [coord(2, 2)])
    const layer = createLayer(0, cells)

    vm.width = 3
    vm.height = 3
    vm.depth = 1
    vm.layers = [layer]

    vm.revealCell(0, cells[0][0])

    const safeCells = layer.flatCells.filter((cell: TestCell) => !cell.hasMine)
    expect(safeCells.every((cell: TestCell) => cell.isRevealed)).toBe(true)
    expect(layer.revealedCount).toBe(8)
    expect(layer.status).toBe('won')

    const mineCell = layer.flatCells.find((cell: TestCell) => cell.hasMine) as TestCell
    expect(mineCell.isFlagged).toBe(true)
    expect(mineCell.isRevealed).toBe(false)

    wrapper.unmount()
  })

  it('ends the layer and reveals all mines when a mine is triggered', () => {
    const wrapper = mount(App)
    const vm = wrapper.vm as any

    const cells = createBoard(2, 2, [coord(0, 0), coord(1, 1)])
    const layer = createLayer(0, cells)

    vm.width = 2
    vm.height = 2
    vm.depth = 1
    vm.layers = [layer]

    const triggeredMine = cells[0][0]
    vm.revealCell(0, triggeredMine)

    expect(layer.status).toBe('lost')
    expect(triggeredMine.wasTriggered).toBe(true)

    const mineCells = layer.flatCells.filter((cell: TestCell) => cell.hasMine)
    expect(mineCells.every((cell: TestCell) => cell.isRevealed)).toBe(true)

    const safeCells = layer.flatCells.filter((cell: TestCell) => !cell.hasMine)
    expect(safeCells.every((cell: TestCell) => !cell.isRevealed)).toBe(true)

    wrapper.unmount()
  })

  it('tracks flags correctly and prevents flagging revealed cells', () => {
    const wrapper = mount(App)
    const vm = wrapper.vm as any

    const cells = createBoard(2, 2, [coord(1, 1)])
    const layer = createLayer(0, cells)

    vm.width = 2
    vm.height = 2
    vm.depth = 1
    vm.layers = [layer]

    const target = cells[0][1]
    vm.toggleFlag(0, target)
    expect(target.isFlagged).toBe(true)
    expect(layer.flagsUsed).toBe(1)

    vm.toggleFlag(0, target)
    expect(target.isFlagged).toBe(false)
    expect(layer.flagsUsed).toBe(0)

    vm.revealCell(0, target)
    const previousFlags = layer.flagsUsed
    vm.toggleFlag(0, target)
    expect(layer.flagsUsed).toBe(previousFlags)
    expect(target.isFlagged).toBe(false)

    wrapper.unmount()
  })

  it('maintains independent state across multiple layers', () => {
    const wrapper = mount(App)
    const vm = wrapper.vm as any

    const topLayerCells = createBoard(2, 2, [coord(0, 0)])
    const bottomLayerCells = createBoard(2, 2, [coord(1, 1)])
    const topLayer = createLayer(0, topLayerCells)
    const bottomLayer = createLayer(1, bottomLayerCells)

    vm.width = 2
    vm.height = 2
    vm.depth = 2
    vm.layers = [topLayer, bottomLayer]

    vm.revealCell(0, topLayerCells[0][0])

    expect(topLayer.status).toBe('lost')
    expect(bottomLayer.status).toBe('playing')
    const bottomSafeCells = bottomLayer.flatCells.filter((cell: TestCell) => !cell.hasMine)
    expect(bottomSafeCells.every((cell: TestCell) => !cell.isRevealed)).toBe(true)

    vm.toggleFlag(1, bottomLayerCells[0][0])
    expect(bottomLayer.flagsUsed).toBe(1)

    wrapper.unmount()
  })
})

function coord(x: number, y: number) {
  return `${x},${y}`
}

function createBoard(width: number, height: number, mines: string[]) {
  const mineSet = new Set(mines)
  const cells: TestCell[][] = []

  for (let y = 0; y < height; y++) {
    const row: TestCell[] = []
    for (let x = 0; x < width; x++) {
      row.push(
        createCell(x, y, {
          hasMine: mineSet.has(coord(x, y))
        })
      )
    }
    cells.push(row)
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x]
      if (!cell.hasMine) {
        cell.adjacentMines = countAdjacentMines(cells, x, y)
      }
    }
  }

  return cells
}

function createLayer(id: number, cells: TestCell[][]) {
  const flatCells = cells.flat()
  const mines = flatCells.filter((cell) => cell.hasMine).length

  return {
    id,
    color: '#6C5CE7',
    cells,
    flatCells,
    mines,
    status: 'playing',
    revealedCount: 0,
    flagsUsed: 0
  }
}

function createCell(x: number, y: number, overrides: Partial<TestCell> = {}) {
  return {
    x,
    y,
    hasMine: false,
    adjacentMines: 0,
    isRevealed: false,
    isFlagged: false,
    ...overrides
  }
}

function countAdjacentMines(cells: TestCell[][], x: number, y: number) {
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
