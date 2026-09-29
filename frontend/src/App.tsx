import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Aperture, ArrowRight, Camera, CameraOff, Check, ChevronDown, CircleHelp, Download, Expand, Layers3, Play, RefreshCw, ScanLine, Settings2, ShoppingBag, Sparkles, Video, X } from 'lucide-react'
import { drawGarments } from './ar'
import type { Landmark, Landmarks, MeasurementKey, Measurements, Product, Recommendation } from './types'

const LABELS: Record<MeasurementKey,string> = {height:'Chiều cao',shoulder:'Ngang vai',chest:'Vòng ngực',waist:'Vòng eo',hip:'Vòng hông',hip_width:'Ngang hông',arm_length:'Dài tay',torso_length:'Dài thân',outer_leg:'Dài chân ngoài',thigh:'Vòng đùi'}
const MEASUREMENT_KEYS = Object.keys(LABELS) as MeasurementKey[]
const API='/api'
const PREVIEW = new URLSearchParams(window.location.search).get('preview') === '1'
const PREVIEW_MEASUREMENTS: Measurements = Object.fromEntries(Object.entries({height:170,shoulder:42,chest:92,waist:76,hip:96,hip_width:37,arm_length:56,torso_length:52,outer_leg:96,thigh:55}).map(([key,cm])=>[key,{cm,source:'estimated'}]))
const PREVIEW_LANDMARKS: Landmarks = Object.fromEntries(Object.entries({
  nose:[320,100],left_shoulder:[220,200],right_shoulder:[420,200],left_elbow:[174,338],right_elbow:[466,338],left_wrist:[145,470],right_wrist:[495,470],
  left_hip:[260,455],right_hip:[380,455],left_knee:[270,620],right_knee:[370,620],left_ankle:[275,755],right_ankle:[365,755],
}).map(([key,[x,y]])=>[key,{x:x/640,y:y/800,visibility:1}]))
type Status = 'idle'|'connecting'|'tracked'|'partial'|'no_person'|'multiple_people'|'error'
type Step = 'camera'|'front'|'side'|'review'|'tryon'

function imgData(video: HTMLVideoElement, canvas: HTMLCanvasElement, maxWidth: number, quality: number) {
  const w=Math.min(maxWidth,video.videoWidth); const h=Math.round(w*video.videoHeight/video.videoWidth)
  canvas.width=w; canvas.height=h
  canvas.getContext('2d')!.drawImage(video,0,0,w,h)
  return canvas.toDataURL('image/jpeg',quality)
}

function statusText(status: Status) {
  return ({idle:'Chưa kết nối',connecting:'Đang kết nối',tracked:'Đã nhận diện người',partial:'Cần đứng đủ toàn thân',no_person:'Chưa thấy người',multiple_people:'Chỉ để một người trong khung',error:'Lỗi tracking'})[status]
}

function ProductArt({product}:{product:Product}) {
  return <div className="product-art" style={{'--art':product.color,'--art-accent':product.accent} as React.CSSProperties}>
    <span className="art-glow" />
    <img src={product.asset} alt="" loading="lazy" />
  </div>
}

