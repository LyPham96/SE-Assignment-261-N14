import { useEffect, useState } from 'react';
import { ArrowRight, Bike, MapPin } from 'lucide-react';
import { api, type Hub, type Vehicle, type Reservation } from './account-api';

export const studentScreens = [
  'home',
  'hub',
  'vehicle',
  'book',
  'reservations',
  'cancel',
  'parking',
  'edit',
  'unlock',
  'trip',
  'return',
] as const;
type StudentScreen = (typeof studentScreens)[number];
type Props = {
  screen: StudentScreen;
  go: (screen: StudentScreen | 'charge') => void;
  notify: (message: string) => void;
  student: boolean;
};
function Primary({
  title,
  onClick,
  disabled = false,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="btn" onClick={onClick} disabled={disabled}>
      {title}
      <ArrowRight size={17} />
    </button>
  );
}
function HubCard({ hub, onSelect }: { hub: Hub; onSelect: () => void }) {
  return (
    <button className="card hub-card" onClick={onSelect}>
      <div className="hub-symbol">
        <MapPin size={22} />
      </div>
      <div>
        <h3>{hub.name}</h3>
        <p>
          {hub.available} xe khả dụng · {hub.empty} chỗ trống
        </p>
      </div>
      <ArrowRight size={17} />
    </button>
  );
}

