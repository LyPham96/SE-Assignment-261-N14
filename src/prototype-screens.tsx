import { useEffect, useState } from "react";
import { api, type Hub, type Reservation } from "./account-api";

type Parking = {
  id: string;
  plate: string;
  hub_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
};
type PrivateVehicle = { id: string; plate: string; status: string };
type Account = {
  id?: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  version?: number;
  student_code?: string;
};
type Config = {
  id: string;
  name: string;
  capacity: number;
  charging_count: number;
  charging_rate: number;
  version: number;
};
type History = {
  id: string;
  type: string;
  started: string;
  ended?: string;
  cost?: string;
  resource: string;
};
const time = (value: string) => new Date(value).toLocaleString();

export function PrototypeScreen({
  screen,
}: {
  screen: "parking" | "edit" | "history" | "accounts" | "hubConfig";
}) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [hubs, setHubs] = useState<Hub[]>([]),
    [hubId, setHubId] = useState("");
  const [vehicles, setVehicles] = useState<PrivateVehicle[]>([]),
    [vehicleId, setVehicleId] = useState("");
  const [parking, setParking] = useState<Parking[]>([]),
    [reservations, setReservations] = useState<Reservation[]>([]);
  const [startsAt, setStartsAt] = useState(""),
    [duration, setDuration] = useState(60);
  const [users, setUsers] = useState<Account[]>([]),
    [account, setAccount] = useState<Account>({
      username: "",
      name: "",
      role: "STUDENT",
      active: true,
    });
  const [password, setPassword] = useState(""),
    [studentCode, setStudentCode] = useState("");
  const [configs, setConfigs] = useState<Config[]>([]),
    [config, setConfig] = useState<Config>();
  const [history, setHistory] = useState<History[]>([]),
    [kind, setKind] = useState("ALL"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [detail, setDetail] = useState<History>();
  async function loadHistory() {
    const query = new URLSearchParams({ type: kind });
    if (from) query.set("from", new Date(from).toISOString());
    if (to) query.set("to", new Date(to).toISOString());
    setHistory(await api("/me/history?" + query));
    setDetail(undefined);
  }
  async function load() {
    if (screen === "parking" || screen === "edit") {
      const [hs, vs, ps, rs] = await Promise.all([
        api<Hub[]>("/hubs"),
        api<PrivateVehicle[]>("/private-vehicles"),
        api<Parking[]>("/parking"),
        api<Reservation[]>("/me/reservations"),
      ]);
      setHubs(hs);
      setHubId((current) => current || hs[0]?.id || "");
      setVehicles(vs.filter((v) => v.status === "APPROVED"));
      setVehicleId(
        (current) =>
          current || vs.find((v) => v.status === "APPROVED")?.id || "",
      );
      setParking(ps);
      setReservations(rs);
    } else if (screen === "accounts") setUsers(await api("/admin/users"));
    else if (screen === "hubConfig") setConfigs(await api("/admin/hubs"));
    else await loadHistory();
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [screen]);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await load();
      setMessage("Đã lưu thay đổi");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const hubSelect = (
    <label className="field">
      Hub đích
      <select value={hubId} onChange={(e) => setHubId(e.target.value)}>
        {hubs.map((h) => (
          <option key={h.id} value={h.id} disabled={h.blocked}>
            {h.name} · {h.empty} chỗ trống
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      {error && (
        <p role="alert" className="note">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {(screen === "parking" || screen === "edit") && (
        <>
          {hubSelect}
          {screen === "parking" && (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  api("/parking", {
                    vehicleId,
                    hubId,
                    startsAt: new Date(startsAt).toISOString(),
                    durationMinutes: duration,
                  }),
                );
              }}
            >
              <h2>Đặt chỗ đỗ xe cá nhân</h2>
              <p>
                Chỉ xe đã duyệt được đặt chỗ. Chỗ được giữ đến hết khung giờ đã
                đăng ký.
              </p>
              <label className="field">
                Xe cá nhân
                <select
                  required
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                >
                  <option value="">Chọn xe</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Thời gian đến
                <input
                  required
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </label>
              <label className="field">
                Thời lượng đỗ (phút)
                <input
                  required
                  type="number"
                  min="1"
                  max="1440"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <button className="btn" disabled={busy || !vehicleId || !hubId}>
                Xác nhận đặt chỗ đỗ
              </button>
            </form>
          )}
          {screen === "edit" &&
            reservations
              .filter((r) => r.status === "DA_XAC_NHAN")
              .map((r) => (
                <div className="card" key={r.id}>
                  <h3>{r.vehicle_name}</h3>
                  <p>{r.destination_name || "Chưa giữ chỗ đích"}</p>
                  <button
                    className="btn"
                    disabled={busy || !hubId}
                    onClick={() =>
                      void run(() =>
                        api(
                          "/reservations/" + r.id + "/destination",
                          { hubId },
                          "PUT",
                        ),
                      )
                    }
                  >
                    Đổi Hub trả xe
                  </button>
                </div>
              ))}
          <h2>Chỗ đỗ cá nhân của tôi</h2>
          {!parking.length && <p>Chưa có đặt chỗ đỗ.</p>}
          {parking.map((p) => (
            <div className="card" key={p.id}>
              <h3>
                {p.plate} · {p.hub_name}
              </h3>
              <p>
                {time(p.starts_at)} – {time(p.ends_at)}
              </p>
              <p>{p.status}</p>
              {p.status === "DA_XAC_NHAN" && (
                <>
                  <button
                    className="btn"
                    disabled={busy || !hubId}
                    onClick={() =>
                      void run(() => api("/parking/" + p.id, { hubId }, "PUT"))
                    }
                  >
                    Đổi Hub đỗ
                  </button>
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Xác nhận hủy đặt chỗ đỗ?"))
                        void run(() =>
                          api("/parking/" + p.id, { cancel: true }, "PUT"),
                        );
                    }}
                  >
                    Hủy chỗ đỗ
                  </button>
                </>
              )}
            </div>
          ))}
        </>
      )}
      {screen === "history" && (
        <>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(loadHistory);
            }}
          >
            <h2>Lịch sử sử dụng</h2>
            <label className="field">
              Loại hoạt động
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {[
                  ["ALL", "Tất cả"],
                  ["TRIP", "Chuyến đi"],
                  ["RESERVATION", "Đặt xe"],
                  ["PARKING", "Chỗ đỗ"],
                  ["CHARGING", "Sạc"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Từ ngày
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field">
              Đến ngày
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button className="btn" disabled={busy}>
              Lọc lịch sử
            </button>
          </form>
          {!history.length && <p>Chưa có dữ liệu.</p>}
          {history.map((r) => (
            <button
              className="card"
              key={r.type + r.id}
              onClick={() => setDetail(r)}
            >
              {r.type} · {r.resource} · {time(r.started)}
            </button>
          ))}
          {detail && (
            <div className="card">
              <h3>Chi tiết hoạt động</h3>
              <p>{detail.id}</p>
              <p>{detail.resource}</p>
              <p>
                {time(detail.started)} –{" "}
                {detail.ended ? time(detail.ended) : "Đang diễn ra"}
              </p>
              <p>
                Chi phí:{" "}
                {detail.cost == null
                  ? "Đang tính chi phí"
                  : Number(detail.cost).toLocaleString("vi-VN") + " đ"}
              </p>
            </div>
          )}
        </>
      )}
      {screen === "accounts" && (
        <>
          <h2>Quản lý tài khoản</h2>
          <button
            className="btn secondary"
            onClick={() => {
              setAccount({
                username: "",
                name: "",
                role: "STUDENT",
                active: true,
              });
              setPassword("");
              setStudentCode("");
            }}
          >
            Tạo tài khoản mới
          </button>
          {users.map((u) => (
            <button
              className="card"
              key={u.id}
              onClick={() => {
                setAccount(u);
                setPassword("");
                setStudentCode(u.student_code || "");
              }}
            >
              {u.name} · {u.role} · {u.active ? "Hoạt động" : "Vô hiệu hóa"}
            </button>
          ))}
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !window.confirm(
                  "Xác nhận lưu tài khoản và thu hồi phiên đăng nhập cũ?",
                )
              )
                return;
              void run(async () => {
                await api(
                  "/admin/users" + (account.id ? "/" + account.id : ""),
                  {
                    username: account.username,
                    name: account.name,
                    role: account.role,
                    ...(studentCode && { studentCode }),
                    ...(password && { password }),
                    ...(account.id && {
                      version: account.version,
                      active: account.active,
                    }),
                  },
                  account.id ? "PUT" : "POST",
                );
                setPassword("");
                setAccount({username:'',name:'',role:'STUDENT',active:true});
                setStudentCode('');
              });
            }}
          >
            <label className="field">
              Tên đăng nhập
              <input
                required
                value={account.username}
                onChange={(e) =>
                  setAccount({ ...account, username: e.target.value })
                }
              />
            </label>
            <label className="field">
              Tên tài khoản
              <input
                required
                value={account.name}
                onChange={(e) =>
                  setAccount({ ...account, name: e.target.value })
                }
              />
            </label>
            <label className="field">
              Vai trò
              <select
                value={account.role}
                onChange={(e) =>
                  setAccount({ ...account, role: e.target.value })
                }
              >
                {["STUDENT", "ADMIN", "OPERATIONS", "TECHNICIAN"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            {account.role === "STUDENT" && (
              <label className="field">
                Mã sinh viên
                <input
                  required
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              Mật khẩu khởi tạo / đặt lại
              <input
                type="password"
                minLength={8}
                required={!account.id}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              Trạng thái
              <select
                value={String(account.active)}
                onChange={(e) =>
                  setAccount({ ...account, active: e.target.value === "true" })
                }
              >
                <option value="true">Hoạt động</option>
                <option value="false">Vô hiệu hóa</option>
              </select>
            </label>
            <button className="btn" disabled={busy}>
              Lưu tài khoản
            </button>
          </form>
        </>
      )}
      {screen === "hubConfig" && (
        <>
          <h2>Cấu hình Hub</h2>
          {configs.map((h) => (
            <button className="card" key={h.id} onClick={() => setConfig(h)}>
              {h.name} · {h.capacity} chỗ · {h.charging_count} cổng
            </button>
          ))}
          {config && (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                if (window.confirm("Xác nhận cập nhật cấu hình Hub?"))
                  void run(async () => {
                    await api(
                      "/admin/hubs/" + config.id,
                      {
                        capacity: config.capacity,
                        chargingCount: config.charging_count,
                        chargingRate: config.charging_rate,
                        version: config.version,
                        confirmed: true,
                      },
                      "PUT",
                    );
                    setConfig(undefined);
                  });
              }}
            >
              <h3>{config.name}</h3>
              {(
                [
                  ["capacity", "Số chỗ đỗ"],
                  ["charging_count", "Số cổng sạc"],
                  ["charging_rate", "Tốc độ sạc (% / phút)"],
                ] as const
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  {label}
                  <input
                    type="number"
                    required
                    min={key === "charging_rate" ? 0.01 : 0}
                    max={key === "capacity" ? 500 : 100}
                    step={key === "charging_rate" ? 0.01 : 1}
                    value={config[key]}
                    onChange={(e) =>
                      setConfig({ ...config, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
              <button className="btn" disabled={busy}>
                Lưu cấu hình Hub
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Đặt lại 20 chỗ, 2 cổng, tốc độ 2%/phút?"))
                    void run(async () => {
                      await api(
                        "/admin/hubs/" + config.id,
                        {
                          version: config.version,
                          confirmed: true,
                          reset: true,
                        },
                        "PUT",
                      );
                      setConfig(undefined);
                    });
                }}
              >
                Đặt lại mặc định
              </button>
            </form>
          )}
        </>
      )}
    </>
  );
}
