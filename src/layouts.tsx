import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Bike, MapPin, Zap, Search, Navigation, ChevronRight, AlertTriangle, Truck, Play, Circle, Wrench, BarChart3 } from 'lucide-react';
type Hub={name:string;distance:string;bikes:number;spots:number;charge:number};
type Props={hubs:Hub[];onNavigate:(screen:string)=>void};
export function Explore({hubs,onNavigate,onHub}:Props&{onHub:(hub:Hub)=>void}){
 const [query,setQuery]=useState('');
 return <div className="explore-layout">
  <div className="location-heading"><span><MapPin size={13}/> Khu đô thị ĐHQG-HCM</span><span className="live-dot">Đang phục vụ</span></div>
  <h1>Bạn muốn đi đâu?</h1>
  <div className="search glass-search"><Search size={19}/><input aria-label="Tìm Hub" placeholder="Tìm Hub, trường, ký túc xá…" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="Tìm quanh tôi" onClick={()=>setQuery('')}><Navigation size={17}/></button></div>
  <div className="service-switch"><button onClick={()=>onNavigate('vehicle')}><Bike size={23}/><span>Thuê xe<small>Xe điện dùng chung</small></span><ArrowUpRight size={16}/></button><button onClick={()=>onNavigate('parking')}><MapPin size={23}/><span>Chỗ đỗ<small>Dành cho xe cá nhân</small></span><ArrowUpRight size={16}/></button><button onClick={()=>onNavigate('charge')}><Zap size={23}/><span>Sạc xe<small>Đặt lịch trước</small></span><ArrowUpRight size={16}/></button></div>
  <div className="ride-banner"><div className="banner-copy"><span>DI CHUYỂN TRONG KHU ĐÔ THỊ</span><h2>Chặng tiếp theo,<br/>đã có PikePike.</h2><button onClick={()=>onNavigate('vehicle')}>Tìm xe ngay<ArrowRight size={15}/></button></div></div>
  <div className="section"><h2>Hub gần bạn</h2><span className="section-detail">3 điểm đang hoạt động</span></div>
  <div className="nearby-list">{hubs.filter(h=>h.name.toLowerCase().includes(query.toLowerCase())).map((h,i)=><button key={h.name} className="nearby-row" onClick={()=>onHub(h)}><span className="hub-index">0{i+1}</span><div className="nearby-name"><h3>{h.name}</h3><p><Navigation size={10}/>{h.distance}<span>·</span>{h.bikes} xe khả dụng</p><div className="availability"><span><i style={{width:`${h.bikes/14*100}%`}}/></span><small>{h.spots} chỗ đỗ · {h.charge} cổng sạc</small></div></div><ChevronRight size={17}/></button>)}</div>
  <button className="current-booking" onClick={()=>onNavigate('reservations')}><span className="booking-mark"><Bike size={19}/></span><span><b>Bạn đang giữ một xe</b><small>PK-0248 · Ga Metro ĐHQG</small></span><ArrowUpRight size={18}/></button>
 </div>
}
type OperationsHub = {
 id:string; name:string; bikes:number; bikeTotal:number; spots:number; charge:number; chargeTotal:number; ratio:number; dataStatus:string;
};
type OperationsProps = {
 hubs:OperationsHub[]; alertCount:number; updatedAt:string; technician:boolean;
 onNavigate:(screen:'alerts'|'incident'|'schedule'|'transfer'|'scenario'|'results'|'operationsReport')=>void;
 onResources:(hubId:string,tab:'vehicles'|'spots'|'points')=>void;
};
export function Operations({hubs,alertCount,updatedAt,technician,onNavigate,onResources}:OperationsProps){
 const resource=(tab:'vehicles'|'spots'|'points',hub=hubs[0])=>{if(hub)onResources(hub.id,tab)};
 const total=(key:'bikes'|'bikeTotal'|'spots'|'charge'|'chargeTotal')=>hubs.reduce((sum,hub)=>sum+hub[key],0);
 const shortcuts=[
  {screen:'alerts',label:'Cảnh báo',Icon:AlertTriangle},
  {screen:'incident',label:'Xử lý sự cố',Icon:Wrench},
  {screen:'schedule',label:'Lịch sạc',Icon:Zap},
  {screen:'transfer',label:'Điều chuyển',Icon:Truck},
  {screen:'scenario',label:'Tạo What-if',Icon:Play},
  {screen:'results',label:'Kết quả mô phỏng',Icon:BarChart3},
  {screen:'operationsReport',label:'Báo cáo vận hành',Icon:BarChart3},
 ] as const;
 return <div className="operations-layout supervisor-layout">
  <div className="supervisor-heading"><span>GIÁM SÁT TOÀN MẠNG</span><span className="online-indicator"><i/>{updatedAt}</span></div>
  <div className="supervisor-metrics">
   <button disabled={!hubs.length} onClick={()=>resource('vehicles')}><Bike size={19}/><b>{total('bikes')}<span>/{total('bikeTotal')}</span></b><span>Xe khả dụng</span><ArrowUpRight size={13}/></button>
   <button disabled={!hubs.length} onClick={()=>resource('spots')}><MapPin size={19}/><b>{total('spots')}</b><span>Chỗ đỗ trống</span><ArrowUpRight size={13}/></button>
   <button disabled={!hubs.length} onClick={()=>resource('points')}><Zap size={19}/><b>{total('charge')}<span>/{total('chargeTotal')}</span></b><span>Cổng sạc rảnh</span><ArrowUpRight size={13}/></button>
  </div>
  <button className="supervisor-alert" onClick={()=>onNavigate('alerts')}><AlertTriangle size={18}/><span>{alertCount} cảnh báo đang mở</span><ChevronRight size={16}/></button>
  <div className="section"><h2>Trung tâm thao tác</h2><span className="section-detail">M3 · M4</span></div>
  <div className="supervisor-links">{shortcuts.filter(({screen})=>!technician||!['scenario','results','operationsReport'].includes(screen)).map(({screen,label,Icon})=><button key={screen} onClick={()=>onNavigate(screen)}><Icon size={19}/><span><strong>{label}</strong></span><ChevronRight size={13}/></button>)}</div>
  <div className="section"><h2>Mạng lưới Hub</h2><button disabled={!hubs.length} onClick={()=>resource('vehicles')}>Tất cả tài nguyên<ArrowUpRight size={13}/></button></div>
  <div className="network-table"><div className="network-table-head"><span>HUB / MỨC LẤP ĐẦY</span><span>XE</span><span>SẠC</span></div>{hubs.map(h=>{
    const occupancy=Math.round(h.ratio*100)+'%';
    return <button className="network-table-row" key={h.id} onClick={()=>resource('vehicles',h)}><div><h3><Circle size={7} fill="#6dacea" color="transparent"/>{h.name}</h3><div className="occupancy"><span><i style={{width:occupancy,background:'#6dacea'}}/></span><small>{occupancy} · {h.dataStatus}</small></div></div><b>{h.bikes}</b><b>{h.charge}<small>/{h.chargeTotal}</small></b></button>;
  })}</div>
 </div>
}
