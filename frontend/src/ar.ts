import type { Landmarks, Measurements, Product, Recommendation } from './types'

type Point = { x: number; y: number }
export type GarmentPlacement = { anchor: Point; angle: number; drawWidth: number; drawHeight: number; sourceAnchorY: number }

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const center = (range?: [number, number]) => range ? (range[0] + range[1]) / 2 : 0
const upper = (range?: [number, number]) => range?.[1] || 0

function ease(fit: string): number {
  return ({ slim: .96, tapered: .98, regular: 1, straight: 1, relaxed: 1.05, wide: 1.1, oversized: 1.12 } as Record<string, number>)[fit] || 1
}

/** Lay out one demo garment using its selected size chart and the live person's pixel/cm scale. */
export function garmentPlacement(product: Product, size: string, landmarks: Landmarks, measurements: Measurements, width: number, height: number): GarmentPlacement | null {
  const point = (name: string): Point | null => {
    const item = landmarks[name]
    return item && item.visibility > .45 ? { x: item.x * width, y: item.y * height } : null
  }
  const ls = point('left_shoulder'), rs = point('right_shoulder')
  const lh = point('left_hip'), rh = point('right_hip')
  if (!ls || !rs || !lh || !rh) return null
  const chart = product.size_chart[size] || product.size_chart.M
  if (!chart) return null

  const shoulderCenter = midpoint(ls, rs)
  const hipCenter = midpoint(lh, rh)
  const shoulderWidth = distance(ls, rs)
  const hipWidth = distance(lh, rh)
  const nose = point('nose'), la = point('left_ankle'), ra = point('right_ankle')
  const ankleY = la && ra ? midpoint(la, ra).y : la?.y || ra?.y || 0
  const statureCm = measurements.height?.cm
  // Nose-to-ankle distance is about 90% of standing height in the demo pose.
  const fullBodyScale = nose && ankleY > nose.y + 50 && statureCm && statureCm > 0 ? (ankleY - nose.y) / (statureCm * .9) : 0
  const shoulderScale = measurements.shoulder?.cm && measurements.shoulder.cm > 0 ? shoulderWidth / measurements.shoulder.cm : 0
  const hipScale = measurements.hip_width?.cm && measurements.hip_width.cm > 0 ? hipWidth / measurements.hip_width.cm : 0
  const pxPerCm = fullBodyScale || shoulderScale || hipScale || shoulderWidth / 43
  if (!Number.isFinite(pxPerCm) || pxPerCm <= 0 || shoulderWidth < 10 || hipWidth < 10) return null

  if (product.type === 'top') {
    const shoulderCm = upper(chart.shoulder) + 1
    const chestCm = upper(chart.chest) + 6
    const lengthCm = upper(chart.torso_length)
    if (!shoulderCm || !chestCm || !lengthCm) return null
    // The SVG torso spans roughly 46% of its canvas at the shoulder and 43% at the chest.
    const drawWidth = Math.max(shoulderCm / (238 / 512), chestCm / (2.6 * 220 / 512)) * pxPerCm * ease(product.fit)
    const drawHeight = lengthCm * pxPerCm * (768 / 455) * (product.fit === 'oversized' ? 1.05 : 1)
    const left = ls.x < rs.x ? ls : rs, right = ls.x < rs.x ? rs : ls
    return { anchor: shoulderCenter, angle: Math.atan2(right.y - left.y, right.x - left.x), drawWidth, drawHeight, sourceAnchorY: 100 }
  }

  if (!ankleY) return null
  const waistCm = upper(chart.waist) + 4
  const hipsCm = upper(chart.hip) + 4
  const lengthCm = center(chart.outer_leg) + 2
  if (!waistCm || !hipsCm || !lengthCm) return null
  // The pants SVG has a narrower waist than hip; blend both projected widths.
  const waistCanvasCm = (waistCm / 2.6) / (292 / 512)
  const hipCanvasCm = (hipsCm / 2.5) / (318 / 512)
  const drawWidth = (waistCanvasCm * .35 + hipCanvasCm * .65) * pxPerCm * ease(product.fit)
  const waistCenter = mix(shoulderCenter, hipCenter, .67)
  const visibleLength = Math.min(lengthCm * pxPerCm, ankleY - waistCenter.y + 5 * pxPerCm)
  if (visibleLength <= 0) return null
  const drawHeight = visibleLength * (768 / 653)
  const left = lh.x < rh.x ? lh : rh, right = lh.x < rh.x ? rh : lh
  return { anchor: waistCenter, angle: Math.atan2(right.y - left.y, right.x - left.x), drawWidth, drawHeight, sourceAnchorY: 54 }
}

function paint(ctx: CanvasRenderingContext2D, image: HTMLImageElement, placement: GarmentPlacement) {
  const { anchor, angle, drawWidth, drawHeight, sourceAnchorY } = placement
  ctx.save()
  ctx.translate(anchor.x, anchor.y)
  ctx.rotate(angle)
  ctx.globalAlpha = .96
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, -drawWidth / 2, -drawHeight * sourceAnchorY / 768, drawWidth, drawHeight)
  ctx.restore()
}

export function drawGarments(ctx: CanvasRenderingContext2D, landmarks: Landmarks, products: Product[], selected: { top?: string; bottom?: string }, images: Map<string, HTMLImageElement>, width: number, height: number, measurements: Measurements, selectedSizes: Record<string, string>, recommendations: Recommendation[]) {
  for (const type of ['bottom', 'top'] as const) {
    const product = products.find(item => item.id === selected[type])
    if (!product) continue
    const image = images.get(product.id)
    if (!image?.complete || image.naturalWidth <= 0) continue
    const size = selectedSizes[product.id] || recommendations.find(item => item.product_id === product.id)?.size || 'M'
    const placement = garmentPlacement(product, size, landmarks, measurements, width, height)
    if (placement) paint(ctx, image, placement)
  }
}
