import { useEffect, useState } from 'react';
import { api, type Hub } from './account-api';

type Profile = { hoTen: string; thongTinLienHe: string };
type Vehicle = {
  id: string;
  plate: string;
  model: string;
  status: string;
  version: number;
  reason?: string;
};
export function QuanLyHoSo({ role }: { role: string }) {
  const [profile, setProfile] = useState<Profile>({
    hoTen: '',
    thongTinLienHe: '',
  });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [maHub, setHub] = useState('');
  const [bienSo, setPlate] = useState('');
  const [mauXe, setModel] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const student = role === 'STUDENT';
  const loadVehicles = () =>
    api<Vehicle[]>('/private-vehicles').then(setVehicles);
  useEffect(() => {
    void Promise.all([
      loadVehicles(),
      ...(student
        ? [
            api<Profile>('/me/profile').then((data) => {
              setProfile(data);
              setProfileLoaded(true);
            }),
            api<Hub[]>('/hubs').then((data) => {
              setHubs(data);
              setHub(data[0]?.id ?? '');
            }),
          ]
        : []),
    ]).catch((reason) => setError(reason.message));
  }, [student]);
  async function run(work: () => Promise<void>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      setMessage(success);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <p role="alert" className="note">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {student && (
        <>
          {profileLoaded && (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  async () =>
                    setProfile(await api('/me/profile', profile, 'PUT')),
                  'Đã cập nhật hồ sơ',
                );
              }}
            >
              <h2>Hồ sơ sinh viên</h2>
              <label className="field">
                Họ tên
                <input
                  required
                  value={profile.hoTen}
                  onChange={(e) =>
                    setProfile({ ...profile, hoTen: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Thông tin liên hệ
                <input
                  required
                  value={profile.thongTinLienHe}
                  onChange={(e) =>
                    setProfile({ ...profile, thongTinLienHe: e.target.value })
                  }
                />
              </label>
              <button className="btn" disabled={busy}>
                Lưu hồ sơ
              </button>
            </form>
          )}
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('/private-vehicles', { bienSo, mauXe, maHub });
                setPlate('');
                setModel('');
                await loadVehicles();
              }, 'Đã gửi xe chờ duyệt');
            }}
          >
            <h2>Khai báo xe cá nhân</h2>
            <label className="field">
              Biển số
              <input
                required
                value={bienSo}
                onChange={(e) => setPlate(e.target.value)}
              />
            </label>
            <label className="field">
              Mẫu xe
              <input
                required
                value={mauXe}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
            <label className="field">
              Hub
              <select value={maHub} onChange={(e) => setHub(e.target.value)}>
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" disabled={busy || !maHub}>
              Gửi khai báo
            </button>
          </form>
        </>
      )}
      <div className="section">
        <h2>{student ? 'Xe cá nhân của tôi' : 'Duyệt xe cá nhân'}</h2>
      </div>
      {!vehicles.length && <p>Chưa có hồ sơ xe.</p>}
      {vehicles.map((v) => (
        <div className="card" key={v.id}>
          <h3>
            {v.plate} · {v.model}
          </h3>
          <p>
            {v.status === 'PENDING'
              ? 'Chờ duyệt'
              : v.status === 'APPROVED'
                ? 'Đã duyệt'
                : 'Đã từ chối'}
          </p>
          {v.reason && <p>{v.reason}</p>}
          {!student && v.status === 'PENDING' && (
            <>
              <label className="field">
                Lý do nếu từ chối
                <input
                  value={reasons[v.id] ?? ''}
                  onChange={(e) =>
                    setReasons({ ...reasons, [v.id]: e.target.value })
                  }
                />
              </label>
              {(['APPROVED', 'REJECTED'] as const).map((decision) => (
                <button
                  key={decision}
                  className="btn"
                  disabled={
                    busy || (decision === 'REJECTED' && !reasons[v.id]?.trim())
                  }
                  onClick={() =>
                    void run(async () => {
                      await api(
                        '/private-vehicles/' +
                          encodeURIComponent(v.id) +
                          '/review',
                        {
                          quyetDinh: decision,
                          phienBanDaMo: v.version,
                          ...(decision === 'REJECTED' && {
                            lyDo: reasons[v.id],
                          }),
                        },
                      );
                      await loadVehicles();
                    }, 'Đã cập nhật quyết định')
                  }
                >
                  {decision === 'APPROVED' ? 'Duyệt xe' : 'Từ chối'}
                </button>
              ))}
            </>
          )}
        </div>
      ))}
    </>
  );
}
