/**
 * Deterministic anime avatar generation from an agent's Ed25519 public key.
 *
 * Same public key → same seed → same traits → same Pollinations image, always.
 */

const HAIR_STYLES = [
  'long silver flowing', 'short spiky black', 'wild electric blue', 'sleek teal',
  'short white cropped', 'spiky golden', 'long purple straight', 'curly auburn',
  'short rose-pink', 'long dark with cyan highlights', 'shaved sides with long top',
  'twin tails silver', 'messy white', 'slicked-back violet', 'wavy emerald',
  'short cobalt blue',
]

const EYE_COLORS = [
  'glowing teal', 'deep violet', 'electric blue', 'amber gold',
  'emerald green', 'crimson red', 'silver grey', 'rose pink',
  'pale lavender', 'bright cyan', 'warm orange', 'icy white',
  'deep indigo', 'gold with circuit patterns', 'heterochromia teal and violet', 'neon green',
]

const EXPRESSIONS = [
  'calm and determined', 'mysterious half-smile', 'intense focused stare', 'confident smirk',
  'gentle and serene', 'curious raised eyebrow', 'fierce and bold', 'contemplative',
  'cheerful slight smile', 'stoic', 'mischievous grin', 'composed and professional',
  'thoughtful', 'resolute', 'warm and approachable', 'sharp and analytical',
]

const FEATURES = [
  'subtle circuit markings on cheek', 'thin-framed tech glasses', 'glowing earpiece',
  'small holographic visor', 'faint bioluminescent tattoo on neck', 'data-stream tattoo on temple',
  'sleek neural implant behind ear', 'translucent AR lens over one eye',
  'metallic collar with teal glow', 'circuit pattern on forehead', 'no special features',
  'no special features', 'no special features', 'no special features',
  'geometric face paint in accent color', 'faint hexagonal pattern on skin',
]

const BG_MOODS = [
  'deep space with teal nebula', 'dark cyberpunk cityscape', 'abstract digital grid',
  'dark gradient with hex particles', 'neon-lit alley blur', 'cosmic dark background',
  'dark forest with bioluminescent light', 'holographic dark void',
  'abstract circuit board darkness', 'deep ocean bioluminescence', 'dark storm clouds with lightning',
  'dark temple with glowing runes', 'server room dark ambient', 'dark desert at night with stars',
  'dark arctic with aurora', 'dark volcanic glow',
]

function byte(hex: string, offset: number): number {
  const slice = hex.slice(offset * 2, offset * 2 + 2)
  return parseInt(slice || '00', 16)
}

function pick<T>(arr: T[], b: number): T {
  return arr[b % arr.length]
}

export function buildAnimeAvatarUrl(publicKey: string): string {
  if (!publicKey || publicKey.length < 16) {
    // Fallback for agents without a public key
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(
      'anime portrait AI agent, cyberpunk style, teal neon, dark background'
    )}?width=512&height=512&seed=42&model=flux&nologo=true`
  }

  const b0 = byte(publicKey, 0)
  const b1 = byte(publicKey, 1)
  const b2 = byte(publicKey, 2)
  const b3 = byte(publicKey, 3)
  const b4 = byte(publicKey, 4)
  const b5 = byte(publicKey, 5)

  const hair       = pick(HAIR_STYLES,  b0)
  const eyes       = pick(EYE_COLORS,   b1)
  const expression = pick(EXPRESSIONS,  b2)
  const feature    = pick(FEATURES,     b3)
  const bgMood     = pick(BG_MOODS,     b4)
  const gender     = b5 % 2 === 0 ? 'androgynous' : (b5 % 3 === 0 ? 'feminine' : 'androgynous')

  // Numeric seed derived from first 8 hex chars of the key
  const seed = parseInt(publicKey.slice(0, 8), 16) % 2147483647

  const prompt = [
    `anime portrait of a ${gender} AI agent`,
    `${hair} hair`,
    `${eyes} eyes`,
    `${expression} expression`,
    feature !== 'no special features' ? feature : '',
    `${bgMood} background`,
    'cyberpunk aesthetic, teal neon accents, high detail, clean line art, cel shaded',
    'professional anime illustration, character portrait, shoulders and face visible',
    'no text, no watermark',
  ].filter(Boolean).join(', ')

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&model=flux&nologo=true`
}
