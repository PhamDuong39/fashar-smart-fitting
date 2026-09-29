import * as THREE from 'three'
import type { Landmarks, Measurements, Product, Recommendation } from './types'

const UP = new THREE.Vector3(0, 1, 0)
const halfCylinderFront = new THREE.CylinderGeometry(1, .9, 1, 20, 1, true, -Math.PI / 2, Math.PI)
const halfCylinderBack = new THREE.CylinderGeometry(1, .9, 1, 20, 1, true, Math.PI / 2, Math.PI)
const segmentGeometry = new THREE.CylinderGeometry(1, .84, 1, 12)
const jointGeometry = new THREE.SphereGeometry(1, 12, 8)
const detailGeometry = new THREE.BoxGeometry(1, 1, 1)
const hoodGeometry = new THREE.TorusGeometry(1, .22, 10, 24)
const cuffGeometry = new THREE.TorusGeometry(1, .14, 8, 20)

/** Continuous neck -> sloping shoulder -> chest -> hem, with an open neckline. */
export function shirtGeometry(back = false) {
  const vertices: number[] = [], indices: number[] = []
  const rings = [[.32, .64, .58], [1, .53, .88], [1, .34, 1], [.9, -.5, .95]]
  const count = 24
  for (const [rx, y, rz] of rings) for (let i = 0; i <= count; i++) {
    const angle = (back ? Math.PI / 2 : -Math.PI / 2) + i / count * Math.PI
    // A shallow front neckline leaves the neck visible without cutting away shoulders.
    const neckline = rx === .32 && !back ? .035 * Math.cos(angle) : 0
    vertices.push(Math.sin(angle) * rx, y - neckline, Math.cos(angle) * rz)
  }
  for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < count; i++) {
    const a = row * (count + 1) + i, b = a + count + 1
    indices.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
const shirtFrontGeometry = shirtGeometry(), shirtBackGeometry = shirtGeometry(true)

type Joint = THREE.Vector3 | null
export type BodyRig = {
  shoulder: THREE.Vector3
  hip: THREE.Vector3
  waist: THREE.Vector3
  leftShoulder: THREE.Vector3
  rightShoulder: THREE.Vector3
  leftHip: THREE.Vector3
  rightHip: THREE.Vector3
  leftElbow: Joint
  rightElbow: Joint
  leftWrist: Joint
  rightWrist: Joint
  leftKnee: Joint
  rightKnee: Joint
  leftAnkle: Joint
  rightAnkle: Joint
  pxPerCm: number
  yaw: number
}

const middle = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(.5)
const average = (values: [number, number] | undefined) => values ? (values[0] + values[1]) / 2 : 0
const high = (values: [number, number] | undefined) => values?.[1] || 0
const clamp = (value: number, low: number, highValue: number) => Math.max(low, Math.min(highValue, value))

/** Map pose landmarks into a camera-facing 3D coordinate system with pixel-sized units. */
export function calculateBodyRig(points: Landmarks, measurements: Measurements, width: number, height: number, frontDirection: number): BodyRig | null {
  const joint = (name: string): Joint => {
    const p = points[name]
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.visibility < .12 || p.x < -.1 || p.x > 1.1 || p.y < -.1 || p.y > 1.1) return null
    const z = Number.isFinite(p.z) ? clamp(-(p.z || 0) * width * .55, -width * .45, width * .45) : 0
    return new THREE.Vector3(p.x * width - width / 2, height / 2 - p.y * height, z)
  }
  const leftShoulder = joint('left_shoulder'), rightShoulder = joint('right_shoulder')
  const leftHip = joint('left_hip'), rightHip = joint('right_hip')
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null
  const shoulder = middle(leftShoulder, rightShoulder), hip = middle(leftHip, rightHip)
  const leftAnkle = joint('left_ankle'), rightAnkle = joint('right_ankle')
  const ankle = leftAnkle && rightAnkle ? middle(leftAnkle, rightAnkle) : leftAnkle || rightAnkle
  const heightCm = measurements.height?.cm || 179
  const torsoCm = measurements.torso_length?.cm || 52
  const shoulderToAnkle = ankle ? shoulder.y - ankle.y : 0
  const pxPerCm = shoulderToAnkle > 50 ? shoulderToAnkle / (heightCm * .75) : shoulder.distanceTo(hip) / torsoCm
  if (!Number.isFinite(pxPerCm) || pxPerCm <= 0) return null
  const direction = frontDirection || 1
  const shoulderAxis = leftShoulder.clone().sub(rightShoulder).multiplyScalar(direction)
  const yaw = Math.atan2(-shoulderAxis.z, shoulderAxis.x)
  const waist = shoulder.clone().lerp(hip, .67)
  return {
    shoulder, hip, waist, leftShoulder, rightShoulder, leftHip, rightHip,
    leftElbow: joint('left_elbow'), rightElbow: joint('right_elbow'),
    leftWrist: joint('left_wrist'), rightWrist: joint('right_wrist'),
    leftKnee: joint('left_knee'), rightKnee: joint('right_knee'),
    leftAnkle, rightAnkle, pxPerCm, yaw,
  }
}

