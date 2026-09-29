import type { Landmark } from './types'

/** One in-flight frame; interval adapts to measured encode + network + inference time. */
export class TrackingPacer {
  private latency = 45
  private samples: number[] = []
  interval = 50
  reset() { this.latency = 45; this.interval = 50; this.samples = [] }
  receive(sentAt: number, now: number) {
    this.latency = this.latency * .8 + Math.max(0, now - sentAt) * .2
    this.interval = Math.max(50, Math.min(1000 / 15, this.latency * 1.1))
    this.samples.push(now)
    this.samples = this.samples.filter(time => time >= now - 1000)
  }
  get fps() {
    if (this.samples.length < 2) return 0
    return Math.round((this.samples.length - 1) * 1000 / (this.samples.at(-1)! - this.samples[0]))
  }
}

export function smoothLandmark(previous: Landmark | undefined, current: Landmark): Landmark {
  if (!previous || previous.visibility < .3) return current
  const movement = Math.hypot(current.x - previous.x, current.y - previous.y, (current.z ?? 0) - (previous.z ?? 0))
  // Light filtering at rest; respond immediately to turns, raised arms and kicks.
  const alpha = Math.min(.92, .65 + movement * 5)
  return {
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha,
    z: current.z === undefined ? previous.z : previous.z === undefined ? current.z : previous.z + (current.z - previous.z) * alpha,
    visibility: current.visibility,
  }
}
