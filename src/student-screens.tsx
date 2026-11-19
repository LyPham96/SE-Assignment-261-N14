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
                    : 'Hết hạn'}
              </p>
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
      body = <GiaoDienChuyenDi go={go} />;
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

export function GiaoDienChuyenDi({ go }: { go: Props['go'] }) {
  return (
    <div className="card">
      <p>Chức năng này chưa có API trong M2.</p>
      <Primary title="Xem đặt chỗ của tôi" onClick={() => go('reservations')} />
    </div>
  );
}
