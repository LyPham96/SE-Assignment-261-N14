import { useCallback, useEffect, useRef, useState } from 'react';
import { Bike, BatteryCharging, MapPin, Ticket, LogOut, Search, Clock, X, CheckCircle2, AlertTriangle, Sun, Moon, ChevronRight, RefreshCw } from 'lucide-react';
import { api, ApiError, type User, type Hub, type Vehicle, type Reservation } from './api';
import './demo.css';

const formatTime = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const statusLabel = { DA_XAC_NHAN: 'Đang giữ xe', DA_HUY: 'Đã hủy', HET_HAN: 'Đã hết hạn' };

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return <span>{seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} còn lại` : 'Đã đến hạn · Đang cập nhật'}</span>;
}

export default function Demo() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [username, setUsername] = useState('student@pikepike.vn');
  const [password, setPassword] = useState('PikePike2026!');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [hubId, setHubId] = useState('metro');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<'explore' | 'reservations'>('explore');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [destination, setDestination] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [dark, setDark] = useState(false);
  const generation = useRef(0);
  const modalRef = useRef<HTMLDialogElement>(null);
  const hub = hubs.find(h => h.id === hubId);
  const active = reservations.find(r => r.status === 'DA_XAC_NHAN');
  const modalOpen = Boolean(selectedVehicle || cancelTarget);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);

  useEffect(() => {
    if (modalOpen) modalRef.current?.showModal();
    else modalRef.current?.close();
  }, [modalOpen]);

  const handleError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) {
      generation.current++;
      setUser(null);
      setHubs([]);
      setVehicles([]);
      setReservations([]);
      setSelectedVehicle(null);
      setCancelTarget(null);
      setLoaded(false);
    }
    setError(caught instanceof Error ? caught.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ user: User }>('/auth/me').then(data => { if (alive) setUser(data.user); }).catch(caught => {
      if (alive && (!(caught instanceof ApiError) || caught.status !== 401)) handleError(caught);
    }).finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, [handleError]);

  const refresh = useCallback(async () => {
    const current = generation.current;
    const [nextHubs, nextReservations, nextVehicles] = await Promise.all([
      api<Hub[]>('/hubs'), api<Reservation[]>('/me/reservations'), api<Vehicle[]>(`/hubs/${encodeURIComponent(hubId)}/vehicles`)
    ]);
    if (current !== generation.current) return;
    setHubs(nextHubs);
    setReservations(nextReservations);
    setVehicles(nextVehicles);
    setLoaded(true);
    setUpdated(new Date());
  }, [hubId]);

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try { await refresh(); } catch (caught) { if (!stopped) handleError(caught); }
      if (!stopped) timer = setTimeout(tick, 4000);
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); generation.current++; };
  }, [user, refresh, handleError]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { await work(); } catch (caught) { handleError(caught); } finally { setBusy(false); }
  }

  async function reserve() {
    if (!selectedVehicle) return;
    await run(async () => {
      await api('/reservations/shared', { vehicleId: selectedVehicle.id, ...(destination ? { destinationHubId: destination } : {}) });
      generation.current++;
      setSelectedVehicle(null);
      setNotice('Đặt xe thành công. Xe được giữ trong 15 phút.');
      setPage('reservations');
      await refresh();
    });
  }

  async function cancel() {
    if (!cancelTarget) return;
    await run(async () => {
      await api(`/reservations/${cancelTarget.id}/cancel`, {});
      generation.current++;
      setCancelTarget(null);
      setNotice('Đã hủy đặt chỗ. Xe và chỗ đích đã được giải phóng.');
      await refresh();
    });
  }

  const closeModal = () => { if (!busy) { setSelectedVehicle(null); setCancelTarget(null); setError(''); } };
  const errorBox = error && <div className="demo-message demo-error" role="alert"><AlertTriangle size={20}/><span>{error}</span><button type="button" aria-label="Đóng thông báo lỗi" onClick={() => setError('')}><X size={18}/></button></div>;

  return <div className="demo-app">
    <aside className="demo-sidebar">
      <a className="demo-brand" href="/"><Bike size={32}/><span>PikePike<span className="demo-brand-dot">.</span></span></a>
      <p className="demo-tagline">Đi gần hơn.<br/>Sống xanh hơn.</p>
      <span className="demo-chip">BTL4 · Demo M1 & M2</span>
      {user && <nav aria-label="Điều hướng chính"><button className={page === 'explore' ? 'selected' : ''} onClick={() => setPage('explore')}><MapPin size={20}/>Khám phá Hub</button><button className={page === 'reservations' ? 'selected' : ''} onClick={() => setPage('reservations')}><Ticket size={20}/>Đặt chỗ của tôi{active && <span className="demo-count">1</span>}</button></nav>}
      <div className="demo-sidebar-bottom"><p>Dữ liệu khởi tạo phục vụ demo.<br/>Nhận/trả xe và sạc chưa tích hợp.</p><a href="/?mode=mockup">Xem bộ giao diện mockup</a></div>
    </aside>
    <main className="demo-main">
      <header className="demo-header"><div><span className="demo-eyebrow">SMART E-MOBILITY HUB</span><p>{user ? `Chào ${user.name}` : 'Chào bạn, PikePike đây!'}</p></div><div className="demo-header-actions"><button className="demo-icon" aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} onClick={() => setDark(!dark)}>{dark ? <Sun size={20}/> : <Moon size={20}/>}</button>{user && <button className="demo-icon" aria-label="Đăng xuất" disabled={busy} onClick={() => void run(async () => { await api('/auth/logout', {}); generation.current++; setUser(null); setHubs([]); setVehicles([]); setReservations([]); setLoaded(false); setUpdated(null); setPage('explore'); })}><LogOut size={20}/></button>}</div></header>
      {!modalOpen && errorBox}
      {notice && <div className="demo-message demo-success" role="status"><CheckCircle2 size={20}/><span>{notice}</span><button aria-label="Đóng thông báo" onClick={() => setNotice('')}><X size={18}/></button></div>}
      {booting ? <div className="demo-empty" role="status">Đang kiểm tra phiên đăng nhập…</div> : !user ? <section className="demo-login-grid">
        <div className="demo-welcome"><span className="demo-eyebrow">MỘT HÀNH TRÌNH XANH</span><h1>Đi gần hơn.<br/><em>Thảnh thơi hơn.</em></h1><p>Tìm Hub, chọn xe và giữ chỗ cho chuyến đi tiếp theo trong khu đô thị ĐHQG.</p><img src="/images/vehicle.png" alt="Xe máy điện PikePike màu đỏ"/><div className="demo-welcome-footer"><MapPin size={18}/>3 Hub trong khu đô thị ĐHQG</div></div>
        <form className="demo-login-card" onSubmit={event => { event.preventDefault(); void run(async () => { const data = await api<{ user: User }>('/auth/login', { username, password }); setLoaded(false); setUser(data.user); }); }}><span className="demo-chip">Bắt đầu hành trình</span><h2>Đăng nhập</h2><p>Dùng tài khoản được cấp để quản lý đặt chỗ của bạn.</p><label>Email tài khoản<input name="username" type="email" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)}/></label><label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)}/></label><button className="demo-primary" disabled={busy} type="submit">{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}<Bike size={19}/></button><div className="demo-credentials"><strong>Tài khoản dùng thử</strong><span>student@pikepike.vn</span><span>Mật khẩu: PikePike2026!</span><small>Có thể dùng student2@pikepike.vn để thử đặt xe đồng thời.</small></div></form>
      </section> : <>
        <div className="demo-mobile-nav"><button className={page === 'explore' ? 'selected' : ''} onClick={() => setPage('explore')}><MapPin size={18}/>Khám phá</button><button className={page === 'reservations' ? 'selected' : ''} onClick={() => setPage('reservations')}><Ticket size={18}/>Đặt chỗ{active ? ' (1)' : ''}</button></div>
        <div className="demo-page-title"><div><span className="demo-eyebrow">{page === 'explore' ? 'CHỌN ĐIỂM BẮT ĐẦU' : 'HÀNH TRÌNH CỦA BẠN'}</span><h1>{page === 'explore' ? 'Hôm nay, mình đi đâu?' : 'Đặt chỗ của tôi'}</h1></div><button className="demo-refresh" disabled={busy} onClick={() => void run(refresh)}><RefreshCw size={16}/>Làm mới</button></div>
        {updated && <p className="demo-updated">Cập nhật lúc {updated.toLocaleTimeString('vi-VN')} · Tự cập nhật mỗi 4 giây</p>}
        {!loaded ? <div className="demo-empty" role="status">Đang tải dữ liệu…</div> : page === 'explore' ? <>
          <div className="demo-search"><Search size={20}/><input aria-label="Tìm Hub" placeholder="Tìm Hub trong khu đô thị…" value={query} onChange={e => setQuery(e.target.value)}/></div>
          <section className="demo-hubs" aria-label="Danh sách Hub">{hubs.filter(h => h.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))).map(h => <button key={h.id} className={`demo-hub ${h.id === hubId ? 'selected' : ''}`} onClick={() => { generation.current++; setHubId(h.id); setVehicles([]); }} aria-pressed={h.id === hubId}><div className="demo-hub-top"><span className="demo-hub-icon"><MapPin size={22}/></span><ChevronRight size={18}/></div><h2>{h.name}</h2><div className="demo-hub-stats"><span><Bike size={17}/><strong>{h.available}</strong> xe</span><span><strong>{h.empty}</strong> chỗ trống</span></div><div className="demo-capacity"><span style={{ width: `${h.capacity ? h.used / h.capacity * 100 : 0}%` }}/></div><small>{h.used}/{h.capacity} chỗ đã dùng hoặc giữ</small>{h.nearFull && <span className="demo-warning">{h.blocked ? 'Tạm ngừng giữ chỗ mới' : 'Hub gần đầy'}</span>}</button>)}</section>
          {!hubs.some(h => h.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))) && <p className="demo-empty">Không tìm thấy Hub phù hợp.</p>}
          <div className="demo-section-title"><div><span className="demo-eyebrow">XE DÙNG CHUNG</span><h2>{hub?.name}</h2></div><span>{hub?.available ?? 0} xe khả dụng</span></div>
          {active && <div className="demo-message demo-info"><Ticket size={20}/><span>Bạn đã có xe đang được giữ.</span><button onClick={() => setPage('reservations')}>Xem đặt chỗ</button></div>}
          {user.role !== 'STUDENT' && <p className="demo-message demo-info">Tài khoản này có quyền xem. Chức năng đặt xe dành cho sinh viên.</p>}
          <section className="demo-vehicles" aria-label="Danh sách xe">{vehicles.map(vehicle => <article className="demo-vehicle" key={vehicle.id}><div className="demo-vehicle-top"><span className={`demo-chip ${!vehicle.eligible ? 'muted' : ''}`}>{vehicle.status === 'DA_DAT' ? 'Đã có người đặt' : vehicle.eligible ? 'Sẵn sàng' : 'Chưa khả dụng'}</span><span>{vehicle.id}</span></div><img src="/images/vehicle.png" alt={vehicle.name}/><h3>{vehicle.name}</h3><p>Xe máy điện · Di chuyển trong khu đô thị</p><div className="demo-battery"><BatteryCharging size={20}/><strong>{vehicle.battery}% pin</strong>{vehicle.lowBattery && <span className="demo-warning">Pin thấp</span>}</div>{vehicle.lowBattery && <p className="demo-low-note">Nên chọn hành trình ngắn; ước tính quãng đường chưa tích hợp.</p>}<button className="demo-primary" disabled={!vehicle.eligible || Boolean(active) || user.role !== 'STUDENT' || busy} onClick={() => { setError(''); setDestination(''); setSelectedVehicle(vehicle); }}>Chọn xe này<Bike size={18}/></button></article>)}</section>
          {!vehicles.length && <div className="demo-empty"><Bike size={32}/><h3>Hub này chưa có xe dùng chung</h3><p>Bạn có thể chọn Hub khác trong danh sách phía trên.</p></div>}
        </> : <section className="demo-reservations">{!reservations.length && <div className="demo-empty"><Ticket size={36}/><h2>Chưa có đặt chỗ</h2><p>Chọn một chiếc xe để bắt đầu hành trình.</p><button className="demo-primary" onClick={() => setPage('explore')}>Khám phá Hub</button></div>}{reservations.map(reservation => <article key={reservation.id} className="demo-reservation"><div className="demo-reservation-heading"><span className={`demo-chip ${reservation.status !== 'DA_XAC_NHAN' ? 'muted' : ''}`}>{statusLabel[reservation.status]}</span><small>Mã {reservation.id.slice(0, 8).toUpperCase()}</small></div><div className="demo-reservation-content"><img src="/images/vehicle.png" alt={reservation.vehicle_name}/><div><h2>{reservation.vehicle_name}</h2><p>{reservation.vehicle_id} · {reservation.battery}% pin</p><p><MapPin size={16}/>Nhận tại {reservation.source_name}</p><p><Ticket size={16}/>{reservation.destination_name ? `Chỗ đích: ${reservation.destination_name} · ${reservation.destination_spot_id}` : 'Chưa giữ chỗ trả xe'}</p><p><Clock size={16}/>Hạn nhận: {formatTime(reservation.expires_at)}</p></div></div>{reservation.status === 'DA_XAC_NHAN' && <div className="demo-reservation-footer"><div className="demo-countdown"><Clock size={18}/><Countdown expiresAt={reservation.expires_at}/></div><button className="demo-danger" disabled={busy} onClick={() => { setError(''); setCancelTarget(reservation); }}>Hủy đặt chỗ</button></div>}</article>)}</section>}
      </>}
      <footer className="demo-footer">PikePike · Đi xanh mỗi ngày<span>ĐHQG-HCM</span></footer>
    </main>
    <dialog ref={modalRef} className="demo-dialog" onCancel={event => { event.preventDefault(); closeModal(); }} aria-labelledby="demo-dialog-title"><div className="demo-dialog-content"><button className="demo-dialog-close demo-icon" aria-label="Đóng hộp thoại" disabled={busy} onClick={closeModal}><X size={20}/></button>{selectedVehicle ? <><span className="demo-chip">Giữ xe 15 phút</span><h2 id="demo-dialog-title">Xác nhận đặt xe</h2><p>{selectedVehicle.name} · {selectedVehicle.battery}% pin</p><label>Hub trả xe dự kiến<select value={destination} onChange={e => setDestination(e.target.value)}><option value="">Chưa chọn Hub đích</option>{hubs.map(h => <option key={h.id} value={h.id} disabled={h.blocked}>{h.name} · {h.empty} chỗ trống{h.blocked ? ' · Đã đầy' : ''}</option>)}</select></label><div className="demo-message demo-info"><Clock size={20}/><span>{destination ? 'Một chỗ đỗ tại Hub đích sẽ được giữ cùng xe.' : 'Chỗ đỗ trả xe chưa được giữ trước.'}</span></div><p>Đến nhận trong 15 phút. Hai lần không nhận xe trong ngày sẽ khóa quyền đặt chỗ 24 giờ.</p>{errorBox}<button className="demo-primary" disabled={busy} onClick={() => void reserve()}>{busy ? 'Đang giữ xe…' : 'Xác nhận đặt xe'}</button></> : cancelTarget ? <><span className="demo-chip muted">Quản lý đặt chỗ</span><h2 id="demo-dialog-title">Bạn muốn hủy đặt xe?</h2><p>{cancelTarget.vehicle_name} · {cancelTarget.source_name}</p><p>Xe và chỗ đích đã giữ sẽ được giải phóng. Hủy trước hạn không tính là vi phạm không nhận xe.</p>{errorBox}<button className="demo-danger demo-wide" disabled={busy} onClick={() => void cancel()}>{busy ? 'Đang hủy…' : 'Xác nhận hủy đặt chỗ'}</button><button className="demo-secondary" disabled={busy} onClick={closeModal}>Giữ lại đặt chỗ</button></> : null}</div></dialog>
  </div>;
}