export function garmentDimensions(product: Product, size: string, pxPerCm: number) {
  const chart = product.size_chart[size] || product.size_chart.M
  if (!chart) return null
  const fit = ({ slim: .95, tapered: .98, regular: 1, straight: 1, relaxed: 1.06, wide: 1.13, oversized: 1.16 } as Record<string, number>)[product.fit] || 1
  if (product.type === 'top') {
    return {
      width: (high(chart.shoulder) + 1) * pxPerCm * fit,
      length: high(chart.torso_length) * pxPerCm * (product.fit === 'oversized' ? 1.05 : 1),
      depth: (high(chart.chest) + 6) / 5.5 * pxPerCm,
      limbRadius: (high(chart.chest) + 6) / 20 * pxPerCm * fit,
    }
  }
  return {
    width: (high(chart.hip) + 4) / 2.5 * pxPerCm * fit,
    length: (average(chart.outer_leg) + 2) * pxPerCm,
    depth: (high(chart.hip) + 4) / 5.3 * pxPerCm,
    limbRadius: (high(chart.thigh) + 4) / (Math.PI * 2) * pxPerCm * fit,
  }
}

function material(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: .06, side: THREE.DoubleSide })
}

function shell(geometry: THREE.BufferGeometry, surface: THREE.MeshStandardMaterial) {
  return new THREE.Mesh(geometry, surface)
}

function segment(surface: THREE.MeshStandardMaterial) {
  return new THREE.Mesh(segmentGeometry, surface)
}

function placeSegment(mesh: THREE.Mesh, from: Joint, to: Joint, radius: number) {
  if (!from || !to || from.distanceTo(to) < 5) { mesh.visible = false; return }
  mesh.visible = true
  mesh.position.copy(middle(from, to))
  mesh.quaternion.setFromUnitVectors(UP, from.clone().sub(to).normalize())
  mesh.scale.set(radius, from.distanceTo(to), radius * .82)
}

