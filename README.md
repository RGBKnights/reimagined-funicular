# Layered Minesweeper

This project contains a Vite + Vue 3 implementation of a layered Minesweeper experience. You can configure the board dimensions (X, Y) and the number of stacked layers (Z) to create bespoke puzzles. Every layer behaves like a classic Minesweeper board and receives a color from a curated palette for quick visual distinction.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Build for production:

   ```bash
   npm run build
   ```

4. Preview the production build locally:

   ```bash
   npm run preview
   ```

## Gameplay controls

- Left click (or tap) to reveal a tile.
- Right click (or long-press on touch devices with context menu) to toggle a flag on a tile.
- Use the debug controls above the board to adjust X (width), Y (height), Z (layer count), and the mine density.
- Click **New Game** to reshuffle mines with the current configuration.

Enjoy tackling Minesweeper boards in three dimensions!
