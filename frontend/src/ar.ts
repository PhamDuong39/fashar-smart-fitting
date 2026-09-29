import type { Landmarks, Product } from './types'

type Point = { x: number; y: number }
type Quad = [Point, Point, Point, Point]
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x * (1-t) + b.x*t, y: a.y * (1-t) + b.y*t })

function triangles(ctx: CanvasRenderingContext2D, image: HTMLImageElement, source: Quad, target: Quad) {
  function drawTri(si: number[], ti: number[]) {
    const [s0, s1, s2] = si.map(i => source[i]); const [d0, d1, d2] = ti.map(i => target[i])
    const det = (s0.x*(s1.y-s2.y) + s1.x*(s2.y-s0.y) + s2.x*(s0.y-s1.y))
    if (Math.abs(det) < 0.001) return
    const a = (d0.x*(s1.y-s2.y) + d1.x*(s2.y-s0.y) + d2.x*(s0.y-s1.y))/det
    const b = (d0.y*(s1.y-s2.y) + d1.y*(s2.y-s0.y) + d2.y*(s0.y-s1.y))/det
    const c = (d0.x*(s2.x-s1.x) + d1.x*(s0.x-s2.x) + d2.x*(s1.x-s0.x))/det
    const d = (d0.y*(s2.x-s1.x) + d1.y*(s0.x-s2.x) + d2.y*(s1.x-s0.x))/det
    const e = (d0.x*(s1.x*s2.y-s2.x*s1.y) + d1.x*(s2.x*s0.y-s0.x*s2.y) + d2.x*(s0.x*s1.y-s1.x*s0.y))/det
    const f = (d0.y*(s1.x*s2.y-s2.x*s1.y) + d1.y*(s2.x*s0.y-s0.x*s2.y) + d2.y*(s0.x*s1.y-s1.x*s0.y))/det
    ctx.save(); ctx.beginPath(); ctx.moveTo(d0.x,d0.y); ctx.lineTo(d1.x,d1.y); ctx.lineTo(d2.x,d2.y); ctx.closePath(); ctx.clip()
    ctx.transform(a,b,c,d,e,f); ctx.drawImage(image,0,0); ctx.restore()
  }
  drawTri([0,1,2],[0,1,2]); drawTri([0,2,3],[0,2,3])
}

export function drawGarments(ctx: CanvasRenderingContext2D, landmarks: Landmarks, products: Product[], selected: { top?: string; bottom?: string }, images: Map<string, HTMLImageElement>, width: number, height: number) {
  const p = (name: string): Point | null => {
    const l=landmarks[name]; return l && l.visibility > 0.45 ? {x:l.x*width,y:l.y*height}:null
  }
  const ls=p('left_shoulder'), rs=p('right_shoulder'), lh=p('left_hip'), rh=p('right_hip')
  const le=p('left_elbow'), re=p('right_elbow'), lw=p('left_wrist'), rw=p('right_wrist')
  const lk=p('left_knee'), rk=p('right_knee'), la=p('left_ankle'), ra=p('right_ankle')
  if (!ls || !rs || !lh || !rh) return
  const draw = (type: 'top'|'bottom', quads: Quad[], sourceQuads: Quad[]) => {
    const product=products.find(x=>x.id===selected[type]); const image=product && images.get(product.id)
    if (!image || !image.complete) return
    for(let i=0;i<quads.length;i++) triangles(ctx,image,sourceQuads[i],quads[i])
  }
  const sx = (x:number)=>x*512, sy=(y:number)=>y*768
  const src = (x1:number,y1:number,x2:number,y2:number):Quad => [{x:sx(x1),y:sy(y1)},{x:sx(x2),y:sy(y1)},{x:sx(x2),y:sy(y2)},{x:sx(x1),y:sy(y2)}]
  if (selected.top && le && re && lw && rw) {
    const sw=Math.hypot(ls.x-rs.x,ls.y-rs.y), pad=sw*0.09
    const leftOuter={x:ls.x-pad,y:ls.y-pad*0.25}, rightOuter={x:rs.x+pad,y:rs.y-pad*0.25}
    const hipLeft={x:lh.x-pad*0.25,y:lh.y}, hipRight={x:rh.x+pad*0.25,y:rh.y}
    const armWidth=pad*1.15
    const armQuad=(a:Point,b:Point):Quad=>[{x:a.x-armWidth,y:a.y-armWidth/2},{x:a.x+armWidth,y:a.y-armWidth/2},{x:b.x+armWidth*0.7,y:b.y},{x:b.x-armWidth*0.7,y:b.y}]
    draw('top', [
      [leftOuter,rightOuter,hipRight,hipLeft],
      armQuad(ls,mix(le,lw,0.40)),
      armQuad(rs,mix(re,rw,0.40)),
    ], [src(.22,.12,.78,.72),src(.02,.15,.21,.63),src(.79,.15,.98,.63)])
  }
  if (selected.bottom && lk && rk && la && ra) {
    const waistLeft=mix(ls,lh,.85),waistRight=mix(rs,rh,.85)
    const hipMid=midpoint(lh,rh),gap=Math.hypot(lh.x-rh.x,lh.y-rh.y)*.08
    draw('bottom', [
      [waistLeft,waistRight,rh,lh],
      [lh,{x:hipMid.x-gap,y:hipMid.y}, {x:la.x+gap*1.2,y:la.y}, {x:la.x-gap*1.2,y:la.y}],
      [{x:hipMid.x+gap,y:hipMid.y},rh,{x:ra.x+gap*1.2,y:ra.y},{x:ra.x-gap*1.2,y:ra.y}],
    ], [src(.22,.06,.78,.24),src(.18,.24,.48,.96),src(.52,.24,.82,.96)])
  }
}
