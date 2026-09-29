import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const result = await build({ entryPoints: [fileURLToPath(new URL('../src/tracking.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
const { TrackingPacer, smoothLandmark } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
const pacer = new TrackingPacer()
for (let i = 0; i < 40; i++) pacer.receive(i * 50, i * 50 + 30)
assert.equal(pacer.interval, 50)
assert.equal(pacer.fps, 20)
for (let i = 0; i < 40; i++) pacer.receive(2000 + i * 100, 2100 + i * 100)
assert.equal(pacer.interval, 1000 / 15)
assert.equal(pacer.fps, 10) // Reports actual throughput, never invents a 15 FPS minimum.
for (let i = 0; i < 40; i++) pacer.receive(6100 + i * 50, 6130 + i * 50)
assert.equal(pacer.interval, 50)
const start = {x:.5,y:.5,z:0,visibility:1}, moved = {...start,x:.7,z:.2}
const filtered = smoothLandmark(start,moved)
assert.ok(filtered.x > .68 && filtered.x <= moved.x)
assert.ok(filtered.z > .18 && filtered.z <= moved.z)
const jitter = smoothLandmark(start,{...start,x:.501})
assert.ok(jitter.x > start.x && jitter.x < .501)
pacer.reset()
assert.equal(pacer.fps,0)
console.log('PASS pacing 20 FPS, load adaptation, recovery, actual FPS, responsive motion filtering')
