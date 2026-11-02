import { app, screen } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PILL } from '../../shared/pill'

// The pill's top-left corner on screen, kept between launches.
export interface Point {
  x: number
  y: number
}

const EDGE = 12
const file = (): string => join(app.getPath('userData'), 'pill.json')

// Default spot: the right edge of the main screen, halfway down, like the wireframe.
function defaultPosition(): Point {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: area.x + area.width - PILL.width - EDGE,
    y: Math.round(area.y + (area.height - PILL.height) / 2)
  }
}

// Keeps the whole pill on the screen it is mostly on.
export function clampToScreen(p: Point): Point {
  const center = { x: Math.round(p.x + PILL.width / 2), y: Math.round(p.y + PILL.height / 2) }
  const area = screen.getDisplayNearestPoint(center).workArea
  return {
    x: Math.min(Math.max(p.x, area.x + 4), area.x + area.width - PILL.width - 4),
    y: Math.min(Math.max(p.y, area.y + 4), area.y + area.height - PILL.height - 4)
  }
}

export function loadPosition(): Point {
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8')) as Point
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      // A screen that was unplugged since: fall back to the default spot.
      const onScreen = screen.getAllDisplays().some(({ workArea: a }) => {
        const cx = saved.x + PILL.width / 2
        const cy = saved.y + PILL.height / 2
        return cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height
      })
      if (onScreen) return clampToScreen(saved)
    }
  } catch {
    // No saved spot yet.
  }
  return defaultPosition()
}

export function savePosition(p: Point): void {
  try {
    writeFileSync(file(), JSON.stringify(p))
  } catch (err) {
    console.error('[whyspace pill] could not save position', err)
  }
}