export function GiaoDienHub({ screen, go, notify, student }: Props) {
  const [hubs, setHubs] = useState<Hub[]>();
  const [vehicles, setVehicles] = useState<Vehicle[]>();
  const [reservations, setReservations] = useState<Reservation[]>();
  const [hubId, setHubId] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle>();
  const [destination, setDestination] = useState('');
  const [reservation, setReservation] = useState<Reservation>();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hub = hubs?.find((item) => item.id === hubId) ?? hubs?.[0];
  useEffect(() => {
    let active = true;
    setError('');
    const fail = (reason: Error) => {
      if (active) setError(reason.message);
    };
    if (['home', 'hub', 'vehicle', 'book'].includes(screen)) {
      void api<Hub[]>('/hubs').then((data) => {
        if (active) setHubs(data);
      }, fail);
    }
    if (['reservations', 'cancel'].includes(screen)) {
      void api<Reservation[]>('/me/reservations').then((data) => {
        if (active) setReservations(data);
      }, fail);
    }
    return () => {
      active = false;
    };
  }, [screen]);
  useEffect(() => {
    if (!hub || !['hub', 'vehicle'].includes(screen)) return;
    let active = true;
    setVehicles(undefined);
    void api<Vehicle[]>(
      '/hubs/' + encodeURIComponent(hub.id) + '/vehicles',
    ).then(
      (data) => {
        if (active) setVehicles(data);
      },
      (reason: Error) => {
        if (active) setError(reason.message);
      },
    );
    return () => {
      active = false;
    };
  }, [hub?.id, screen]);
  async function submit(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Không thể thực hiện yêu cầu.',
      );
    } finally {
      setBusy(false);
    }
  }
  let body;
  switch (screen) {
    case 'home':
      body = (
        <div className="explore-layout">
          <h1>Bạn muốn đi đâu?</h1>
          <div className="search glass-search">
            <input
              aria-label="Tìm Hub"
              placeholder="Tìm Hub"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="service-switch">
            <button onClick={() => go('vehicle')}>
              <Bike />
              Thuê xe
            </button>
            <button onClick={() => go('charge')}>Sạc xe</button>
          </div>
          <div className="section">
            <h2>Hub phục vụ</h2>
          </div>
          {hubs
            ?.filter((item) =>
              item.name.toLowerCase().includes(search.trim().toLowerCase()),
            )
            .map((item) => (
              <HubCard
                key={item.id}
                hub={item}
                onSelect={() => {
                  setHubId(item.id);
                  go('hub');
                }}
              />
            ))}
        </div>
      );
      break;
    case 'hub':
    case 'vehicle':
      body = (
        <>
          <label className="field">
            <span>Hub nhận xe</span>
            <select
              value={hub?.id ?? ''}
              onChange={(e) => setHubId(e.target.value)}
            >
              {hubs?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {vehicles?.map((item) => (
            <div key={item.id} className="card vehicle short">
              <h3>{item.name}</h3>
              <p>
                {item.battery}% pin ·{' '}
                {item.eligible ? 'Có thể đặt' : 'Không khả dụng'}
              </p>
              {student && (
                <Primary
                  title="Chọn xe này"
                  disabled={!item.eligible}
                  onClick={() => {
                    setVehicle(item);
                    setDestination('');
                    go('book');
                  }}
                />
              )}
            </div>
          ))}
          {vehicles?.length === 0 && <p>Hub chưa có xe.</p>}
        </>
      );
      break;
    case 'book':
      body = vehicle ? (
        <>
          <div className="card">
            <h2>{vehicle.name}</h2>
            <p>
              {hub?.name} · {vehicle.battery}% pin
            </p>
            <label className="field">
              <span>Hub trả xe dự kiến</span>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">Chưa chọn</option>
                {hubs?.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.blocked}>
                    {item.name} · {item.empty} chỗ
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Primary
            title="Xác nhận đặt xe"
            disabled={busy || !student}
            onClick={() =>
              void submit(async () => {
                await api('/reservations/shared', {
                  vehicleId: vehicle.id,
                  ...(destination && { destinationHubId: destination }),
                });
                notify('Đặt xe thành công');
                go('reservations');
              })
            }
          />
        </>
      ) : (
        <Primary title="Chọn xe" onClick={() => go('vehicle')} />
      );
      break;
    case 'reservations':
      body = (
        <>
          {reservations?.map((item) => (
            <div key={item.id} className="card booking-card">
              <h2>{item.vehicle_name}</h2>
              <p>
                {item.source_name}
                {item.destination_name && ' → ' + item.destination_name}
              </p>
              <p>
                {item.status === 'DA_XAC_NHAN'
                  ? 'Đã giữ xe'
                  : item.status === 'DA_HUY'
                    ? 'Đã hủy'
                    : item.status === 'DA_NHAN'
                      ? 'Đã nhận xe'
                      : 'Hết hạn'}
              </p>
              {item.status === 'DA_XAC_NHAN' && (
                <Primary
                  title="Nhận xe"
                  onClick={() => {
                    setReservation(item);
                    go('unlock');
                  }}
                />
              )}
              {item.status === 'DA_XAC_NHAN' && (
                <Primary
                  title="Hủy đặt chỗ"
                  onClick={() => {
                    setReservation(item);
                    go('cancel');
                  }}
                />
              )}
            </div>
          ))}
          {reservations?.length === 0 && <p>Chưa có đặt chỗ.</p>}
        </>
      );
      break;
    case 'cancel':
      body = reservation ? (
        <div className="card">
          <h2>{reservation.vehicle_name}</h2>
          <p>{reservation.source_name}</p>
          <Primary
            title="Xác nhận hủy đặt chỗ"
            disabled={busy}
            onClick={() =>
              void submit(async () => {
                await api(
                  '/reservations/' +
                    encodeURIComponent(reservation.id) +
                    '/cancel',
                  {},
                );
                setReservation(undefined);
                notify('Đã hủy đặt chỗ');
                go('reservations');
              })
            }
          />
          <button className="btn secondary" onClick={() => go('reservations')}>
            Giữ lại đặt chỗ
          </button>
        </div>
      ) : (
        <Primary
          title="Xem đặt chỗ của tôi"
          onClick={() => go('reservations')}
        />
      );
      break;
    default:
      body = (
        <GiaoDienChuyenDi
          screen={screen}
          reservation={reservation}
          go={go}
          notify={notify}
        />
      );
  }
  return (
    <>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {body}
    </>
  );
}

