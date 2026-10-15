import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Bike, MapPin, Zap, Search, Navigation, ChevronRight, AlertTriangle, Truck, Play, Circle } from 'lucide-react';
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
export function Operations({hubs,onNavigate}:Props){return <div className="operations-layout">
 <div className="ops-heading"><div><span className="eyebrow">THỨ NĂM, 15 THÁNG 10</span><h1>Tổng quan vận hành</h1></div><span className="online-indicator"><i/>Live</span></div>
 <div className="network-metrics"><div className="metric-main"><Bike size={22}/><strong>26<span>xe</span></strong><p>Sẵn sàng phục vụ</p><small>Trong tổng 36 phương tiện</small></div><div className="metric-side"><div><MapPin size={16}/><b>25</b><span>chỗ trống</span></div><div><Zap size={16}/><b>7<span>/12</span></b><span>cổng sạc rảnh</span></div></div></div>
 <button className="ops-notice" onClick={()=>onNavigate('alerts')}><AlertTriangle size={20}/><span><b>2 vấn đề cần xử lý</b><small>Ga Metro gần đầy · Cổng C03 mất kết nối</small></span><ChevronRight size={18}/></button>
 <div className="section"><h2>Mạng lưới Hub</h2><button onClick={()=>onNavigate('resources')}>Tài nguyên<ArrowUpRight size={13}/></button></div>
 <div className="network-table"><div className="network-table-head"><span>HUB / MỨC LẤP ĐẦY</span><span>XE</span><span>SẠC</span></div>{hubs.map((h,i)=><button className="network-table-row" key={h.name} onClick={()=>onNavigate('resources')}><div><h3><Circle size={7} fill={i===0?'#db8b34':'#588778'} color="transparent"/>{h.name}</h3><div className="occupancy"><span><i style={{width:[95,55,70][i]+'%',background:i===0?'#d9994b':'#6e958a'}}/></span><small>{[95,55,70][i]}%</small></div></div><b>{h.bikes}</b><b>{h.charge}<small>/{[6,4,2][i]}</small></b></button>)}</div>
 <div className="section"><h2>Thao tác vận hành</h2></div><div className="ops-actions"><button onClick={()=>onNavigate('schedule')}><Zap size={20}/><span>Lịch sạc<small>5 yêu cầu đang chờ</small></span><ChevronRight size={15}/></button><button onClick={()=>onNavigate('transfer')}><Truck size={20}/><span>Điều chuyển<small>Cân bằng xe giữa các Hub</small></span><ChevronRight size={15}/></button></div>
 <button className="simulation-entry" onClick={()=>onNavigate('scenario')}><Play size={22}/><span><b>Mô phỏng What-if</b><small>Thử tình huống trước khi áp dụng thực tế</small></span><ArrowUpRight size={19}/></button>
 </div>}