export default function App() {
  const videoRef=useRef<HTMLVideoElement>(null), overlayRef=useRef<HTMLCanvasElement>(null), frameCanvas=useRef<HTMLCanvasElement>(null)
  const streamRef=useRef<MediaStream|null>(null), socketRef=useRef<WebSocket|null>(null), lastRequest=useRef(0), pending=useRef(false)
  const landmarkRef=useRef<Landmarks>({}), imagesRef=useRef(new Map<string,HTMLImageElement>()), animationRef=useRef(0)
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState(''),[status,setStatus]=useState<Status>('idle')
  const [step,setStep]=useState<Step>(PREVIEW?'tryon':'camera'),[error,setError]=useState(''),[front,setFront]=useState<string[]>([]),[side,setSide]=useState<string[]>([])
  const [markerCm,setMarkerCm]=useState(10),[measurements,setMeasurements]=useState<Measurements>(PREVIEW?PREVIEW_MEASUREMENTS:{}),[products,setProducts]=useState<Product[]>([])
  const [recommendations,setRecommendations]=useState<Recommendation[]>([]),[shapeLabels,setShapeLabels]=useState<string[]>([])
  const [audience,setAudience]=useState<'all'|'men'|'women'|'unisex'>('all'),[filter,setFilter]=useState<'all'|'top'|'bottom'>('all')
  const [selected,setSelected]=useState<{top?:string;bottom?:string}>(PREVIEW?{top:'top-01',bottom:'bottom-01'}:{}),[selectedSizes,setSelectedSizes]=useState<Record<string,string>>({})
  const [measuring,setMeasuring]=useState(false),[capturing,setCapturing]=useState(false),[debug,setDebug]=useState(false),[videoReady,setVideoReady]=useState(false)

  const selectedRef=useRef(selected),productsRef=useRef(products),debugRef=useRef(debug)
  useEffect(()=>{selectedRef.current=selected},[selected]);useEffect(()=>{productsRef.current=products},[products]);useEffect(()=>{debugRef.current=debug},[debug])

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
  },[])

  const startCamera=useCallback(async(id?:string)=>{
    if(PREVIEW){window.location.href='/';return}
    stopCamera();setError('');setStatus('connecting');setFront([]);setSide([]);setMeasurements({});setStep('camera')
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera chỉ hoạt động trên localhost hoặc HTTPS.')
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:id?{exact:id}:undefined,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}}})
      streamRef.current=stream
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();setVideoReady(true)}
      const actual=stream.getVideoTracks()[0].getSettings().deviceId
      if(actual)setDeviceId(actual)
      await refreshDevices()
      const scheme=location.protocol==='https:'?'wss':'ws'
      const ws=new WebSocket(`${scheme}://${location.host}${API}/tracking`)
      socketRef.current=ws
      ws.onmessage=(event)=>{
        pending.current=false
        const data=JSON.parse(event.data)
        if(data.status==='busy')return
        if(data.status==='error'){setError(data.message||'Không thể xử lý camera');setStatus('error');return}
        setStatus(data.status)
        if(data.landmarks){
          const old=landmarkRef.current;const smooth:Landmarks={}
          for(const [key,point] of Object.entries(data.landmarks as Landmarks)){
            const prev=old[key];const current=point as Landmark
            smooth[key]=prev?{x:prev.x*.6+current.x*.4,y:prev.y*.6+current.y*.4,visibility:current.visibility}:current
          }
          landmarkRef.current=smooth
        }else landmarkRef.current={}
      }
      ws.onerror=()=>{pending.current=false;setStatus('error');setError('Không kết nối được backend. Hãy chạy API Python trên cổng 8000.')}
      ws.onclose=()=>{pending.current=false}
    }catch(e){setStatus('error');setError(e instanceof Error?e.message:String(e));stopCamera()}
  },[refreshDevices,stopCamera])

  useEffect(()=>{
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
    const loop=()=>{
      const video=videoRef.current,canvas=overlayRef.current,frame=frameCanvas.current,socket=socketRef.current
      if(canvas && (PREVIEW || (video && frame && video.readyState>=2))){
        const w=PREVIEW?640:video!.videoWidth,h=PREVIEW?800:video!.videoHeight
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
        const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,w,h)
        const points=PREVIEW?PREVIEW_LANDMARKS:landmarkRef.current
        if(Object.keys(points).length){
          drawGarments(ctx,points,productsRef.current,selectedRef.current,imagesRef.current,w,h)
          if(debugRef.current){ctx.fillStyle='#a8fff0';for(const point of Object.values(points)){if(point.visibility<.45)continue;ctx.beginPath();ctx.arc(point.x*w,point.y*h,5,0,Math.PI*2);ctx.fill()}}
        }
        const now=performance.now()
        if(!PREVIEW && video && frame && socket?.readyState===WebSocket.OPEN && !pending.current && now-lastRequest.current>110){
          lastRequest.current=now;pending.current=true
          socket.send(JSON.stringify({image:imgData(video,frame,640,.68),timestamp:Date.now()}))
        }
      }
      animationRef.current=requestAnimationFrame(loop)
    }
    animationRef.current=requestAnimationFrame(loop)
    return()=>cancelAnimationFrame(animationRef.current)
  },[])

  const capture=async()=>{
    if(!videoRef.current||!frameCanvas.current||status!=='tracked'){setError('Hãy đứng đủ toàn thân, để một người trong khung rồi chụp.');return}
    setCapturing(true)
    const frames:string[]=[]
    for(let i=0;i<3;i++){
      if(!videoRef.current||!frameCanvas.current)break
      frames.push(imgData(videoRef.current,frameCanvas.current,1280,.86))
      if(i<2)await new Promise(resolve=>setTimeout(resolve,180))
    }
    setCapturing(false)
    if(frames.length<3){setError('Camera bị ngắt. Hãy bật lại camera.');return}
    setError('')
    if(step==='front'||step==='camera'){setFront(frames);setStep('side')}
    else if(step==='side'){setSide(frames);setStep('review')}
  }

  const calculate=async()=>{
    if(!front.length||!side.length)return
    setMeasuring(true);setError('')
    try{
      const response=await fetch(`${API}/measurements`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({front_images:front,side_images:side,marker_cm:markerCm})})
      const data=await response.json();if(!response.ok)throw new Error(data.detail||'Không đo được cơ thể')
      setMeasurements(data.measurements);setStep('review')
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setMeasuring(false)}
  }

  const getRecommendations=useCallback(async(values:Measurements,group:string)=>{
    if(PREVIEW){
      setShapeLabels(['vai trội','dáng thẳng'])
      setRecommendations(products.filter(p=>group==='all'||p.audience==='unisex'||p.audience===group).map(p=>({product_id:p.id,size:'M',score:p.tags.includes('vai trội')||p.tags.includes('dáng thẳng')?5:3,reasons:['Số đo mẫu nằm trong khoảng size M']})))
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
  const choose=(product:Product)=>{setSelected(s=>({...s,[product.type]:s[product.type]===product.id?undefined:product.id}));if(step!=='tryon')setStep('tryon')}

  const download=()=>{
    const video=videoRef.current,overlay=overlayRef.current;if(!overlay)return
    const canvas=document.createElement('canvas');canvas.width=PREVIEW?640:video?.videoWidth||0;canvas.height=PREVIEW?800:video?.videoHeight||0
    if(!canvas.width)return
    const ctx=canvas.getContext('2d')!
    if(PREVIEW){const avatar=document.querySelector<HTMLImageElement>('#preview-avatar');if(avatar)ctx.drawImage(avatar,0,0,640,800);ctx.drawImage(overlay,0,0)}
    else if(video){ctx.translate(canvas.width,0);ctx.scale(-1,1);ctx.drawImage(video,0,0);ctx.drawImage(overlay,0,0)}
    const a=document.createElement('a');a.download=`fashar-${Date.now()}.png`;a.href=canvas.toDataURL('image/png');a.click()
  }

  const currentTop=products.find(p=>p.id===selected.top),currentBottom=products.find(p=>p.id===selected.bottom)

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><Aperture size={23} strokeWidth={2.3}/></div><div className="brand-word">FASHAR<span className="brand-dot">.</span><small>SMART FITTING STUDIO</small></div></div>
      <div className="topbar-center"><span className="topbar-line"/>VIRTUAL FITTING EXPERIENCE<span className="topbar-line"/></div>
      <div className="topbar-right"><span className="system-status"><span className="pulse-dot"/>{PREVIEW?'UI PREVIEW':'SYSTEM ONLINE'}</span><button className="icon-button" title="Hiện điểm khớp" onClick={()=>setDebug(!debug)}><Settings2 size={19}/></button><div className="avatar">F</div></div>
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
          </div>

          <div className="side-section">
            <div className="section-heading"><span>02</span><h2>Quét cơ thể</h2><ScanLine size={17}/></div>
            <div className="step-list">
              <div className={'step-item '+(PREVIEW||front.length?'done':step==='camera'||step==='front'?'active':'')}><span className="step-symbol">{PREVIEW||front.length?<Check size={14}/>:1}</span><div><strong>Góc chính diện</strong><small>{PREVIEW?'Đã nạp ảnh minh họa':'Đứng thẳng, tay tách nhẹ'}</small></div></div>
              <div className={'step-item '+(PREVIEW||side.length?'done':step==='side'?'active':'')}><span className="step-symbol">{PREVIEW||side.length?<Check size={14}/>:2}</span><div><strong>Góc nghiêng 90°</strong><small>{PREVIEW?'Đã nạp ảnh minh họa':'Giữ nguyên vị trí đứng'}</small></div></div>
              <div className={'step-item '+(Object.keys(measurements).length?'done':step==='review'?'active':'')}><span className="step-symbol">{Object.keys(measurements).length?<Check size={14}/>:3}</span><div><strong>Xác nhận số đo</strong><small>Kiểm tra và chỉnh nếu cần</small></div></div>
            </div>
            <div className="marker-field"><div><strong>Marker ArUco ID 0</strong><small>Cạnh in thực tế (cm)</small></div><input type="number" min="3" max="30" value={markerCm} onChange={e=>setMarkerCm(Number(e.target.value))}/></div>
            <a className="text-link" href="/assets/aruco-marker.svg" download="fashar-aruco-id0.svg"><Download size={14}/>Tải marker để in</a>
            <p className="helper-text">Đặt marker cạnh người, cùng khoảng cách với camera. Giữ camera cố định ở cả hai góc.</p>
          </div>

          <div className="side-section measurements-section">
            <div className="section-heading"><span>03</span><h2>Số đo cơ thể</h2><Activity size={17}/></div>
            <div className="measurement-grid">{MEASUREMENT_KEYS.map(key=><label className="measurement-card" key={key}><small>{LABELS[key]}</small><div>{step==='review'&&measurements[key]?<input type="number" value={measurements[key]?.cm||''} onChange={e=>changeMeasure(key,e.target.value)} />:<strong>{measurements[key]?.cm??'--'}</strong>}<span>cm</span></div></label>)}</div>
            {shapeLabels.length>0&&<div className="shape-labels">{shapeLabels.map(x=><span key={x}>{x}</span>)}</div>}
            {step==='review'&&Object.keys(measurements).length>0&&<button className="primary-button full" onClick={confirmMeasurements}>Xác nhận và chọn đồ <ArrowRight size={17}/></button>}
            {Object.keys(measurements).length>0&&<p className="helper-text">{PREVIEW?'Dữ liệu mẫu để duyệt giao diện; chưa đo từ camera.':'Ước lượng từ ảnh. Hãy đối chiếu thước dây trước khi mua.'}</p>}
          </div>
        </div>
        <div className="sidebar-footer"><CircleHelp size={16}/><span>FASHAR DEMO <b>·</b> LOCAL EXPERIENCE</span></div>
      </aside>

      <main className="stage-area">
        <div className="stage-header"><div><div className="eyebrow">{PREVIEW?'DESIGN PREVIEW / 01':'LIVE STUDIO / 01'}</div><h2>Phòng thử đồ ảo</h2></div><div className="stage-head-actions"><span className={'live-indicator '+(status==='tracked'||PREVIEW?'live':'')}><span/>{PREVIEW?'Dữ liệu minh họa':statusText(status)}</span><button className="icon-button" title="Tải ảnh thử đồ" onClick={download} disabled={!videoReady&&!PREVIEW}><Download size={19}/></button></div></div>
        <div className="stage-frame">
          <div className="stage-grid"/>
          <div className="stage-corner tl"/><div className="stage-corner tr"/><div className="stage-corner bl"/><div className="stage-corner br"/>
          <div className="frame-top"><span><span className="rec-dot"/> {PREVIEW?'PREVIEW MODE':'LIVE FEED'}</span><span>{PREVIEW?'ILLUSTRATIVE DATA':videoReady&&videoRef.current?.videoWidth?`${videoRef.current.videoWidth} × ${videoRef.current.videoHeight} · 10 FPS AI`:'STANDBY · 10 FPS AI'}</span></div>
          <div className={'video-layer '+(PREVIEW?'preview-layer':'')} style={{display:videoReady||PREVIEW?'block':'none'}}>{PREVIEW&&<img id="preview-avatar" className="preview-avatar" src="/assets/preview-avatar.svg" alt="Hình người minh họa để duyệt giao diện"/>}<video ref={videoRef} autoPlay playsInline muted style={{display:PREVIEW?'none':undefined}}/><canvas ref={overlayRef}/></div>
          {!videoReady&&!PREVIEW&&<div className="stage-empty"><div className="empty-orbit"><div className="empty-inner"><Camera size={38} strokeWidth={1.4}/></div></div><div className="empty-line"/><span className="empty-kicker">YOUR FITTING SESSION STARTS HERE</span><h3>Sẵn sàng tìm <em>fit</em> của bạn?</h3><p>Bật camera để bắt đầu trải nghiệm thử đồ thông minh.</p><button className="primary-button" onClick={()=>startCamera()}><Play size={17} fill="currentColor"/> Bật camera ngay</button></div>}
          {(videoReady||PREVIEW)&&<div className="scan-visual"><span className="scan-tl"/><span className="scan-tr"/><span className="scan-bl"/><span className="scan-br"/></div>}
          {(videoReady||PREVIEW)&&<div className="stage-instruction"><ScanLine size={15}/>{PREVIEW?'Bản xem trước UI · Dữ liệu và hình người minh họa':step==='side'?'Xoay nghiêng 90°, giữ nguyên vị trí và marker':step==='review'?'Kiểm tra ảnh quét rồi tính số đo':step==='tryon'?'Di chuyển nhẹ để xem đồ bám theo cơ thể':'Đứng đủ toàn thân, hướng mặt về camera'}</div>}
          {(videoReady||PREVIEW)&&<div className="stage-bottom"><span><span className="signal-bars">▂▄▆</span> {PREVIEW?'PREVIEW RENDER':'POSE TRACKING'} <b>{PREVIEW?'SIMULATED':status==='tracked'?'ACTIVE':'WAITING'}</b></span><span>FASHAR V0.1</span></div>}
        </div>
        <canvas ref={frameCanvas} className="hidden-canvas"/>
        <div className="stage-toolbar">
          <div className="tool-status"><div className="tool-icon"><Layers3 size={20}/></div><div><strong>{step==='tryon'?'Đang thử đồ':step==='review'?'Xác nhận số đo':step==='side'?'Quét góc nghiêng':'Quét góc chính diện'}</strong><small>{step==='tryon'?'Chọn áo và quần từ bộ sưu tập':step==='review'?'Tính kết quả từ 2 ảnh đã chụp':'Cần 2 góc chụp và marker ArUco'}</small></div></div>
          <div className="toolbar-actions">
            {step==='side'&&<button className="subtle-button" onClick={()=>{setFront([]);setStep('front')}}><RefreshCw size={15}/>Chụp lại</button>}
            {step==='review'&&<button className="subtle-button" onClick={()=>{setSide([]);setStep('side')}}><RefreshCw size={15}/>Chụp lại</button>}
            {(step==='camera'||step==='front'||step==='side')&&<button className="primary-button" onClick={capture} disabled={!videoReady||status!=='tracked'||capturing}><Camera size={17}/>{capturing?'Đang chụp...':step==='side'?'Chụp góc nghiêng':'Chụp chính diện'}</button>}
            {step==='review'&&<button className="primary-button" onClick={calculate} disabled={measuring||markerCm<3||markerCm>30||!front.length||!side.length}>{measuring?<RefreshCw size={17} className="spin"/>:<Sparkles size={17}/>} {measuring?'Đang tính...':'Tính số đo'}</button>}
            {step==='tryon'&&<button className="primary-button" onClick={download} disabled={!videoReady&&!PREVIEW}><Aperture size={17}/>{PREVIEW?'Tải ảnh preview':'Chụp kết quả'}</button>}
          </div>
        </div>
        {error&&<div className="error-bar"><CameraOff size={16}/>{error}<button onClick={()=>setError('')}><X size={16}/></button></div>}
        <div className="selected-strip"><div className="strip-heading"><Sparkles size={18}/><span>YOUR CURRENT LOOK</span></div><div className="selected-content">{currentTop||currentBottom?<>{currentTop&&<span className="selected-pill" onClick={()=>setSelected(s=>({...s,top:undefined}))}>Áo: {currentTop.name} / {selectedSizes[currentTop.id]||recMap.get(currentTop.id)?.size||'M'} <X size={13}/></span>}{currentBottom&&<span className="selected-pill" onClick={()=>setSelected(s=>({...s,bottom:undefined}))}>Quần: {currentBottom.name} / {selectedSizes[currentBottom.id]||recMap.get(currentBottom.id)?.size||'M'} <X size={13}/></span>}</>:<span className="strip-empty">Chưa chọn trang phục nào. Chọn đồ trong bộ sưu tập để bắt đầu.</span>}</div><span className="strip-count">{Number(!!currentTop)+Number(!!currentBottom)} / 2</span></div>
      </main>

      <aside className="catalog-panel"><div className="catalog-header"><div className="eyebrow">CURATED FOR YOUR BODY</div><div className="catalog-title"><h2>Bộ sưu tập</h2><span>{visibleProducts.length} ITEMS</span></div><p>Khám phá trang phục và chọn size phù hợp với bạn.</p></div>
        <div className="catalog-controls"><div className="field-label">NHÓM TRANG PHỤC</div><div className="segment-control">{([['all','Tất cả'],['men','Nam'],['women','Nữ'],['unisex','Unisex']] as const).map(([key,label])=><button key={key} className={audience===key?'active':''} onClick={()=>setAudience(key)}>{label}</button>)}</div><div className="filter-row">{([['all','Tất cả'],['top','Áo'],['bottom','Quần']] as const).map(([key,label])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label}</button>)}<span className="filter-end"><Settings2 size={15}/></span></div></div>
        <div className="products-scroll">{visibleProducts.map(product=>{const rec=recMap.get(product.id),chosen=selected[product.type]===product.id;return <div className={'product-card '+(chosen?'chosen':'')} key={product.id}><ProductArt product={product}/><div className="product-info"><div className="product-upper"><span className="product-type">{product.type==='top'?'ÁO / TOP':'QUẦN / BOTTOM'}</span>{rec?.size&&<span className="match-chip"><Sparkles size={11}/> SIZE {rec.size}</span>}</div><h3>{product.name}</h3><p>{product.subtitle}</p><div className="product-meta"><span>{product.fit.toUpperCase()}</span><span>·</span><strong>{product.price}</strong></div><div className="product-actions"><div className="size-select"><select value={selectedSizes[product.id]||rec?.size||'M'} onChange={e=>setSelectedSizes(s=>({...s,[product.id]:e.target.value}))}>{Object.keys(product.size_chart).map(size=><option key={size} value={size}>Size {size}</option>)}</select><ChevronDown size={14}/></div><button className={'try-button '+(chosen?'selected':'')} onClick={()=>choose(product)}>{chosen?<><Check size={14}/>Đang thử</>:<><ShoppingBag size={14}/>Thử ngay</>}</button></div>{rec&&<div className="recommend-reason">{rec.reasons[0]}</div>}</div></div>})}</div>
        <div className="catalog-footer"><span><span className="footer-icon"><Expand size={16}/></span> Trang phục chuyển động cùng cơ thể</span><span className="footer-chevrons">››</span></div>
      </aside>
    </div>
  </div>
}
