import type { Landmark, Landmarks } from './types'

export const DEFAULT_HOLD_SECONDS = 3
export type ScanStep = 'front' | 'side'
export type HoldAnchor = { x: number; y: number; bodyHeight: number; ratio: number; startedAt: number; lastObservedAt: number }

export function scanPose(points: Landmarks, step: ScanStep, frontShoulderRatio: number, videoWidth: number, videoHeight: number) {
  const visible = (name: string, minimum = step === 'side' ? .35 : .45) => {
    const p = points[name]
    return p && p.visibility > minimum && p.x > .02 && p.x < .98 && p.y > .02 && p.y < .98 ? p : null
  }
  const nose = visible('nose', step === 'side' ? .25 : .45), ls = visible('left_shoulder'), rs = visible('right_shoulder')
  const le = visible('left_elbow'), re = visible('right_elbow'), lw = visible('left_wrist'), rw = visible('right_wrist')
  const lh = visible('left_hip'), rh = visible('right_hip')
  const lk = visible('left_knee'), rk = visible('right_knee')
  const la = visible('left_ankle'), ra = visible('right_ankle'), lf = visible('left_foot'), rf = visible('right_foot')
  const footY = Math.max(la?.y || 0, ra?.y || 0)
  if (!nose || (!la && !ra) || (step === 'front' && (!lf && !rf)) || footY - nose.y < .45) return { ready: false, hint: step === 'side' ? 'Lùi lại để thấy rõ đầu và ít nhất một mắt cá chân.' : 'Lùi lại để thấy rõ đầu và cả bàn chân.', ratio: 0, anchor: null }
  if (step === 'front' && (!ls || !rs || !le || !re || !lw || !rw || !lh || !rh || !lk || !la || !ra || !lf || !rf)) return { ready: false, hint: 'Đứng chính diện, tách nhẹ hai tay và hiện rõ cả chân.', ratio: 0, anchor: null }
  if (step === 'side' && ((!ls && !rs) || (!lh && !rh) || (!lh || !lk) && (!rh || !rk))) return { ready: false, hint: 'Xoay nghiêng và để rõ thân cùng một chân.', ratio: 0, anchor: null }
  const shoulderWidth = ls && rs ? Math.hypot((ls.x - rs.x) * videoWidth, (ls.y - rs.y) * videoHeight) : 0
  const bodyHeight = (footY - nose.y) * videoHeight
  const ratio = shoulderWidth / bodyHeight
  if (step === 'front' && ratio < .14) return { ready: false, hint: 'Hãy đứng chính diện và quay mặt về camera.', ratio, anchor: null }
  if (step === 'side' && frontShoulderRatio > 0) {
    const narrow = !!(ls && rs && ratio < frontShoulderRatio * .9)
    const occluded = !!((ls && !rs) || (rs && !ls) || (lh && !rh) || (rh && !lh))
    if (!narrow && !occluded) return { ready: false, hint: 'Hãy xoay nghiêng khoảng 90° so với góc chụp đầu tiên.', ratio, anchor: null }
  }
  const hips = [lh, rh].filter((p): p is Landmark => !!p)
  const anchor = {
    x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
    y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
    bodyHeight,
  }
  return { ready: true, hint: 'Đã nhận diện 1 người toàn thân. Đứng yên để tự chụp.', ratio, anchor }
}

export function advanceHold(previous: HoldAnchor | null, anchor: { x: number; y: number; bodyHeight: number }, ratio: number, videoWidth: number, videoHeight: number, now: number, holdSeconds = DEFAULT_HOLD_SECONDS, step: ScanStep = 'front') {
  const drift = previous ? Math.hypot((anchor.x - previous.x) * videoWidth, (anchor.y - previous.y) * videoHeight) / anchor.bodyHeight : 0
  const moved = !previous || now - previous.lastObservedAt > 1000 || drift > (step === 'side' ? .05 : .035) || Math.abs(anchor.bodyHeight - previous.bodyHeight) / anchor.bodyHeight > (step === 'side' ? .08 : .05) || (step === 'front' && previous.ratio > 0 && ratio > 0 && Math.abs(ratio - previous.ratio) / previous.ratio > .2)
  const hold: HoldAnchor = moved ? { ...anchor, ratio, startedAt: now, lastObservedAt: now } : { ...previous, lastObservedAt: now }
  const remaining = Math.max(0, Math.ceil((holdSeconds * 1000 - (now - hold.startedAt)) / 1000))
  return { hold, remaining, shouldCapture: !moved && remaining === 0 }
}
