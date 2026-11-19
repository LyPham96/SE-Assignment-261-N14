import {useEffect, useState, type ReactNode} from 'react';
import './operations.css';

type Api = (path: string, body?: object, method?: string) => Promise<any>;
type PanelProps = {api: Api};
type ResultHandler = (action: () => Promise<unknown>) => void;
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const encode = encodeURIComponent;
function useOutput() {
  const [output, setOutput] = useState<unknown>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run: ResultHandler = action => {
    setBusy(true); setError('');
    void action().then(setOutput, reason => setError(String(reason.message ?? reason))).finally(() => setBusy(false));
  };
  return {run, busy, view: <>{error && <p role="alert">{error}</p>}{output !== undefined && <pre>{JSON.stringify(output,null,2)}</pre>}</>};
}
function Field({label, value, set, type = 'text'}: {label: string; value: string; set: (value: string) => void; type?: string}) {
  return <label>{label}<input type={type} value={value} onChange={event => set(event.target.value)}/></label>;
}
function Panel({title, children}: {title: string; children: ReactNode}) { return <article><h2>{title}</h2>{children}</article>; }

export function ChargingUI({api}: PanelProps) {
  const [maXe, setXe] = useState('PV01');
  const [maHub, setHub] = useState('H01');
  const [target, setTarget] = useState('');
  const [arrive, setArrive] = useState('');
  const [leave, setLeave] = useState('');
  const o = useOutput();
  return <Panel title="Đăng ký sạc"><Field label="Mã xe" value={maXe} set={setXe}/><Field label="Mã Hub" value={maHub} set={setHub}/>
    <button disabled={o.busy} onClick={() => o.run(() => api('/charging/info?' + new URLSearchParams({maXe,maHub})))}>Xem thông tin sạc</button>
    <Field label="Pin mong muốn (%)" value={target} set={setTarget} type="number"/>
    <Field label="Đến lúc" value={arrive} set={setArrive} type="datetime-local"/><Field label="Cần xe trước" value={leave} set={setLeave} type="datetime-local"/>
    <button disabled={o.busy || Boolean(arrive) !== Boolean(leave)} onClick={() => o.run(() => api('/charging/requests',{maXe,maHub,
      ...target && {targetBattery:Number(target)}, ...arrive && {khungGio:{start:new Date(arrive).getTime(),end:new Date(leave).getTime()}},
    }))}>Gửi yêu cầu sạc</button>{o.view}</Panel>;
}
export function GiaoDienBaoSuCo({api}: PanelProps) {
  const [loaiTaiNguyen, setType] = useState('XE');
  const [maTaiNguyen, setId] = useState('');
  const [loaiSuCo, setKind] = useState('');
  const [moTa, setDetail] = useState('');
  const [viTri, setLocation] = useState('');
  const [maChuyenDi, setTrip] = useState('');
  const [attachment, setAttachment] = useState<File>();
  const o = useOutput();
  return <Panel title="Báo sự cố"><label>Loại tài nguyên<select value={loaiTaiNguyen} onChange={event => setType(event.target.value)}><option value="XE">Xe</option><option value="CONG_SAC">Cổng sạc</option></select></label>
    <Field label="Mã tài nguyên" value={maTaiNguyen} set={setId}/><Field label="Loại sự cố" value={loaiSuCo} set={setKind}/><Field label="Mô tả" value={moTa} set={setDetail}/>
    <Field label="Vị trí" value={viTri} set={setLocation}/>{loaiTaiNguyen === 'XE' && <Field label="Mã chuyến đi (nếu có)" value={maChuyenDi} set={setTrip}/>}
    <label>Ảnh đính kèm<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setAttachment(event.target.files?.[0])}/></label>
    <button disabled={o.busy} onClick={() => o.run(async () => {
      if (attachment && attachment.size > 512_000) throw new Error('Ảnh vượt quá 500 KB');
      const anhDinhKem = attachment && await new Promise<string>((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(attachment);
      });
      return api('/incidents',{loaiTaiNguyen,maTaiNguyen,loaiSuCo,moTa,viTri,...maChuyenDi && {maChuyenDi},...anhDinhKem && {anhDinhKem}});
    })}>Gửi báo cáo</button>{o.view}</Panel>;
}
export function DashboardUI({api}: PanelProps) {
  const [rows, setRows] = useState<{hub: {id: string; name: string}; ratio: number; dataStatus: string; lastUpdated: number | null; alerts: {id: string; level: string}[]}[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const refresh = () => void api('/dashboard').then(result => {
      if (mounted) { setRows(result); setError(''); }
    }, reason => { if (mounted) setError(reason.message); });
    refresh();
    const timer = setInterval(refresh,5000);
    return () => {mounted = false;clearInterval(timer);};
  },[api]);
  return <Panel title="Tổng quan mạng lưới">{error && <p role="alert">{error}</p>}
    <table><thead><tr><th>Hub</th><th>Chỗ đã dùng</th><th>Tín hiệu</th><th>Cảnh báo</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.hub.id}><td>{row.hub.name}</td><td>{Math.round(row.ratio * 100)}%</td><td>{row.dataStatus} {row.lastUpdated && new Date(row.lastUpdated).toLocaleTimeString()}</td><td>{row.alerts.map(alert => alert.level).join(', ') || '—'}</td></tr>)}
    </tbody></table></Panel>;
}
export function OperationsUI({api}: PanelProps) {
  const [maHub, setHub] = useState('H01');
  const [id, setId] = useState('');
  const [value, setValue] = useState('');
  const o = useOutput();
  const incident = '/incidents/' + encode(id);
  return <Panel title="Vận hành sạc và sự cố">
    <Field label="Mã Hub" value={maHub} set={setHub}/><button disabled={o.busy} onClick={() => o.run(() => api('/charging/schedules',{maHub}))}>Lập lịch sạc</button>
    <button disabled={o.busy} onClick={() => o.run(() => api('/incidents'))}>Danh sách sự cố</button>
    <Field label="Mã sự cố" value={id} set={setId}/><Field label="Mã kỹ thuật viên, lý do hoặc kết quả" value={value} set={setValue}/>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(incident))}>Xem chi tiết</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(incident + '/assign',{maNVKyThuat:value}))}>Xác nhận và phân công</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(incident + '/reject',{lyDo:value}))}>Từ chối</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(incident + '/repair',{ketQua:value},'PUT'))}>Lưu kết quả khắc phục</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(incident + '/conclude',{dat:true}))}>Đóng sự cố</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(incident + '/conclude',{dat:false}))}>Yêu cầu xử lý thêm</button>{o.view}</Panel>;
}
export function RebalancingScreen({api}: PanelProps) {
  const [sourceHubId,setSource] = useState('H01');
  const [destHubId,setDestination] = useState('H02');
  const [vehicles,setVehicles] = useState('');
  const [commandKey,setCommandKey] = useState('');
  const o = useOutput();
  return <Panel title="Điều chuyển xe"><Field label="Hub nguồn" value={sourceHubId} set={setSource}/><Field label="Hub đích" value={destHubId} set={setDestination}/>
    <button disabled={o.busy} onClick={() => o.run(async () => {
      const proposal = await api('/rebalancing/proposal?' + new URLSearchParams({sourceHubId,destHubId}));
      setVehicles(proposal.candidates.slice(0,proposal.n).map((item:{id:string}) => item.id).join(', '));
      setCommandKey(crypto.randomUUID());
      return proposal;
    })}>Xem đề xuất</button>
    <Field label="Mã các xe chọn, ngăn cách bằng dấu phẩy" value={vehicles} set={setVehicles}/>
    <button disabled={o.busy || !commandKey || !vehicles} onClick={() => o.run(() => api('/rebalancing/orders',{sourceHubId,destHubId,vehicleIds:split(vehicles),confirmed:true,idempotencyKey:commandKey}))}>Xác nhận tạo lệnh</button>{o.view}</Panel>;
}
export function RebalancingTaskScreen({api}: PanelProps) {
  const [id,setId] = useState('');
  const [vehicleId,setVehicle] = useState('');
  const [description,setDescription] = useState('');
  const [location,setLocation] = useState('');
  const o = useOutput();
  return <Panel title="Nhiệm vụ điều chuyển"><button disabled={o.busy} onClick={() => o.run(() => api('/rebalancing/orders'))}>Xem nhiệm vụ</button><Field label="Mã lệnh" value={id} set={setId}/>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api('/rebalancing/orders/' + encode(id) + '/complete',{}))}>Hoàn tất</button>
    <Field label="Mã xe hỏng" value={vehicleId} set={setVehicle}/><Field label="Mô tả lỗi" value={description} set={setDescription}/><Field label="Vị trí" value={location} set={setLocation}/><button disabled={o.busy || !id || !vehicleId} onClick={() => o.run(() => api('/rebalancing/orders/' + encode(id) + '/vehicle-broken',{vehicleId,description,location}))}>Báo xe hỏng</button>{o.view}</Panel>;
}
const split = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
export function ReportScreen({api}: PanelProps) {
  const [hubIds,setHubs] = useState('');
  const [start,setStart] = useState('');
  const [end,setEnd] = useState('');
  const o = useOutput();
  const filter = {hubIds:split(hubIds),window:{start:new Date(start).getTime(),end:new Date(end).getTime()}};
  return <Panel title="Báo cáo vận hành"><Field label="Mã Hub, để trống để xem toàn mạng" value={hubIds} set={setHubs}/>
    <Field label="Từ" value={start} set={setStart} type="datetime-local"/><Field label="Đến" value={end} set={setEnd} type="datetime-local"/>
    <button disabled={o.busy || !start || !end} onClick={() => o.run(() => api('/reports',filter))}>Xem báo cáo</button><button disabled={o.busy || !start || !end} onClick={() => o.run(() => api('/reports/refresh',filter))}>Làm mới</button>{o.view}</Panel>;
}
export function ScenarioScreen({api}: PanelProps) {
  const [id,setId] = useState('');
  const [code,setCode] = useState('');
  const [version,setVersion] = useState('1');
  const [hubIds,setHubs] = useState('H01');
  const [eventType,setEvent] = useState('DEMAND_SURGE');
  const [intensity,setIntensity] = useState('150');
  const [durationMin,setDuration] = useState('30');
  const [snapshot,setSnapshot] = useState('');
  const [templates,setTemplates] = useState<{code:string;eventType:string;intensity:number;durationMin:number}[]>([]);
  const o = useOutput();
  const params = {code,hubIds:split(hubIds),eventType,intensity:Number(intensity),durationMin:Number(durationMin)};
  const scenarioPath = '/scenarios/' + encode(id);
  return <Panel title="Kịch bản What-if">
    <button disabled={o.busy} onClick={() => o.run(async () => {setTemplates(await api('/scenarios/templates'));})}>Nạp mẫu</button>
    <button disabled={o.busy} onClick={() => o.run(() => api('/scenarios'))}>Danh sách kịch bản</button>
    <label>Mẫu<select defaultValue="" onChange={event => {const template=templates.find(item => item.code === event.target.value);if (template) {setCode(template.code);setEvent(template.eventType);setIntensity(String(template.intensity));setDuration(String(template.durationMin));}}}><option value="">Chọn mẫu</option>{templates.map(template => <option key={template.code}>{template.code}</option>)}</select></label>
    <Field label="Mã cấu hình hoặc mã mới khi nhân bản" value={code} set={setCode}/><Field label="Danh sách Hub" value={hubIds} set={setHubs}/>
    <label>Sự kiện<select value={eventType} onChange={event => setEvent(event.target.value)}>{['DEMAND_SURGE','CHARGER_FAILURE','LOW_BATTERY','PARKING_SURGE'].map(type => <option key={type}>{type}</option>)}</select></label>
    <Field label="Cường độ" value={intensity} set={setIntensity} type="number"/><Field label="Thời lượng (phút)" value={durationMin} set={setDuration} type="number"/>
    <button disabled={o.busy || !code} onClick={() => o.run(async () => {const result=await api('/scenarios',params);setId(result.scenario.id);setVersion(String(result.scenario.versionNo));return result;})}>Tạo kịch bản</button>
    <Field label="ID kịch bản" value={id} set={setId}/><Field label="Phiên bản" value={version} set={setVersion} type="number"/><Field label="ID snapshot dùng chung (tùy chọn)" value={snapshot} set={setSnapshot}/>
    <button disabled={o.busy || !id} onClick={() => o.run(async () => {const result=await api(scenarioPath,{params,expectedVersion:Number(version)},'PUT');setVersion(String(result.scenario.versionNo));return result;})}>Lưu phiên bản mới</button>
    <button disabled={o.busy || !id || !code} onClick={() => o.run(() => api(scenarioPath + '/clone',{newCode:code}))}>Nhân bản</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(scenarioPath + '/run',{expectedVersion:Number(version),...snapshot && {sharedSnapshotId:snapshot}}))}>Chạy mô phỏng</button>{o.view}</Panel>;
}
export function SimulationResultScreen({api}: PanelProps) {
  const [id,setId] = useState('');
  const [ids,setIds] = useState('');
  const [compare,setCompare] = useState('');
  const [ready,setReady] = useState('');
  const o = useOutput();
  const runPath = '/runs/' + encode(id);
  const selection = JSON.stringify([id,ids]);
  return <Panel title="Kết quả và khuyến nghị"><Field label="ID lần chạy" value={id} set={setId}/>
    <button disabled={o.busy} onClick={() => o.run(() => api('/runs'))}>Danh sách lần chạy</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(runPath))}>Xem kết quả</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(runPath + '/progress'))}>Xem tiến độ</button>
    <button disabled={o.busy || !id} onClick={() => o.run(() => api(runPath + '/cancel',{}))}>Hủy lần chạy</button>
    <Field label="ID các lần chạy để so sánh" value={compare} set={setCompare}/>
    <button disabled={o.busy || split(compare).length < 2} onClick={() => o.run(() => api('/runs/compare',{runIds:split(compare)}))}>So sánh</button>
    <Field label="ID khuyến nghị được chọn" value={ids} set={setIds}/>
    <button disabled={o.busy || !id || !ids} onClick={() => o.run(async () => {setReady('');const result=await api(runPath + '/preview',{recommendationIds:split(ids)});setReady(selection);return result;})}>Xem trước tác động</button>
    <button disabled={o.busy || ready !== selection} onClick={() => o.run(async () => {const result=await api(runPath + '/apply',{recommendationIds:split(ids),confirmed:true});setReady('');return result;})}>Xác nhận áp dụng</button>{o.view}</Panel>;
}
const panels = {ChargingUI,GiaoDienBaoSuCo,DashboardUI,OperationsUI,RebalancingScreen,RebalancingTaskScreen,ReportScreen,ScenarioScreen,SimulationResultScreen};
const labels = ['Đăng ký sạc','Báo sự cố','Tổng quan','Vận hành','Điều chuyển','Nhiệm vụ','Báo cáo','Kịch bản','Kết quả'];
export function OperationsApp() {
  const [draft,setDraft] = useState('');
  const [token,setToken] = useState('');
  const [panel,setPanel] = useState<keyof typeof panels>('ChargingUI');
  const [api,setApi] = useState<Api>(() => async () => {throw new Error('Hãy nhập mã phiên');});
  const PanelComponent = panels[panel];
  function connect() {
    setToken(draft);
    setApi(() => async (path: string, body?: object, method?: string) => {
      const response = await fetch(apiBase + '/api/v1' + path,{method:method ?? (body ? 'POST' : 'GET'),headers:{Authorization:'Bearer ' + draft,...body && {'Content-Type':'application/json'}},body:body && JSON.stringify(body)});
      if (response.status === 204) return {success:true};
      const result = await response.json();
      if (!response.ok) throw new Error(result.code ?? JSON.stringify(result.fieldErrors ?? result));
      return result;
    });
    setDraft('');
  }
  return <main className="m3m4"><h1>PikePike · Vận hành</h1><a href="/#">Về trang chính</a>
    <form onSubmit={event => {event.preventDefault();connect();}}><Field label="Mã phiên" value={draft} set={setDraft} type="password"/><button disabled={!draft}>Kết nối</button></form>
    {token && <><nav aria-label="Chức năng vận hành">{(Object.keys(panels) as (keyof typeof panels)[]).map((key,index) => <button key={key} aria-pressed={panel === key} onClick={() => setPanel(key)}>{labels[index]}</button>)}</nav><PanelComponent key={panel} api={api}/></>}
  </main>;
}
