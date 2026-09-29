import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/scan.ts', import.meta.url), 'utf8')
const compiled = await transform(source, { loader: 'ts', format: 'esm' })
const { advanceHold, scanPose } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`)

const at = (x, y) => ({ x: x / 640, y: y / 800, visibility: 1 })
const front = {
  nose: at(320, 90),
  left_shoulder: at(220, 210), right_shoulder: at(420, 210),
  left_elbow: at(170, 340), right_elbow: at(470, 340),
  left_wrist: at(150, 470), right_wrist: at(490, 470),
  left_hip: at(260, 470), right_hip: at(380, 470),
  left_knee: at(270, 620), right_knee: at(370, 620),
  left_ankle: at(275, 745), right_ankle: at(365, 745),
  left_foot: at(270, 760), right_foot: at(370, 760),
}
const frontResult = scanPose(front, 'front', 0, 640, 800)
assert.equal(frontResult.ready, true)
assert.equal(scanPose(front, 'side', frontResult.ratio, 640, 800).ready, false)

const side = {
  ...front,
  left_shoulder: at(305, 210), right_shoulder: at(335, 210),
  left_hip: at(310, 470), right_hip: at(330, 470),
}
assert.equal(scanPose(side, 'side', frontResult.ratio, 640, 800).ready, true)
assert.equal(scanPose(side, 'front', 0, 640, 800).ready, false)
const sideOccluded = { ...side, right_shoulder: { ...side.right_shoulder, visibility: 0 }, right_hip: { ...side.right_hip, visibility: 0 } }
assert.equal(scanPose(sideOccluded, 'side', frontResult.ratio, 640, 800).ready, true)
const profileWithHiddenFoot = {
  ...front,
  nose: { ...front.nose, visibility: .3 },
  right_hip: { ...front.right_hip, visibility: 0 },
  right_ankle: { ...front.right_ankle, visibility: 0 },
  left_foot: { ...front.left_foot, visibility: 0 },
  right_foot: { ...front.right_foot, visibility: 0 },
}
assert.equal(scanPose(profileWithHiddenFoot, 'side', frontResult.ratio, 640, 800).ready, true)
assert.equal(scanPose(profileWithHiddenFoot, 'front', 0, 640, 800).ready, false)
const cropped = { ...front, left_foot: { ...front.left_foot, visibility: 0 }, right_foot: { ...front.right_foot, visibility: 0 } }
assert.equal(scanPose(cropped, 'front', 0, 640, 800).ready, false)

const anchor = frontResult.anchor
assert.ok(anchor)
const started = advanceHold(null, anchor, frontResult.ratio, 640, 800, 1000)
assert.equal(started.remaining, 3)
assert.equal(started.shouldCapture, false)
let holding = started
for (let now = 1100; now < 4000; now += 100) holding = advanceHold(holding.hold, anchor, frontResult.ratio, 640, 800, now)
assert.equal(holding.shouldCapture, false)
assert.equal(advanceHold(holding.hold, anchor, frontResult.ratio, 640, 800, 4000).shouldCapture, true)
const moved = advanceHold(started.hold, { ...anchor, x: anchor.x + .06 }, frontResult.ratio, 640, 800, 1100)
assert.equal(moved.remaining, 3)
assert.equal(moved.shouldCapture, false)
assert.equal(advanceHold(started.hold, anchor, frontResult.ratio, 640, 800, 4000).remaining, 3)
let longer = started
for (let now = 1100; now < 6000; now += 100) longer = advanceHold(longer.hold, anchor, frontResult.ratio, 640, 800, now, 5)
assert.equal(advanceHold(longer.hold, anchor, frontResult.ratio, 640, 800, 6000, 5).shouldCapture, true)
let sideHold = advanceHold(null, scanPose(side, 'side', frontResult.ratio, 640, 800).anchor, .03, 640, 800, 1000, 3, 'side')
const profileJitter = advanceHold(sideHold.hold, { ...sideHold.hold, x: sideHold.hold.x + .04 }, .05, 640, 800, 1100, 3, 'side')
assert.equal(profileJitter.remaining, 3)
assert.equal(profileJitter.hold.startedAt, 1000)
for (let now = 1100; now < 4000; now += 100) sideHold = advanceHold(sideHold.hold, sideHold.hold, now % 200 ? .03 : .05, 640, 800, now, 3, 'side')
assert.equal(advanceHold(sideHold.hold, sideHold.hold, .05, 640, 800, 4000, 3, 'side').shouldCapture, true)
console.log('PASS full body, side occlusion, cropped body, stable side countdown, motion reset')
