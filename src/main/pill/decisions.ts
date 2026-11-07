import type { DecisionPatch, PillDecision } from '../../shared/pill'

// Decisions waiting in the pill. Until the pill reads real data, the only way in is the
// test set below, loaded from the menu-bar icon. Kept in memory, never written to Supabase.
let decisions: PillDecision[] = []
const listeners = new Set<(decisions: PillDecision[]) => void>()

// Week 7 test task 2: what Claude would catch from the four lines the tester says.
const TEST_SET: PillDecision[] = [
  { id: 't1', title: 'Pull visuals from our brand guidelines', confirmed: false },
  {
    id: 't2',
    title: 'Keep the promo video to 15 seconds',
    why: 'Short clips hold attention on social',
    guessed: true,
    confirmed: false
  },
  { id: 't3', title: "Open on a cat's paw tapping the screen", confirmed: false },
  { id: 't4', title: 'Purple background', unsure: true, confirmed: false }
]

const emit = (): void => listeners.forEach((fn) => fn(decisions))

export const pillDecisions = (): PillDecision[] => decisions
export const testDecisionsLoaded = (): boolean => decisions.length > 0

export function onDecisions(fn: (decisions: PillDecision[]) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function loadTestDecisions(): void {
  decisions = TEST_SET.map((d) => ({ ...d }))
  emit()
}

export function clearDecisions(): void {
  decisions = []
  emit()
}

export function updateDecision(id: string, patch: DecisionPatch): void {
  decisions =
    patch === null
      ? decisions.filter((d) => d.id !== id)
      : decisions.map((d) => (d.id === id ? { ...d, ...patch } : d))
  emit()
}
