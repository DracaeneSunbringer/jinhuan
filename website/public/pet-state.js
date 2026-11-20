export const DEFAULT_PET_STATE = Object.freeze({
  version: 1,
  activePet: 'dsh-blue-whale',
  level: 1,
  xp: 0,
  hunger: 78,
  energy: 82,
  cleanliness: 86,
  affection: 12,
  lastTick: 0,
  currentAction: '待机呼吸休闲',
})

const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max

export function validPetState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const s = value
  return s.version === 1
    && typeof s.activePet === 'string' && /^[a-z0-9][a-z0-9-]{1,47}$/.test(s.activePet)
    && integer(s.level, 1, 100)
    && integer(s.xp, 0, 1_000_000_000)
    && integer(s.hunger, 0, 100)
    && integer(s.energy, 0, 100)
    && integer(s.cleanliness, 0, 100)
    && integer(s.affection, 0, 100)
    && integer(s.lastTick, 0, 4_000_000_000)
    && typeof s.currentAction === 'string'
    && s.currentAction.length > 0
    && s.currentAction.length <= 80
}

export function clonePetState(value = DEFAULT_PET_STATE) {
  return JSON.parse(JSON.stringify(value))
}
