import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const bundled = await build({ entryPoints: [fileURLToPath(new URL('../src/ar3d.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
const { calculateBodyRig, garmentDimensions, shirtGeometry } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)
const { products } = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'))
const at = (x, y, z = 0) => ({ x: x / 640, y: y / 800, z, visibility: 1 })
const front = {
  left_shoulder: at(420, 200), right_shoulder: at(220, 200),
  left_hip: at(380, 450), right_hip: at(260, 450),
  left_elbow: at(455, 330), right_elbow: at(185, 330),
  left_wrist: at(470, 470), right_wrist: at(170, 470),
  left_knee: at(375, 615), right_knee: at(265, 615),
  left_ankle: at(370, 755), right_ankle: at(270, 755),
}
const measurements = { height: { cm: 179 }, torso_length: { cm: 52 } }
const frontRig = calculateBodyRig(front, measurements, 640, 800, 1)
assert.ok(frontRig)
assert.ok(Math.abs(frontRig.yaw) < .01)
const back = {
  ...front,
  left_shoulder: at(220, 200), right_shoulder: at(420, 200),
  left_hip: at(260, 450), right_hip: at(380, 450),
}
const backRig = calculateBodyRig(back, measurements, 640, 800, 1)
assert.ok(backRig && Math.abs(Math.abs(backRig.yaw) - Math.PI) < .01)
const profile = {
  ...front,
  left_shoulder: at(321, 200, -.3), right_shoulder: at(319, 200, .3),
}
const profileRig = calculateBodyRig(profile, measurements, 640, 800, 1)
assert.ok(profileRig && Math.abs(Math.abs(profileRig.yaw) - Math.PI / 2) < .03)
const kicking = { ...front, left_knee: at(440, 600, -.2), left_ankle: at(500, 620, -.4) }
const kickingRig = calculateBodyRig(kicking, measurements, 640, 800, 1)
assert.ok(kickingRig && kickingRig.leftAnkle.x > frontRig.leftAnkle.x + 100)
assert.ok(kickingRig.leftAnkle.z > frontRig.leftAnkle.z + 100)
const pants = products.find(product => product.id === 'bottom-01')
const shirt = products.find(product => product.id === 'top-01')
assert.ok(garmentDimensions(pants, 'XL', frontRig.pxPerCm).limbRadius > garmentDimensions(pants, 'M', frontRig.pxPerCm).limbRadius)
assert.ok(garmentDimensions(shirt, 'XL', frontRig.pxPerCm).width > garmentDimensions(shirt, 'M', frontRig.pxPerCm).width)
console.log('PASS 3D pose yaw front/side/back, articulated kick joint, garment sizes')

const frontMesh = shirtGeometry(), backMesh = shirtGeometry(true)
const vertices = frontMesh.getAttribute('position'), backVertices = backMesh.getAttribute('position')
// Shoulders must rise above the old flat cylinder top (.5) and connect to an open neck.
assert.ok(vertices.getY(0) > .6)
assert.ok(vertices.getY(25) > .5)
assert.ok(Math.abs(vertices.getX(0)) < Math.abs(vertices.getX(25)))
for (let row = 0; row < 4; row++) {
  for (const [a, b] of [[row * 25, row * 25 + 24], [row * 25 + 24, row * 25]]) {
    assert.ok(Math.abs(vertices.getX(a) - backVertices.getX(b)) < 1e-6)
    assert.ok(Math.abs(vertices.getY(a) - backVertices.getY(b)) < 1e-6)
    assert.ok(Math.abs(vertices.getZ(a) - backVertices.getZ(b)) < 1e-6)
  }
}
assert.ok([...frontMesh.getAttribute('normal').array].every(Number.isFinite))
console.log('PASS raised shoulder coverage, open neck, continuous front/back seams')