type TripView = {
  id: string;
  vehicle_name: string;
  started_at: string;
  ended_at?: string;
  fee?: string;
};
type ReturnSpot = { id: string; hub_name: string };
export function GiaoDienChuyenDi({
  screen,
  reservation,
  go,
  notify,
}: {
  screen: StudentScreen;
  reservation?: Reservation;
  go: Props['go'];
  notify: Props['notify'];
}) {
  const [trips, setTrips] = useState<TripView[]>([]);
  const [spots, setSpots] = useState<ReturnSpot[]>([]);
  const [spot, setSpot] = useState('');
  const [code, setCode] = useState('');
  const [shownCode, setShownCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<TripView>();
  const [reporting,setReporting]=useState(false);
  const [location,setLocation]=useState('');
  const [description,setDescription]=useState('');
  const active = trips.find((trip) => !trip.ended_at);
  useEffect(() => {
    setError('');
    if (screen === 'trip' || screen === 'return') {
      void api<TripView[]>('/me/trips').then(setTrips, (reason) =>
        setError(reason.message),
      );
    }
  }, [screen]);
  useEffect(() => {
    if (screen !== 'return' || !active?.id) return;
    void api<ReturnSpot[]>(
      '/trips/' + encodeURIComponent(active.id) + '/spots',
    ).then(
      (items) => {
        setSpots(items);
        setSpot(items[0]?.id ?? '');
      },
      (reason) => setError(reason.message),
    );
  }, [screen, active?.id]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  let content;
  if (screen === 'unlock') {
    content = reservation ? (
      <div className="card">
        <h2>{reservation.vehicle_name}</h2>
        <Primary
          title="Xem mã mở khóa"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              setShownCode(
                (
                  await api<{ maMoKhoa: string }>(
                    '/reservations/' + reservation.id + '/unlock-code',
                  )
                ).maMoKhoa,
              ),
            )
          }
        />
        {shownCode && (
          <p>
            Mã mở khóa: <strong>{shownCode}</strong>
          </p>
        )}
        <label className="field">
          Mã mở khóa
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <Primary
          title="Nhận xe"
          disabled={busy || !/^\d{6}$/.test(code)}
          onClick={() =>
            void run(async () => {
              await api('/reservations/' + reservation.id + '/pickup', {
                maMoKhoa: code,
              });
              setCode('');
              setShownCode('');
              notify('Đã nhận xe');
              go('trip');
            })
          }
        />
      </div>
    ) : (
      <Primary
        title="Chọn đặt chỗ để nhận xe"
        onClick={() => go('reservations')}
      />
    );
  } else if (screen === 'trip') {
    content = active ? (
      <div className="card">
        <h2>{active.vehicle_name}</h2>
        <p>
          Đã nhận xe lúc {new Date(active.started_at).toLocaleString('vi-VN')}
        </p>
        <Primary title="Trả xe" onClick={() => go('return')} />
        <button className="btn secondary" onClick={()=>setReporting(value=>!value)}>Báo xe hỏng dọc đường</button>
        {reporting&&<>
          <label className="field">Vị trí sự cố<input value={location} onChange={e=>setLocation(e.target.value)}/></label>
          <label className="field">Mô tả sự cố<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label>
          <Primary title="Gửi báo cáo và kết thúc chuyến" disabled={busy||!location.trim()||!description.trim()} onClick={()=>void run(async()=>{
            const incident=await api<{maSuCo:string}>('/trips/'+active.id+'/breakdown',{toaDoViTri:location,moTaSuCo:description});
            setTrips(await api('/me/trips'));
            setReporting(false);notify('Đã báo sự cố '+incident.maSuCo);
          })}/>
        </>}
      </div>
    ) : (
      <p>Không có chuyến đi đang chạy.</p>
    );
  } else if (screen === 'return') {
    content = finished ? (
      <div className="card">
        <h2>Đã trả xe</h2>
        <p>Chi phí: {Number(finished.fee ?? 0).toLocaleString('vi-VN')} ₫</p>
      </div>
    ) : active ? (
      <div className="card">
        <h2>{active.vehicle_name}</h2>
        <label className="field">
          Chỗ trả xe
          <select value={spot} onChange={(e) => setSpot(e.target.value)}>
            {spots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.hub_name} · {item.id}
              </option>
            ))}
          </select>
        </label>
        <p>Cắm cáp sạc tại chỗ đã chọn trước khi xác nhận.</p>
        <Primary
          title="Xác nhận trả xe"
          disabled={busy || !spot}
          onClick={() =>
            void run(async () => {
              setFinished(
                await api('/trips/' + active.id + '/return', { maChoDo: spot }),
              );
              notify('Đã hoàn tất chuyến đi');
            })
          }
        />
      </div>
    ) : (
      <p>Không có chuyến đi đang chạy.</p>
    );
  } else
    content = (
      <div className="card">
        <p>Chức năng này chưa có API trong M2.</p>
        <Primary
          title="Xem đặt chỗ của tôi"
          onClick={() => go('reservations')}
        />
      </div>
    );
  return (
    <>
      {error && (
        <p role="alert" className="note">
          {error}
        </p>
      )}
      {content}
    </>
  );
}
