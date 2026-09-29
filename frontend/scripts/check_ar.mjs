import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/ar.ts', import.meta.url), 'utf8')
const compiled = await transform(source, { loader: 'ts', format: 'esm' })
const { garmentPlacement, drawGarments } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`)
const { products } = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'))
const top = products.find(item => item.id === 'top-01')
const bottom = products.find(item => item.id === 'bottom-01')
const at = (x, y) => ({ x: x / 640, y: y / 800, visibility: 1 })
const landmarks = {
  nose: at(320, 90),
  left_shoulder: at(220, 200), right_shoulder: at(420, 200),
  left_hip: at(260, 455), right_hip: at(380, 455),
  left_ankle: at(275, 755), right_ankle: at(365, 755),
}
const measurements = Object.fromEntries(Object.entries({ height: 179, shoulder: 42, chest: 92, waist: 76, hip: 96, hip_width: 37, outer_leg: 96 }).map(([key, cm]) => [key, { cm, source: 'manual' }]))
const box = (product, size) => garmentPlacement(product, size, landmarks, measurements, 640, 800)
const topM = box(top, 'M'), topXL = box(top, 'XL')
const pantsM = box(bottom, 'M'), pantsXL = box(bottom, 'XL')
assert.ok(topM && topXL && pantsM && pantsXL)
assert.ok(topXL.drawWidth > topM.drawWidth * 1.15)
assert.ok(topXL.drawHeight > topM.drawHeight * 1.1)
assert.ok(pantsXL.drawWidth > pantsM.drawWidth * 1.15)
assert.ok(pantsM.drawWidth * (318 / 512) > 150, 'pants should cover a 37 cm hip silhouette')
assert.ok(pantsM.anchor.y < 400, 'pants waistband belongs above the hip landmark')

const drawnWidths = []
const ctx = {
  save() {}, restore() {}, translate() {}, rotate() {},
  drawImage(_image, _x, _y, width) { drawnWidths.push(width) },
}
const images = new Map([[bottom.id, { complete: true, naturalWidth: 512 }]])
const rec = size => [{ product_id: bottom.id, size, fit_status: 'fits', score: 3, reasons: [] }]
const render = (recommendation, override = {}) => drawGarments(ctx, landmarks, [bottom], { bottom: bottom.id }, images, 640, 800, measurements, override, recommendation)
render(rec('M'))
render(rec('XL'))
render(rec('XL'), { [bottom.id]: 'S' })
assert.ok(drawnWidths[1] > drawnWidths[0], 'changing recommended size must resize the garment')
assert.ok(drawnWidths[2] < drawnWidths[0], 'manual size choice must override the recommendation')
console.log('PASS AR garment size follows chart, recommendation, manual override, and live body scale')