export class ThreeGarmentOverlay {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 3000)
  private topFrontMaterial = material('#dce9e8')
  private topBackMaterial = material('#708f8b')
  private pantsFrontMaterial = material('#98abc2')
  private pantsBackMaterial = material('#60748c')
  private topAccentMaterial = material('#2dd4bf')
  private pantsAccentMaterial = material('#60748c')
  private topFront = shell(shirtFrontGeometry, this.topFrontMaterial)
  private topBack = shell(shirtBackGeometry, this.topBackMaterial)
  private shoulders = Array.from({ length: 2 }, () => new THREE.Mesh(jointGeometry, this.topFrontMaterial))
  private pantsFront = shell(halfCylinderFront, this.pantsFrontMaterial)
  private pantsBack = shell(halfCylinderBack, this.pantsBackMaterial)
  private sleeves = Array.from({ length: 4 }, () => segment(this.topFrontMaterial))
  private legs = Array.from({ length: 4 }, () => segment(this.pantsFrontMaterial))
  private elbows = Array.from({ length: 2 }, () => new THREE.Mesh(jointGeometry, this.topFrontMaterial))
  private knees = Array.from({ length: 2 }, () => new THREE.Mesh(jointGeometry, this.pantsFrontMaterial))
  private topSeam = new THREE.Mesh(detailGeometry, this.topAccentMaterial)
  private hood = new THREE.Mesh(hoodGeometry, this.topBackMaterial)
  private cargoPockets = Array.from({ length: 2 }, () => new THREE.Mesh(detailGeometry, this.pantsAccentMaterial))
  private cuffs = Array.from({ length: 2 }, () => new THREE.Mesh(cuffGeometry, this.pantsBackMaterial))
  private width = 0
  private height = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0, 0)
    this.camera.position.z = 1000
    this.camera.lookAt(0, 0, 0)
    this.scene.add(new THREE.AmbientLight('#ffffff', 1.35))
    const frontLight = new THREE.DirectionalLight('#ffffff', 2)
    frontLight.position.set(-250, 350, 600)
    const backLight = new THREE.DirectionalLight('#ffffff', 1.3)
    backLight.position.set(250, 180, -500)
    this.scene.add(frontLight, backLight, this.topFront, this.topBack, this.pantsFront, this.pantsBack, ...this.shoulders, ...this.sleeves, ...this.legs, ...this.elbows, ...this.knees, this.topSeam, this.hood, ...this.cargoPockets, ...this.cuffs)
  }

  private resize(width: number, height: number) {
    if (this.width === width && this.height === height) return
    this.width = width; this.height = height
    this.camera.left = -width / 2; this.camera.right = width / 2
    this.camera.top = height / 2; this.camera.bottom = -height / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private hideAll() {
    for (const mesh of [this.topFront, this.topBack, this.pantsFront, this.pantsBack, ...this.shoulders, ...this.sleeves, ...this.legs, ...this.elbows, ...this.knees, this.topSeam, this.hood, ...this.cargoPockets, ...this.cuffs]) mesh.visible = false
  }

  render(points: Landmarks, measurements: Measurements, products: Product[], selected: { top?: string; bottom?: string }, sizes: Record<string, string>, recommendations: Recommendation[], width: number, height: number, frontDirection: number) {
    this.resize(width, height)
    this.hideAll()
    const rig = calculateBodyRig(points, measurements, width, height, frontDirection)
    if (!rig) { this.renderer.render(this.scene, this.camera); return }
    const selectedProduct = (type: 'top' | 'bottom') => products.find(item => item.id === selected[type])
    const actualSize = (product: Product) => sizes[product.id] || recommendations.find(item => item.product_id === product.id)?.size || 'M'
    const top = selectedProduct('top')
    if (top) {
      const d = garmentDimensions(top, actualSize(top), rig.pxPerCm)
      if (d) {
        this.topFrontMaterial.color.set(top.color)
        this.topBackMaterial.color.set(top.accent)
        this.topAccentMaterial.color.set(top.accent)
        const center = rig.shoulder.clone().add(new THREE.Vector3(0, -d.length / 2, 0))
        for (const mesh of [this.topFront, this.topBack]) {
          mesh.visible = true; mesh.position.copy(center); mesh.rotation.set(0, rig.yaw, 0)
          mesh.scale.set(d.width / 2, d.length, d.depth / 2)
        }
        const vest = top.id === 'top-06', tee = top.id === 'top-02'
        if (!vest) {
          // Cover the deltoid and overlap both the torso and articulated sleeve.
          for (const [index, shoulder] of [rig.leftShoulder, rig.rightShoulder].entries()) {
            const cap = this.shoulders[index]
            cap.visible = true; cap.position.copy(shoulder)
            cap.scale.set(d.limbRadius * 1.08, d.limbRadius, d.limbRadius * .86)
          }
          const leftEnd = tee && rig.leftElbow ? rig.leftShoulder.clone().lerp(rig.leftElbow, .45) : rig.leftElbow
          const rightEnd = tee && rig.rightElbow ? rig.rightShoulder.clone().lerp(rig.rightElbow, .45) : rig.rightElbow
          placeSegment(this.sleeves[0], rig.leftShoulder, leftEnd, d.limbRadius)
          placeSegment(this.sleeves[2], rig.rightShoulder, rightEnd, d.limbRadius)
          if (!tee) {
            placeSegment(this.sleeves[1], rig.leftElbow, rig.leftWrist, d.limbRadius * .82)
            placeSegment(this.sleeves[3], rig.rightElbow, rig.rightWrist, d.limbRadius * .82)
            for (const [index, elbow] of [rig.leftElbow, rig.rightElbow].entries()) {
              if (!elbow) continue
              this.elbows[index].visible = true; this.elbows[index].position.copy(elbow); this.elbows[index].scale.setScalar(d.limbRadius * .85)
            }
          }
        }
        if (top.id === 'top-03') {
          this.hood.visible = true
          this.hood.position.copy(rig.shoulder).add(new THREE.Vector3(0, d.width * .08, -d.depth * .22))
          this.hood.rotation.y = rig.yaw
          this.hood.scale.set(d.width * .28, d.width * .27, d.depth * .38)
        }
        if (top.id === 'top-01' || top.id === 'top-04' || vest) {
          this.topSeam.visible = true
          this.topSeam.position.copy(center).add(new THREE.Vector3(0, 0, d.depth / 2 + 2).applyAxisAngle(UP, rig.yaw))
          this.topSeam.rotation.y = rig.yaw
          this.topSeam.scale.set(d.width * .018, d.length * .72, 3)
        }
      }
    }
    const pants = selectedProduct('bottom')
    if (pants) {
      const d = garmentDimensions(pants, actualSize(pants), rig.pxPerCm)
      if (d) {
        this.pantsFrontMaterial.color.set(pants.color)
        this.pantsBackMaterial.color.set(pants.accent)
        this.pantsAccentMaterial.color.set(pants.accent)
        const pelvisLength = Math.max(20, rig.waist.y - rig.hip.y + d.limbRadius * .45)
        const center = rig.waist.clone().add(new THREE.Vector3(0, -pelvisLength / 2, 0))
        for (const mesh of [this.pantsFront, this.pantsBack]) {
          mesh.visible = true; mesh.position.copy(center); mesh.rotation.set(0, rig.yaw, 0)
          mesh.scale.set(d.width / 2, pelvisLength, d.depth / 2)
        }
        const ankleCenter = rig.leftAnkle && rig.rightAnkle ? middle(rig.leftAnkle, rig.rightAnkle) : rig.leftAnkle || rig.rightAnkle
        const desiredHem = d.length - (ankleCenter ? rig.waist.y - ankleCenter.y : d.length)
        const hemOffset = clamp(desiredHem, -30, 20)
        const hem = (knee: Joint, ankle: Joint) => knee && ankle ? ankle.clone().add(ankle.clone().sub(knee).normalize().multiplyScalar(hemOffset)) : ankle
        const lowerRadius = d.limbRadius * (pants.fit === 'wide' ? .98 : pants.fit === 'tapered' ? .62 : pants.fit === 'slim' ? .72 : .78)
        placeSegment(this.legs[0], rig.leftHip, rig.leftKnee, d.limbRadius)
        placeSegment(this.legs[1], rig.leftKnee, hem(rig.leftKnee, rig.leftAnkle), lowerRadius)
        placeSegment(this.legs[2], rig.rightHip, rig.rightKnee, d.limbRadius)
        placeSegment(this.legs[3], rig.rightKnee, hem(rig.rightKnee, rig.rightAnkle), lowerRadius)
        for (const [index, knee] of [rig.leftKnee, rig.rightKnee].entries()) {
          if (!knee) continue
          this.knees[index].visible = true; this.knees[index].position.copy(knee); this.knees[index].scale.setScalar(d.limbRadius * .84)
        }
        if (pants.id === 'bottom-02') for (const [index, side] of [-1, 1].entries()) {
          const pocket = this.cargoPockets[index]
          pocket.visible = true
          pocket.position.copy(center).add(new THREE.Vector3(side * d.width * .22, -pelvisLength * .3, d.depth * .48 + 2).applyAxisAngle(UP, rig.yaw))
          pocket.rotation.y = rig.yaw
          pocket.scale.set(d.width * .18, pelvisLength * .38, 7)
        }
        if (pants.id === 'bottom-06') for (const [index, ankle] of [rig.leftAnkle, rig.rightAnkle].entries()) {
          if (!ankle) continue
          const cuff = this.cuffs[index]
          cuff.visible = true; cuff.position.copy(ankle); cuff.rotation.x = Math.PI / 2
          cuff.scale.set(lowerRadius, lowerRadius, lowerRadius * .22)
        }
      }
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.renderer.dispose()
    this.topFrontMaterial.dispose(); this.topBackMaterial.dispose()
    this.pantsFrontMaterial.dispose(); this.pantsBackMaterial.dispose()
    this.topAccentMaterial.dispose(); this.pantsAccentMaterial.dispose()
  }
}
