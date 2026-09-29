import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Aperture, ArrowRight, Camera, CameraOff, Check, ChevronDown, CircleHelp, Download, Expand, Layers3, Play, RefreshCw, ScanLine, Settings2, ShoppingBag, Sparkles, Video, X } from 'lucide-react'
import { drawGarments } from './ar'
import { ThreeGarmentOverlay } from './ar3d'
import { TrackingPacer, smoothLandmark } from './tracking'
import { advanceHold, scanPose } from './scan'
import type { HoldAnchor, ScanStep } from './scan'
import './scan.css'
import type { Landmark, Landmarks, MeasurementKey, Measurements, Product, Recommendation } from './types'

const LABELS: Record<MeasurementKey,string> = {height:'Chiều cao',shoulder:'Ngang vai',chest:'Vòng ngực',waist:'Vòng eo',hip:'Vòng hông',hip_width:'Ngang hông',arm_length:'Dài tay',torso_length:'Dài thân',outer_leg:'Dài chân ngoài',thigh:'Vòng đùi'}
const MEASUREMENT_KEYS = Object.keys(LABELS) as MeasurementKey[]
const API='/api'
type AppConfig = {height_cm:number; measurements_cm:Record<string,number>; capture_seconds:number; camera:{orientation:'portrait'|'landscape'; width:number; height:number}}
const DEFAULT_CONFIG:AppConfig = {height_cm:179,measurements_cm:{},capture_seconds:3,camera:{orientation:'portrait',width:720,height:1080}}
const PREVIEW = new URLSearchParams(window.location.search).get('preview') === '1'
const PREVIEW_MEASUREMENTS: Measurements = Object.fromEntries(Object.entries({height:179,shoulder:42,chest:92,waist:76,hip:96,hip_width:37,arm_length:56,torso_length:52,outer_leg:96,thigh:55}).map(([key,cm])=>[key,{cm,source:'estimated'}]))
const PREVIEW_LANDMARKS: Landmarks = Object.fromEntries(Object.entries({
  nose:[320,100],left_shoulder:[220,200],right_shoulder:[420,200],left_elbow:[174,338],right_elbow:[466,338],left_wrist:[145,470],right_wrist:[495,470],
  left_hip:[260,455],right_hip:[380,455],left_knee:[270,620],right_knee:[370,620],left_ankle:[275,755],right_ankle:[365,755],
}).map(([key,[x,y]])=>[key,{x:x/640,y:y/800,visibility:1}]))
type DemoPose = 'front'|'side'|'back'|'kick'
const DEMO_POSE_LABELS: Record<DemoPose,string> = {front:'Chính diện',side:'Nghiêng',back:'Quay lưng',kick:'Đá chân'}
const initialDemoPose = (['front','side','back','kick'].includes(new URLSearchParams(window.location.search).get('pose')||'') ? new URLSearchParams(window.location.search).get('pose') : 'front') as DemoPose
function previewLandmarks(pose:DemoPose):Landmarks {
  const points:Landmarks=Object.fromEntries(Object.entries(PREVIEW_LANDMARKS).map(([name,p])=>[name,{...p,z:0}]))
  const move=(name:string,x:number,y:number,z=0)=>{points[name]={x:x/640,y:y/800,z,visibility:1}}
  if(pose==='back')for(const point of Object.values(points))point.x=1-point.x
  if(pose==='side'){
    move('nose',330,100,-.12)
    move('left_shoulder',312,200,-.32);move('right_shoulder',328,200,.32)
    move('left_hip',315,455,-.2);move('right_hip',325,455,.2)
    move('left_elbow',295,340,-.32);move('right_elbow',345,340,.32)
    move('left_wrist',290,470,-.32);move('right_wrist',350,470,.32)
    move('left_knee',315,620,-.16);move('right_knee',325,620,.16)
    move('left_ankle',315,755,-.16);move('right_ankle',325,755,.16)
  }
  if(pose==='kick'){
    move('left_knee',400,570,-.22);move('left_ankle',485,550,-.42)
  }
  return points
}
type Status = 'idle'|'connecting'|'tracked'|'partial'|'no_person'|'multiple_people'|'error'
type Step = 'camera'|'front'|'side'|'review'|'tryon'

function imgData(video: HTMLVideoElement, canvas: HTMLCanvasElement, maxWidth: number, quality: number) {
  const w=Math.min(maxWidth,video.videoWidth); const h=Math.round(w*video.videoHeight/video.videoWidth)
  canvas.width=w; canvas.height=h
  canvas.getContext('2d')!.drawImage(video,0,0,w,h)
  return canvas.toDataURL('image/jpeg',quality)
}

function statusText(status: Status) {
  return ({idle:'Chưa kết nối',connecting:'Đang kết nối',tracked:'Đã nhận diện người',partial:'Đang căn tư thế',no_person:'Chưa thấy người',multiple_people:'Chỉ để một người trong khung',error:'Lỗi tracking'})[status]
}

function ProductArt({product}:{product:Product}) {
  return <div className="product-art" style={{'--art':product.color,'--art-accent':product.accent} as React.CSSProperties}>
    <span className="art-glow" />
    <img src={product.asset} alt="" loading="lazy" />
  </div>
}

export default function App() {
  const videoRef=useRef<HTMLVideoElement>(null), overlayRef=useRef<HTMLCanvasElement>(null), threeCanvasRef=useRef<HTMLCanvasElement>(null), frameCanvas=useRef<HTMLCanvasElement>(null)
  const threeRef=useRef<ThreeGarmentOverlay|null>(null),frontDirectionRef=useRef(PREVIEW?-1:1),lastThreeRenderRef=useRef(0)
  const streamRef=useRef<MediaStream|null>(null), socketRef=useRef<WebSocket|null>(null), lastRequest=useRef(0), pending=useRef(false)
  const pacer=useRef(new TrackingPacer()),fpsUpdatedAt=useRef(0)
  const [trackingFps,setTrackingFps]=useState(0)
  const landmarkRef=useRef<Landmarks>({}), imagesRef=useRef(new Map<string,HTMLImageElement>()), animationRef=useRef(0)
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState(''),[status,setStatus]=useState<Status>('idle')
  const [step,setStep]=useState<Step>(PREVIEW?'tryon':'camera'),[error,setError]=useState(''),[front,setFront]=useState<string[]>([]),[side,setSide]=useState<string[]>([])
  const [heightCm,setHeightCm]=useState(179),[measurements,setMeasurements]=useState<Measurements>(PREVIEW?PREVIEW_MEASUREMENTS:{}),[products,setProducts]=useState<Product[]>([])
  const [demoPose,setDemoPose]=useState<DemoPose>(initialDemoPose),previewPoseRef=useRef<Landmarks>(previewLandmarks(initialDemoPose))
  const [config,setConfig]=useState<AppConfig>(DEFAULT_CONFIG)
  const [recommendations,setRecommendations]=useState<Recommendation[]>([]),[shapeLabels,setShapeLabels]=useState<string[]>([])
  const [audience,setAudience]=useState<'all'|'men'|'women'|'unisex'>('all'),[filter,setFilter]=useState<'all'|'top'|'bottom'>('all')
  const [selected,setSelected]=useState<{top?:string;bottom?:string}>(PREVIEW?{top:'top-01',bottom:'bottom-01'}:{}),[selectedSizes,setSelectedSizes]=useState<Record<string,string>>({})
  const [measuring,setMeasuring]=useState(false),[capturing,setCapturing]=useState(false),[debug,setDebug]=useState(false),[videoReady,setVideoReady]=useState(false)
  const [holdRemaining,setHoldRemaining]=useState<number|null>(null),[scanHint,setScanHint]=useState('Bật camera để bắt đầu quét tự động.')

  const selectedRef=useRef(selected),productsRef=useRef(products),debugRef=useRef(debug)
  const measurementsRef=useRef(measurements),selectedSizesRef=useRef(selectedSizes),recommendationsRef=useRef(recommendations)
  const stepRef=useRef(step),holdRef=useRef<HoldAnchor|null>(null),frontRatioRef=useRef(0),captureBusyRef=useRef(false),heightEditedRef=useRef(false)
  useEffect(()=>{selectedRef.current=selected},[selected]);useEffect(()=>{productsRef.current=products},[products]);useEffect(()=>{debugRef.current=debug},[debug])
  useEffect(()=>{measurementsRef.current=measurements},[measurements]);useEffect(()=>{selectedSizesRef.current=selectedSizes},[selectedSizes]);useEffect(()=>{recommendationsRef.current=recommendations},[recommendations])
  useEffect(()=>{stepRef.current=step},[step])
  useEffect(()=>{previewPoseRef.current=previewLandmarks(demoPose)},[demoPose])

  const refreshDevices=useCallback(async()=>{
    if(!navigator.mediaDevices?.enumerateDevices) return
    const all=await navigator.mediaDevices.enumerateDevices()
    setDevices(all.filter(x=>x.kind==='videoinput'))
  },[])

  const stopCamera=useCallback(()=>{
    socketRef.current?.close(); socketRef.current=null
    streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null
    if(videoRef.current)videoRef.current.srcObject=null
    setStatus('idle');setVideoReady(false);landmarkRef.current={};pending.current=false
    pacer.current.reset();setTrackingFps(0);lastRequest.current=0
    holdRef.current=null;frontRatioRef.current=0;frontDirectionRef.current=PREVIEW?-1:1;captureBusyRef.current=false;setHoldRemaining(null)
  },[])

  const captureFrames=useCallback(async(stage:ScanStep,ratio:number)=>{
    if(captureBusyRef.current||!videoRef.current||!frameCanvas.current)return
    captureBusyRef.current=true;setCapturing(true);setHoldRemaining(0)
    setScanHint('Đã đứng yên đủ thời gian. Đang lưu ảnh...')
    const stream=streamRef.current,frames:string[]=[]
    for(let i=0;i<3;i++){
      if(!videoRef.current||!frameCanvas.current||streamRef.current!==stream)break
      frames.push(imgData(videoRef.current,frameCanvas.current,1280,.86))
      if(i<2)await new Promise(resolve=>setTimeout(resolve,180))
    }
    captureBusyRef.current=false;setCapturing(false);holdRef.current=null;setHoldRemaining(null)
    if(streamRef.current!==stream)return
    if(frames.length<3){setError('Camera bị ngắt khi tự chụp. Hãy thử lại.');return}
    setError('')
    if(stage==='front'){
      const ls=landmarkRef.current.left_shoulder,rs=landmarkRef.current.right_shoulder
      if(ls&&rs)frontDirectionRef.current=Math.sign(ls.x-rs.x)||1
      frontRatioRef.current=ratio;setFront(frames);stepRef.current='side';setStep('side')
      setScanHint('Đã lưu chính diện. Hãy xoay nghiêng 90° rồi đứng yên.')
    }else{
      setSide(frames);stepRef.current='review';setStep('review')
      setScanHint('Đã lưu góc nghiêng. Đang tính số đo...')
    }
  },[])

  const startCamera=useCallback(async(id?:string)=>{
    if(PREVIEW){window.location.href='/';return}
    stopCamera();setError('');setStatus('connecting');setFront([]);setSide([]);setMeasurements({});setSelected({});setSelectedSizes({});setRecommendations([]);setShapeLabels([]);setScanHint('Đang kết nối nhận diện người...')
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera chỉ hoạt động trên localhost hoặc HTTPS.')
      const configResponse=await fetch(`${API}/config`)
      const currentConfig=await configResponse.json() as AppConfig & {detail?:string}
      if(!configResponse.ok)throw new Error(currentConfig.detail||'Không tải được cấu hình backend.')
      setConfig(currentConfig)
      if(!heightEditedRef.current)setHeightCm(currentConfig.height_cm)
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:id?{exact:id}:undefined,width:{ideal:currentConfig.camera.width},height:{ideal:currentConfig.camera.height},aspectRatio:{ideal:currentConfig.camera.width/currentConfig.camera.height},frameRate:{ideal:30}}})
      streamRef.current=stream
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();setVideoReady(true);stepRef.current='front';setStep('front')}
      const actual=stream.getVideoTracks()[0].getSettings().deviceId
      if(actual)setDeviceId(actual)
      await refreshDevices()
      const scheme=location.protocol==='https:'?'wss':'ws'
      const ws=new WebSocket(`${scheme}://${location.host}${API}/tracking`)
      socketRef.current=ws
      ws.onmessage=(event)=>{
        if(socketRef.current!==ws)return
        pending.current=false
        const data=JSON.parse(event.data)
        if(data.status==='busy')return
        const receivedAt=performance.now()
        pacer.current.receive(lastRequest.current,receivedAt)
        if(receivedAt-fpsUpdatedAt.current>=1000){setTrackingFps(pacer.current.fps);fpsUpdatedAt.current=receivedAt}
        if(data.status==='error'){holdRef.current=null;setHoldRemaining(null);setError(data.message||'Không thể xử lý camera');setStatus('error');return}
        const currentStep=stepRef.current
        if(data.landmarks){
          const old=landmarkRef.current;const smooth:Landmarks={}
          for(const [key,point] of Object.entries(data.landmarks as Landmarks)){
            const prev=old[key];const current=point as Landmark
            smooth[key]=smoothLandmark(prev,current)
          }
          landmarkRef.current=smooth
        }else landmarkRef.current={}
        if((currentStep==='front'||currentStep==='side')&&data.landmarks&&(data.status==='tracked'||data.status==='partial')){
          const video=videoRef.current
          if(!video?.videoWidth||!video.videoHeight)return
          const result=scanPose(landmarkRef.current,currentStep,frontRatioRef.current,video.videoWidth,video.videoHeight)
          setStatus(result.ready?'tracked':'partial')
          if(!result.ready||!result.anchor){
            if(currentStep==='side'&&holdRef.current&&performance.now()-holdRef.current.lastObservedAt<600){setScanHint(`${result.hint} Giữ nguyên tư thế.`);return}
            holdRef.current=null;setHoldRemaining(null);setScanHint(result.hint);return
          }
          if(captureBusyRef.current)return
          const progress=advanceHold(holdRef.current,result.anchor,result.ratio,video.videoWidth,video.videoHeight,performance.now(),currentConfig.capture_seconds,currentStep)
          setScanHint(result.hint)
          holdRef.current=progress.shouldCapture?null:progress.hold
          setHoldRemaining(progress.remaining)
          if(progress.shouldCapture)void captureFrames(currentStep,result.ratio)
        }else{
          setStatus(data.status);holdRef.current=null;setHoldRemaining(null)
          if(currentStep==='front'||currentStep==='side')setScanHint(statusText(data.status))
        }
      }
      ws.onerror=()=>{if(socketRef.current!==ws)return;pending.current=false;holdRef.current=null;setHoldRemaining(null);setStatus('error');setError('Không kết nối được backend. Hãy chạy API Python trên cổng 8000.')}
      ws.onclose=()=>{if(socketRef.current!==ws)return;pending.current=false;holdRef.current=null;setHoldRemaining(null)}
    }catch(e){stopCamera();setStatus('error');setError(e instanceof Error?e.message:String(e))}
  },[captureFrames,refreshDevices,stopCamera])

  useEffect(()=>{
    if(!PREVIEW)fetch(`${API}/config`).then(r=>{if(!r.ok)throw new Error('Config unavailable');return r.json()}).then((data:AppConfig)=>{setConfig(data);if(!heightEditedRef.current)setHeightCm(data.height_cm)}).catch(()=>{})
    fetch(PREVIEW?'/catalog.json':`${API}/catalog`).then(r=>{if(!r.ok)throw new Error('Catalog unavailable');return r.json()}).then(data=>setProducts(data.products)).catch(()=>{
      fetch('/catalog.json').then(r=>r.json()).then(data=>setProducts(data.products)).catch(()=>setError('Không tải được catalog.'))
    })
    navigator.mediaDevices?.addEventListener?.('devicechange',refreshDevices)
    return()=>{navigator.mediaDevices?.removeEventListener?.('devicechange',refreshDevices);stopCamera()}
  },[refreshDevices,stopCamera])

  useEffect(()=>{
    for(const product of products){const image=new Image();image.src=product.asset;imagesRef.current.set(product.id,image)}
  },[products])

  useEffect(()=>{
    const canvas=threeCanvasRef.current
    if(!canvas)return
    try{
      const overlay=new ThreeGarmentOverlay(canvas)
      threeRef.current=overlay
      return()=>{overlay.dispose();if(threeRef.current===overlay)threeRef.current=null}
    }catch{threeRef.current=null}
  },[])

  useEffect(()=>{
    const loop=()=>{
      const video=videoRef.current,canvas=overlayRef.current,frame=frameCanvas.current,socket=socketRef.current
      if(canvas && (PREVIEW || (video && frame && video.readyState>=2))){
        const w=PREVIEW?640:video!.videoWidth,h=PREVIEW?800:video!.videoHeight
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
        const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,w,h)
        const points=PREVIEW?previewPoseRef.current:landmarkRef.current
        const activeSelection=stepRef.current==='tryon'?selectedRef.current:{}
        if(threeRef.current&&performance.now()-lastThreeRenderRef.current>=33){
          try{threeRef.current.render(points,measurementsRef.current,productsRef.current,activeSelection,selectedSizesRef.current,recommendationsRef.current,w,h,frontDirectionRef.current);lastThreeRenderRef.current=performance.now()}
          catch{threeRef.current.dispose();threeRef.current=null}
        }
        if(!threeRef.current&&Object.keys(points).length){
          drawGarments(ctx,points,productsRef.current,activeSelection,imagesRef.current,w,h,measurementsRef.current,selectedSizesRef.current,recommendationsRef.current)
        }
        if(Object.keys(points).length){
          if(debugRef.current){ctx.fillStyle='#a8fff0';for(const point of Object.values(points)){if(point.visibility<.45)continue;ctx.beginPath();ctx.arc(point.x*w,point.y*h,5,0,Math.PI*2);ctx.fill()}}
        }
        const now=performance.now()
        if(!PREVIEW && video && frame && socket?.readyState===WebSocket.OPEN && !pending.current && now-lastRequest.current>=pacer.current.interval){
          lastRequest.current=now;pending.current=true
          const trackingWidth=Math.round(640*video.videoWidth/Math.max(video.videoWidth,video.videoHeight))
          socket.send(JSON.stringify({image:imgData(video,frame,trackingWidth,.68),timestamp:Date.now()}))
        }
      }
      animationRef.current=requestAnimationFrame(loop)
    }
    animationRef.current=requestAnimationFrame(loop)
    return()=>cancelAnimationFrame(animationRef.current)
  },[])

  const calculatingRef=useRef(false)
  const calculate=useCallback(async()=>{
    if(!front.length||!side.length||calculatingRef.current)return
    if(heightCm<120||heightCm>220){setError('Hãy nhập chiều cao từ 120 đến 220 cm.');return}
    calculatingRef.current=true
    setMeasuring(true);setError('')
    try{
      const response=await fetch(`${API}/measurements`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({front_images:front,side_images:side,height_cm:heightCm})})
      const data=await response.json();if(!response.ok)throw new Error(data.detail||'Không đo được cơ thể')
      setMeasurements(data.measurements);setStep('review')
      setScanHint('Đã tính số đo. Kiểm tra kết quả trước khi chọn đồ.')
    }catch(e){setError(e instanceof Error?e.message:String(e));setScanHint('Chưa đo được. Kiểm tra tư thế hoặc quét lại góc nghiêng.')}finally{calculatingRef.current=false;setMeasuring(false)}
  },[front,side,heightCm])

  useEffect(()=>{if(step==='review'&&front.length&&side.length&&!Object.keys(measurements).length)void calculate()},[step,front,side,calculate])

  const getRecommendations=useCallback(async(values:Measurements,group:string)=>{
    if(PREVIEW){
      setShapeLabels(['vai trội','dáng thẳng'])
      setRecommendations(products.filter(p=>group==='all'||p.audience==='unisex'||p.audience===group).map(p=>({product_id:p.id,size:'M',fit_status:'fits',score:p.tags.includes('vai trội')||p.tags.includes('dáng thẳng')?5:3,reasons:['Số đo mẫu nằm trong khoảng size M']})))
      return
    }
    const flat=Object.fromEntries(Object.entries(values).map(([key,item])=>[key,item.cm]))
    const response=await fetch(`${API}/recommendations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({measurements:flat,audience:group})})
    const data=await response.json();setRecommendations(data.recommendations);setShapeLabels(data.shape_labels)
  },[products])

  const confirmMeasurements=async()=>{
    try{await getRecommendations(measurements,audience);setStep('tryon');setError('')}catch{setError('Không lấy được gợi ý. Kiểm tra kết nối backend.')}
  }

  useEffect(()=>{if(step==='tryon')getRecommendations(measurements,audience).catch(()=>{})},[audience,step,getRecommendations])

  const changeMeasure=(key:MeasurementKey,value:string)=>{
    const cm=Number(value)
    setMeasurements(m=>({...m,[key]:{cm:Number.isFinite(cm)?cm:0,source:'manual'}}))
  }

  const recMap=useMemo(()=>new Map(recommendations.map(r=>[r.product_id,r])),[recommendations])
  const visibleProducts=useMemo(()=>products.filter(p=>(filter==='all'||p.type===filter)&&(audience==='all'||p.audience==='unisex'||p.audience===audience)).sort((a,b)=>(recMap.get(b.id)?.score||0)-(recMap.get(a.id)?.score||0)),[products,filter,audience,recMap])
  const choose=(product:Product)=>{if(step!=='tryon')return;setSelected(s=>({...s,[product.type]:s[product.type]===product.id?undefined:product.id}))}
  const rescanFront=()=>{holdRef.current=null;frontRatioRef.current=0;setHoldRemaining(null);setFront([]);setSide([]);setMeasurements({});setSelectedSizes({});stepRef.current='front';setStep('front');setScanHint('Đứng chính diện, giữ toàn thân trong khung.')}
  const rescanSide=()=>{holdRef.current=null;setHoldRemaining(null);setSide([]);setMeasurements({});stepRef.current='side';setStep('side');setScanHint(`Xoay nghiêng 90° rồi đứng yên ${config.capture_seconds} giây.`)}

  const download=()=>{
    const video=videoRef.current,overlay=overlayRef.current,three=threeCanvasRef.current;if(!overlay)return
    const canvas=document.createElement('canvas');canvas.width=PREVIEW?640:video?.videoWidth||0;canvas.height=PREVIEW?800:video?.videoHeight||0
    if(!canvas.width)return
    const ctx=canvas.getContext('2d')!
    if(PREVIEW){const avatar=document.querySelector<HTMLImageElement>('#preview-avatar');if(avatar){ctx.globalAlpha=demoPose==='front'?1:.18;ctx.drawImage(avatar,0,0,640,800);ctx.globalAlpha=1}ctx.translate(canvas.width,0);ctx.scale(-1,1);if(threeRef.current&&three)ctx.drawImage(three,0,0,canvas.width,canvas.height);ctx.drawImage(overlay,0,0)}
    else if(video){ctx.translate(canvas.width,0);ctx.scale(-1,1);ctx.drawImage(video,0,0);if(threeRef.current&&three)ctx.drawImage(three,0,0,canvas.width,canvas.height);ctx.drawImage(overlay,0,0)}
    const a=document.createElement('a');a.download=`fashar-${Date.now()}.png`;a.href=canvas.toDataURL('image/png');a.click()
  }

  const currentTop=products.find(p=>p.id===selected.top),currentBottom=products.find(p=>p.id===selected.bottom)

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><Aperture size={23} strokeWidth={2.3}/></div><div className="brand-word">FASHAR<span className="brand-dot">.</span><small>SMART FITTING STUDIO</small></div></div>
      <div className="topbar-center"><span className="topbar-line"/>VIRTUAL FITTING EXPERIENCE<span className="topbar-line"/></div>
      <div className="topbar-right"><span className="system-status"><span className="pulse-dot"/>{PREVIEW?'UI PREVIEW':status==='tracked'?'PERSON DETECTED':videoReady?'CAMERA ACTIVE':'STANDBY'}</span><button className="icon-button" title="Hiện điểm khớp" onClick={()=>setDebug(!debug)}><Settings2 size={19}/></button><div className="avatar">F</div></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <div className="eyebrow"><span className="eyebrow-line"/> CONTROL CENTER</div>
          <h1>Thử đồ thông minh<span>.</span></h1>
          <p className="intro">Quét cơ thể, tìm đúng size và xem trang phục chuyển động cùng bạn.</p>

          <div className="side-section">
            <div className="section-heading"><span>01</span><h2>Thiết lập camera</h2><Camera size={17}/></div>
            <div className="field-label">NGUỒN HÌNH ẢNH</div>
            <div className="select-wrap"><Video size={18}/><select value={deviceId} disabled={PREVIEW} onChange={e=>startCamera(e.target.value)}><option value="">{PREVIEW?'Dữ liệu minh họa':devices.length?'Chọn camera':'Camera mặc định'}</option>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select><ChevronDown size={15}/></div>
            <button className="outline-button full" onClick={()=>startCamera(deviceId||undefined)}><RefreshCw size={16}/>{PREVIEW?'Mở chế độ camera':videoReady?'Khởi động lại camera':'Bật camera'}</button>
            {!PREVIEW&&<p className="helper-text">Cấu hình camera: {config.camera.orientation==='portrait'?'dọc':'ngang'} · {config.camera.width} × {config.camera.height}. Độ phân giải thực tế hiện trên khung hình.</p>}
          </div>

          <div className="side-section">
            <div className="section-heading"><span>02</span><h2>Quét cơ thể</h2><ScanLine size={17}/></div>
            <div className="step-list">
              <div className={'step-item '+(PREVIEW||front.length?'done':step==='camera'||step==='front'?'active':'')}><span className="step-symbol">{PREVIEW||front.length?<Check size={14}/>:1}</span><div><strong>Góc chính diện</strong><small>{PREVIEW?'Đã nạp ảnh minh họa':step==='front'&&holdRemaining!==null?`Đứng yên · tự chụp sau ${holdRemaining} giây`:'Đứng thẳng, hiện rõ toàn thân'}</small></div></div>
              <div className={'step-item '+(PREVIEW||side.length?'done':step==='side'?'active':'')}><span className="step-symbol">{PREVIEW||side.length?<Check size={14}/>:2}</span><div><strong>Góc nghiêng 90°</strong><small>{PREVIEW?'Đã nạp ảnh minh họa':step==='side'&&holdRemaining!==null?`Đứng yên · tự chụp sau ${holdRemaining} giây`:'Xoay nghiêng, giữ nguyên vị trí'}</small></div></div>
              <div className={'step-item '+(Object.keys(measurements).length?'done':step==='review'?'active':'')}><span className="step-symbol">{Object.keys(measurements).length?<Check size={14}/>:3}</span><div><strong>Xác nhận số đo</strong><small>Kiểm tra và chỉnh nếu cần</small></div></div>
            </div>
            <div className="marker-field"><div><strong>Chiều cao đã biết</strong><small>Mốc tạm thay marker (cm)</small></div><input type="number" min="120" max="220" value={heightCm} onChange={e=>{heightEditedRef.current=true;setHeightCm(Number(e.target.value))}}/></div>
            <p className="helper-text">Đang dùng {heightCm||'--'} cm để quy đổi kích thước từ ảnh. Giữ camera cố định và đứng cùng vị trí ở hai góc. Các vòng đo chỉ là ước lượng.</p>
          </div>

          <div className="side-section measurements-section">
            <div className="section-heading"><span>03</span><h2>Số đo cơ thể</h2><Activity size={17}/></div>
            <div className="measurement-grid">{MEASUREMENT_KEYS.map(key=><label className="measurement-card" key={key}><small>{LABELS[key]}</small><div>{step==='review'&&measurements[key]?<input type="number" value={measurements[key]?.cm||''} onChange={e=>changeMeasure(key,e.target.value)} />:<strong>{measurements[key]?.cm??'--'}</strong>}<span>cm</span></div></label>)}</div>
            {shapeLabels.length>0&&<div className="shape-labels">{shapeLabels.map(x=><span key={x}>{x}</span>)}</div>}
            {step==='review'&&Object.keys(measurements).length>0&&<button className="primary-button full" onClick={confirmMeasurements}>Xác nhận và chọn đồ <ArrowRight size={17}/></button>}
            {Object.keys(measurements).length>0&&<p className="helper-text">{PREVIEW?'Dữ liệu mẫu để duyệt giao diện; chưa đo từ camera.':Object.keys(config.measurements_cm).length?'Số đo nhập tay trong config được ưu tiên; số đo còn lại ước lượng từ ảnh. Hãy đối chiếu thước dây trước khi mua.':'Chiều cao do bạn nhập; số đo còn lại ước lượng từ ảnh. Hãy đối chiếu thước dây trước khi mua.'}</p>}
          </div>
        </div>
        <div className="sidebar-footer"><CircleHelp size={16}/><span>FASHAR DEMO <b>·</b> LOCAL EXPERIENCE</span></div>
      </aside>

      <main className="stage-area">
        <div className="stage-header"><div><div className="eyebrow">{PREVIEW?'DESIGN PREVIEW / 01':'LIVE STUDIO / 01'}</div><h2>Phòng thử đồ ảo</h2></div><div className="stage-head-actions"><span className={'live-indicator '+(status==='tracked'||PREVIEW?'live':'')}><span/>{PREVIEW?'Dữ liệu minh họa':statusText(status)}</span><button className="icon-button" title="Tải ảnh thử đồ" onClick={download} disabled={!videoReady&&!PREVIEW}><Download size={19}/></button></div></div>
        <div className={'stage-frame '+(config.camera.orientation==='portrait'&&!PREVIEW?'portrait':'')}>
          <div className="stage-grid"/>
          <div className="stage-corner tl"/><div className="stage-corner tr"/><div className="stage-corner bl"/><div className="stage-corner br"/>
          <div className="frame-top"><span><span className="rec-dot"/> {PREVIEW?'PREVIEW MODE':'LIVE FEED'}</span><span>{PREVIEW?'ILLUSTRATIVE DATA':videoReady&&videoRef.current?.videoWidth?`${videoRef.current.videoWidth} × ${videoRef.current.videoHeight} · ${trackingFps} FPS AI`:'STANDBY · 15–20 FPS AI'}</span></div>
          <div className={'video-layer '+(PREVIEW?'preview-layer':'')} style={{display:videoReady||PREVIEW?'block':'none'}}>{PREVIEW&&<img id="preview-avatar" className="preview-avatar" src="/assets/preview-avatar.svg" alt="Hình người minh họa để duyệt giao diện" style={{opacity:demoPose==='front'?1:.18}}/>}<video ref={videoRef} autoPlay playsInline muted style={{display:PREVIEW?'none':undefined}}/><canvas ref={threeCanvasRef} className="three-layer"/><canvas ref={overlayRef}/></div>
          {!videoReady&&!PREVIEW&&<div className="stage-empty"><div className="empty-orbit"><div className="empty-inner"><Camera size={38} strokeWidth={1.4}/></div></div><div className="empty-line"/><span className="empty-kicker">YOUR FITTING SESSION STARTS HERE</span><h3>Sẵn sàng tìm <em>fit</em> của bạn?</h3><p>Bật camera để bắt đầu trải nghiệm thử đồ thông minh.</p><button className="primary-button" onClick={()=>startCamera()}><Play size={17} fill="currentColor"/> Bật camera ngay</button></div>}
          {(videoReady||PREVIEW)&&<div className={'scan-visual '+(status==='tracked'?'recognized':'')}><span className="scan-tl"/><span className="scan-tr"/><span className="scan-bl"/><span className="scan-br"/></div>}
          {videoReady&&!PREVIEW&&(step==='front'||step==='side')&&<div className={'recognition-badge '+(status==='tracked'?'recognized':'')}><span className="recognition-dot"/>{status==='tracked'?'ĐÃ NHẬN DIỆN 1 NGƯỜI TOÀN THÂN':statusText(status)}</div>}
          {videoReady&&!PREVIEW&&(step==='front'||step==='side')&&holdRemaining!==null&&<div className="scan-countdown"><strong>{capturing?<Camera size={30}/>:holdRemaining}</strong><span>{capturing?'Đang lưu ảnh':`Giữ yên · tự chụp ${step==='front'?'chính diện':'góc nghiêng'}`}</span></div>}
          {(videoReady||PREVIEW)&&<div className="stage-instruction"><ScanLine size={15}/>{PREVIEW?`AR 3D mô phỏng · ${DEMO_POSE_LABELS[demoPose]}`:step==='tryon'?'Xoay người, đưa tay hoặc đá chân để xem đồ 3D bám theo':scanHint}</div>}
          {(videoReady||PREVIEW)&&<div className="stage-bottom"><span><span className="signal-bars">▂▄▆</span> {PREVIEW?'PREVIEW RENDER':'POSE TRACKING'} <b>{PREVIEW?'SIMULATED':status==='tracked'?'ACTIVE':'WAITING'}</b></span><span>FASHAR V0.1</span></div>}
        </div>
        <canvas ref={frameCanvas} className="hidden-canvas"/>
        <div className="stage-toolbar">
          <div className="tool-status"><div className="tool-icon"><Layers3 size={20}/></div><div><strong>{step==='tryon'?'Đang thử đồ':step==='review'?'Xác nhận số đo':step==='side'?'Quét góc nghiêng':'Quét góc chính diện'}</strong><small>{step==='tryon'?'Chọn áo và quần từ bộ sưu tập':step==='review'?measuring?'Đang tính từ hai góc đã tự chụp':'Kiểm tra số đo và xác nhận':`Nhận diện liên tục · đứng yên ${config.capture_seconds} giây để tự chụp`}</small></div></div>
          <div className="toolbar-actions">
            {PREVIEW&&<div className="demo-pose-control" aria-label="Tư thế mô phỏng">{(Object.keys(DEMO_POSE_LABELS) as DemoPose[]).map(pose=><button key={pose} className={demoPose===pose?'active':''} onClick={()=>setDemoPose(pose)}>{DEMO_POSE_LABELS[pose]}</button>)}</div>}
            {step==='side'&&<button className="subtle-button" onClick={rescanFront}><RefreshCw size={15}/>Quét lại từ đầu</button>}
            {step==='review'&&<button className="subtle-button" onClick={rescanSide}><RefreshCw size={15}/>Quét lại góc nghiêng</button>}
            {step==='review'&&<button className="subtle-button" onClick={rescanFront}>Làm lại từ đầu</button>}
            {(step==='camera'||step==='front'||step==='side')&&<span className="auto-capture-tag"><Camera size={16}/>{capturing?'Đang tự chụp':`Tự chụp sau ${config.capture_seconds} giây đứng yên`}</span>}
            {step==='review'&&!Object.keys(measurements).length&&<button className="primary-button" onClick={calculate} disabled={measuring||heightCm<120||heightCm>220||!front.length||!side.length}>{measuring?<RefreshCw size={17} className="spin"/>:<Sparkles size={17}/>} {measuring?'Đang tính...':'Thử tính lại'}</button>}
            {step==='tryon'&&!PREVIEW&&<button className="subtle-button" onClick={()=>{stepRef.current='review';setStep('review')}}><Settings2 size={15}/>Chỉnh số đo</button>}
            {step==='tryon'&&<button className="primary-button" onClick={download} disabled={!videoReady&&!PREVIEW}><Aperture size={17}/>{PREVIEW?'Tải ảnh preview':'Chụp kết quả'}</button>}
          </div>
        </div>
        {error&&<div className="error-bar"><CameraOff size={16}/>{error}<button onClick={()=>setError('')}><X size={16}/></button></div>}
        <div className="selected-strip"><div className="strip-heading"><Sparkles size={18}/><span>YOUR CURRENT LOOK</span></div><div className="selected-content">{currentTop||currentBottom?<>{currentTop&&<span className="selected-pill" onClick={()=>setSelected(s=>({...s,top:undefined}))}>Áo: {currentTop.name} / {selectedSizes[currentTop.id]||recMap.get(currentTop.id)?.size||'M'} <X size={13}/></span>}{currentBottom&&<span className="selected-pill" onClick={()=>setSelected(s=>({...s,bottom:undefined}))}>Quần: {currentBottom.name} / {selectedSizes[currentBottom.id]||recMap.get(currentBottom.id)?.size||'M'} <X size={13}/></span>}</>:<span className="strip-empty">Chưa chọn trang phục nào. Chọn đồ trong bộ sưu tập để bắt đầu.</span>}</div><span className="strip-count">{Number(!!currentTop)+Number(!!currentBottom)} / 2</span></div>
      </main>

      <aside className="catalog-panel"><div className="catalog-header"><div className="eyebrow">CURATED FOR YOUR BODY</div><div className="catalog-title"><h2>Bộ sưu tập</h2><span>{visibleProducts.length} ITEMS</span></div><p>Khám phá trang phục và chọn size phù hợp với bạn.</p></div>
        <div className="catalog-controls"><div className="field-label">NHÓM TRANG PHỤC</div><div className="segment-control">{([['all','Tất cả'],['men','Nam'],['women','Nữ'],['unisex','Unisex']] as const).map(([key,label])=><button key={key} className={audience===key?'active':''} onClick={()=>setAudience(key)}>{label}</button>)}</div><div className="filter-row">{([['all','Tất cả'],['top','Áo'],['bottom','Quần']] as const).map(([key,label])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label}</button>)}<span className="filter-end"><Settings2 size={15}/></span></div></div>
        <div className="products-scroll">{visibleProducts.map(product=>{const rec=recMap.get(product.id),chosen=selected[product.type]===product.id;return <div className={'product-card '+(chosen?'chosen':'')} key={product.id}><ProductArt product={product}/><div className="product-info"><div className="product-upper"><span className="product-type">{product.type==='top'?'ÁO / TOP':'QUẦN / BOTTOM'}</span>{rec?.size&&<span className="match-chip"><Sparkles size={11}/>{rec.fit_status==='closest'?'GẦN NHẤT':'SIZE'} {rec.size}</span>}</div><h3>{product.name}</h3><p>{product.subtitle}</p><div className="product-meta"><span>{product.fit.toUpperCase()}</span><span>·</span><strong>{product.price}</strong></div><div className="product-actions"><div className="size-select"><select value={selectedSizes[product.id]||rec?.size||'M'} disabled={step!=='tryon'} onChange={e=>setSelectedSizes(s=>({...s,[product.id]:e.target.value}))}>{Object.keys(product.size_chart).map(size=><option key={size} value={size}>Size {size}</option>)}</select><ChevronDown size={14}/></div><button className={'try-button '+(chosen?'selected':'')} disabled={step!=='tryon'} onClick={()=>choose(product)}>{chosen?<><Check size={14}/>Đang thử</>:<><ShoppingBag size={14}/>{step==='tryon'?'Thử ngay':'Quét trước'}</>}</button></div>{rec&&<div className="recommend-reason">{rec.reasons[0]}</div>}</div></div>})}</div>
        <div className="catalog-footer"><span><span className="footer-icon"><Expand size={16}/></span> Trang phục chuyển động cùng cơ thể</span><span className="footer-chevrons">››</span></div>
      </aside>
    </div>
  </div>
}
