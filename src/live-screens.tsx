import { DashboardUI } from './layouts';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  Check,
  ChevronRight,
  Clock,
  MapPin,
  Play,
  Truck,
  Zap,
} from 'lucide-react';

type Item = { id: string; name?: string };
type Resource = Item & { hubId: string; status: string; battery?: number };
type Alert = {
  id: string;
  hubId: string;
  level: string;
  ratio: number;
  updatedAt: number;
  closedAt?: number;
  resource: string;
};
type Incident = {
  id: string;
  resourceId: string;
  description: string;
  status: string;
  repair?: string;
  technician?: string;
};
type Scenario = {
  id: string;
  versionNo: number;
  params: {
    code: string;
    hubIds: string[];
    eventType: string;
    intensity: number;
    durationMin: number;
  };
};
type Run = {
  id: string;
  status: string;
  progressPct: number;
  snapshotId: string;
  stopReason?: string;
  metrics: {
    hubId: string;
    requested: number;
    fulfilled: number;
    overloadMinutes: number;
    lowBattery: number;
  }[];
};
type Recommendation = {
  id: string;
  type: string;
  hubId: string;
  otherHubId?: string;
  quantity?: number;
  status: string;
  stillValid: boolean;
};
type RunView = {
  run: Run;
  applicable: boolean;
  recommendations: Recommendation[];
};
type Order = {
  id: string;
  vehicleIds: string[];
  sourceHubId: string;
  destHubId: string;
  status: string;
  technicianId?: string;
};
type HubStatus = {
  hub: Item;
  vehicles: Resource[];
  spots: Resource[];
  points: Resource[];
  ratio: number;
  dataStatus: string;
  lastUpdated: number | null;
  alerts: Alert[];
};
export type Identity = {
  id: string;
  role: 'STUDENT' | 'OPERATOR' | 'TECHNICIAN' | 'ADMIN';
  hubs: Item[];
  vehicles: Resource[];
  trips: { id: string; vehicleId: string; hubId: string }[];
};
export type Api = <T>(
  path: string,
  body?: object,
  method?: string,
) => Promise<T>;
export const createApi =
  (token?: string): Api =>
  async (path, body, method) => {
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
    const reply = await fetch(base + '/api/v1' + path, {
      method: method ?? (body ? 'POST' : 'GET'),
      credentials: 'include',
      headers: {
        ...(token && { Authorization: 'Bearer ' + token }),
        ...(body && { 'X-PikePike-Request': '1' }),
        ...(body && { 'Content-Type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
    });
    if (reply.status === 204) return undefined as never;
    const value = await reply.json();
    if (!reply.ok) {
      const fields =
        value.fieldErrors && !Array.isArray(value.fieldErrors)
          ? Object.entries(value.fieldErrors)
              .map(([key, reason]) => key + ': ' + reason)
              .join(', ')
          : '';
      throw new Error(
        fields ||
          (reply.status === 401
            ? 'Phiên không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.'
            : reply.status === 403
              ? 'Tài khoản không có quyền thực hiện thao tác này.'
              : value.code || 'Không thể thực hiện yêu cầu.'),
      );
    }
    return value;
  };
export const liveScreens = [
  'charge',
  'report',
  'dashboard',
  'resources',
  'alerts',
  'incident',
  'schedule',
  'transfer',
  'scenario',
  'simulation',
  'results',
  'apply',
  'operationsReport',
  'notifications',
] as const;
export type LiveScreen = (typeof liveScreens)[number];
const text: Record<string, string> = {
  AVAILABLE: 'Sẵn sàng',
  REBALANCING: 'Đang điều chuyển',
  IN_USE: 'Đang sử dụng',
  RESERVED: 'Đã giữ',
  OCCUPIED: 'Có xe',
  EMPTY: 'Trống',
  CHARGING: 'Đang sạc',
  DANG_SAC: 'Đang sạc',
  RANH: 'Rảnh',
  BROKEN: 'Bị lỗi',
  MOI: 'Mới',
  DANG_XU_LY: 'Đang xử lý',
  TU_CHOI: 'Từ chối',
  DA_DONG: 'Đã đóng',
  CHO_XEP_LICH: 'Chờ xếp lịch',
  DA_XEP_LICH: 'Đã xếp lịch',
  RUNNING: 'Đang mô phỏng',
  COMPLETED: 'Hoàn tất',
  INCOMPLETE: 'Chưa hoàn tất',
  TIMED_OUT: 'Quá thời gian',
  STALE: 'Dữ liệu cũ',
  UNKNOWN: 'Mất tín hiệu',
  FRESH: 'Đang cập nhật',
  REBALANCE: 'Điều chuyển xe',
  CHARGING_SCHEDULE: 'Lập lịch sạc',
  REDIRECT_STUDENTS: 'Hướng đến Hub khác',
  APPLIED: 'Đã áp dụng',
  SKIPPED: 'Bỏ qua',
  FAILED: 'Thất bại',
  NOT_APPLIED: 'Chưa áp dụng',
};
const label = (key: string) => text[key] ?? key;
const time = (value: number | null) =>
  value == null ? 'Chưa có bản tin' : new Date(value).toLocaleString('vi-VN');
const percent = (value: number) => Math.round(value * 100) + '%';
const pathId = encodeURIComponent;
const field = (title: string, children: ReactNode) => (
  <label className="field">
    <span>{title}</span>
    {children}
  </label>
);
const badge = (value: string) => <span className="badge">{label(value)}</span>;
const card = (children: ReactNode) => <div className="card">{children}</div>;
const option = (value: Item) => (
  <option key={value.id} value={value.id}>
    {value.name || value.id}
  </option>
);
const page = (eyebrow: string, title: string, description?: string) => (
  <div className="page-title">
    <span className="eyebrow">{eyebrow}</span>
    <h1>{title}</h1>
    {description && <p>{description}</p>}
  </div>
);
const readImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không thể đọc ảnh.'));
    reader.readAsDataURL(file);
  });
function useRead<T>(api: Api, path: string | null, interval = 0) {
  const [state, setState] = useState<{
    path: string;
    data?: T;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true;
    const load = () =>
      void api<T>(path).then(
        (data) => {
          if (active) setState({ path, data });
        },
        (error) => {
          if (active) setState({ path, error: error.message });
        },
      );
    load();
    const timer = interval ? window.setInterval(load, interval) : undefined;
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, path, interval, revision]);
  return {
    ...(state?.path === path ? state : undefined),
    refresh: () => setRevision((value) => value + 1),
  };
}

export function OperationsUI({
  screen,
  api,
  me,
  go,
  notify,
}: {
  screen: LiveScreen;
  api: Api;
  me: Identity;
  go: (screen: LiveScreen) => void;
  notify: (message: string) => void;
}) {
  const [hub, setHub] = useState(me.hubs[0]?.id ?? '');
  const [destination, setDestination] = useState(me.hubs[1]?.id ?? '');
  const [vehicle, setVehicle] = useState(me.vehicles[0]?.id ?? '');
  useEffect(()=>{
    if(!me.vehicles.some(item=>item.id===vehicle))setVehicle(me.vehicles[0]?.id??'');
  },[me.vehicles,vehicle]);
  const [filter, setFilter] = useState('vehicles');
  const [resourceType, setResourceType] = useState('XE');
  const [resourceId, setResourceId] = useState(me.trips[0]?.vehicleId ?? '');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [kind, setKind] = useState('OTHER');
  const [attachment, setAttachment] = useState<File>();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [target, setTarget] = useState('');
  const [incident, setIncident] = useState('');
  const [technician, setTechnician] = useState('');
  const [note, setNote] = useState('');
  const [proposal, setProposal] = useState<{
    source: string;
    destination: string;
    n: number;
    candidates: Resource[];
    key: string;
    rejectedReason?: string;
  }>();
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [scenario, setScenario] = useState<Scenario>();
  const [scenarioCode, setScenarioCode] = useState('');
  const [eventType, setEventType] = useState('DEMAND_SURGE');
  const [intensity, setIntensity] = useState('150');
  const [duration, setDuration] = useState('30');
  const [runId, setRunId] = useState('');
  const [sharedSnapshotId, setSharedSnapshotId] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [impact, setImpact] = useState<{
    key: string;
    vehiclesToRebalance: number;
    spotsToHold: number;
    schedulesChanged: number;
    notificationsToSend: number;
  }>();
  const [applied, setApplied] =
    useState<{ id: string; status: string; reason?: string }[]>();
  const [comparison, setComparison] = useState<RunView[]>();
  const [compareId, setCompareId] = useState('');
  const [reportHub, setReportHub] = useState('');
  const [report, setReport] = useState<{
    rows: {
      hubId: string;
      parkingRatioPeak: number;
      averageAvailableVehicles: number;
      averageChargingQueue: number;
      fulfilled: number;
      rejected: number;
      relatedRunIds?: string[];
    }[];
    relatedRunIds: string[];
  }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useCallback(async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Không thể kết nối máy chủ.',
      );
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    setError('');
    if (screen === 'charge' || screen === 'operationsReport') {
      setStart('');
      setEnd('');
    }
  }, [screen]);
  const network = useRead<HubStatus[]>(
    api,
    ['dashboard', 'resources'].includes(screen) ? '/dashboard' : null,
    5000,
  );
  const alerts = useRead<Alert[]>(
    api,
    screen === 'alerts' ? '/alerts' : null,
    5000,
  );
  const incidents = useRead<Incident[]>(
    api,
    screen === 'incident' ? '/incidents' : null,
  );
  const incidentID = incident || incidents.data?.[0]?.id || '';
  const detail = useRead<{ incident: Incident }>(
    api,
    screen === 'incident' && incidentID
      ? '/incidents/' + pathId(incidentID)
      : null,
  );
  const staff = useRead<Item[]>(
    api,
    screen === 'incident' && me.role === 'OPERATOR'
      ? '/operations/technicians'
      : null,
  );
  const orders = useRead<Order[]>(
    api,
    screen === 'transfer' ? '/rebalancing/orders' : null,
  );
  const schedule = useRead<{
    requests: {
      id: string;
      vehicleId: string;
      battery: number;
      status: string;
      reason?: string;
    }[];
    sessions: {
      requestId: string;
      pointId: string;
      start: number;
      end: number;
    }[];
  }>(
    api,
    screen === 'schedule' && hub
      ? '/charging/schedules?maHub=' + pathId(hub)
      : null,
    5000,
  );
  const charging = useRead<{
    mucPin: number;
    maChoDo?: string;
    congSac: Resource[];
  }>(
    api,
    screen === 'charge' && hub && vehicle
      ? '/charging/info?' + new URLSearchParams({ maHub: hub, maXe: vehicle })
      : null,
  );
  const scenarios = useRead<Scenario[]>(
    api,
    screen === 'scenario' ? '/scenarios' : null,
  );
  const templates = useRead<
    {
      code: string;
      eventType: string;
      intensity: number;
      durationMin: number;
    }[]
  >(api, screen === 'scenario' ? '/scenarios/templates' : null);
  const runs = useRead<Run[]>(
    api,
    ['simulation', 'results'].includes(screen) ? '/runs' : null,
    2000,
  );
  const result = useRead<RunView>(
    api,
    ['simulation', 'results', 'apply'].includes(screen) && runId
      ? '/runs/' + pathId(runId)
      : null,
    screen === 'simulation' ? 1000 : 0,
  );
  const notifications = useRead<
    { id: string; type: string; body: string; createdAt: number }[]
  >(api, screen === 'notifications' ? '/notifications' : null, 5000);
  const action = (
    title: string,
    fn: () => Promise<void>,
    disabled = false,
    secondary = false,
  ) => (
    <button
      className={secondary ? 'btn secondary' : 'btn'}
      disabled={busy || disabled}
      onClick={() => void query(fn)}
    >
      {title}
      <ArrowRight size={17} />
    </button>
  );
  const hubName = (id: string) => me.hubs.find((h) => h.id === id)?.name ?? id;
  const hubSelect = (title = 'Hub') =>
    field(
      title,
      <select
        value={hub}
        onChange={(e) => {
          setHub(e.target.value);
          setProposal(undefined);
        }}
      >
        {me.hubs.map(option)}
      </select>,
    );
  const input = (
    title: string,
    value: string,
    set: (value: string) => void,
    type = 'text',
  ) =>
    field(
      title,
      <input type={type} value={value} onChange={(e) => set(e.target.value)} />,
    );
  const loadScenario = (value: Scenario | undefined) => {
    setScenario(value);
    if (value) {
      setScenarioCode(value.params.code);
      setHub(value.params.hubIds[0] ?? hub);
      setEventType(value.params.eventType);
      setIntensity(String(value.params.intensity));
      setDuration(String(value.params.durationMin));
    }
  };
  const selectRun = (id: string) => {
    setRunId(id);
    setSelection([]);
    setImpact(undefined);
    setApplied(undefined);
    setComparison(undefined);
    setCompareId('');
  };
  const describe = (item: Recommendation) =>
    [
      hubName(item.hubId),
      item.otherHubId && hubName(item.otherHubId),
      item.quantity && item.quantity + ' xe',
    ]
      .filter(Boolean)
      .join(' · ');
  const reportWindow = () => ({
    start: new Date(start).getTime(),
    end: new Date(end).getTime(),
  });
  const current = result.data;
  function RebalancingTaskScreen() {
    return orders.data?.map((o) => (
      <div className="card" key={o.id}>
        <Truck size={18} />
        <h3>
          {hubName(o.sourceHubId)} → {hubName(o.destHubId)}
        </h3>
        {badge(o.status)}
        <p>{o.vehicleIds.join(', ')}</p>
        {o.technicianId === me.id &&
          ['ASSIGNED', 'IN_PROGRESS'].includes(o.status) && (
            <>
              {action('Hoàn tất điều chuyển', async () => {
                await api(
                  '/rebalancing/orders/' + pathId(o.id) + '/complete',
                  {},
                );
                orders.refresh();
                notify('Đã hoàn tất lệnh');
              })}
              {field(
                'Xe hỏng',
                <select
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                >
                  <option value="">Chọn xe</option>
                  {o.vehicleIds.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>,
              )}
              {input('Mô tả lỗi', description, setDescription)}
              {input('Vị trí sự cố', location, setLocation)}
              {action(
                'Báo xe hỏng',
                async () => {
                  await api(
                    '/rebalancing/orders/' + pathId(o.id) + '/vehicle-broken',
                    { vehicleId: resourceId, description, location },
                  );
                  orders.refresh();
                  notify('Đã báo xe hỏng');
                },
                !o.vehicleIds.includes(resourceId) ||
                  !description.trim() ||
                  !location.trim(),
                true,
              )}
            </>
          )}
      </div>
    ));
  }
  function ChargingUI(): ReactNode {
    let content: ReactNode;

    content = (
      <>
        {page('SẠC XE CÁ NHÂN', 'Đăng ký sạc')}
        {card(
          <>
            {hubSelect('Hub đăng ký sạc')}
            {field(
              'Phương tiện',
              <select
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
              >
                {me.vehicles.map(option)}
              </select>,
            )}
            {charging.data && (
              <p>
                Pin hiện tại {charging.data.mucPin}% ·{' '}
                {
                  charging.data.congSac.filter((p) => p.status === 'RANH')
                    .length
                }{' '}
                cổng rảnh
              </p>
            )}
            {!me.vehicles.length && <p>Chưa có xe cá nhân đã duyệt.</p>}
            {input('Pin mong muốn (%)', target, setTarget, 'number')}
            <div className="two-fields">
              {input('Giờ đến', start, setStart, 'datetime-local')}
              {input('Cần xe trước', end, setEnd, 'datetime-local')}
            </div>
          </>,
        )}
        {action(
          'Gửi yêu cầu sạc',
          async () => {
            const saved = await api<{ maYeuCauSac: string }>(
              '/charging/requests',
              {
                maXe: vehicle,
                maHub: hub,
                ...(target && { targetBattery: Number(target) }),
                ...(start && { khungGio: reportWindow() }),
              },
            );
            notify('Đã tiếp nhận yêu cầu sạc ' + saved.maYeuCauSac);
          },
          !vehicle || !hub || Boolean(start) !== Boolean(end),
        )}
      </>
    );

    return content;
  }
  function GiaoDienBaoSuCo(): ReactNode {
    let content: ReactNode;

    content = (
      <>
        {page('HỖ TRỢ CHUYẾN ĐI', 'Báo sự cố')}
        {card(
          <>
            {field(
              'Loại tài nguyên',
              <select
                value={resourceType}
                onChange={(e) => {
                  setResourceType(e.target.value);
                  setResourceId('');
                }}
              >
                <option value="XE">Xe</option>
                <option value="CONG_SAC">Cổng sạc</option>
              </select>,
            )}
            {resourceType === 'XE' && me.role === 'STUDENT'
              ? field(
                  'Xe trong chuyến đang chạy',
                  <select
                    value={resourceId}
                    onChange={(e) => setResourceId(e.target.value)}
                  >
                    <option value="">Chọn xe</option>
                    {me.trips.map((item) => (
                      <option key={item.id}>{item.vehicleId}</option>
                    ))}
                  </select>,
                )
              : input('Mã tài nguyên', resourceId, setResourceId)}
            {field(
              'Loại sự cố',
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="OTHER">Khác</option>
                <option value="DEVICE_FAILURE">Thiết bị không hoạt động</option>
                <option value="LOCK_FAILURE">Không mở được khóa</option>
              </select>,
            )}
            {input('Vị trí', location, setLocation)}
            {field(
              'Mô tả',
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />,
            )}
            {field(
              'Ảnh đính kèm',
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setAttachment(e.target.files?.[0])}
              />,
            )}
          </>,
        )}
        {action(
          'Gửi báo cáo sự cố',
          async () => {
            if (attachment && attachment.size > 512000)
              throw new Error('Ảnh vượt quá 500 KB.');
            const trip =
              resourceType === 'XE' &&
              me.trips.find((t) => t.vehicleId === resourceId);
            const saved = await api<{ maSuCo: string }>('/incidents', {
              loaiTaiNguyen: resourceType,
              maTaiNguyen: resourceId,
              loaiSuCo: kind,
              moTa: description,
              viTri: location,
              ...(trip && { maChuyenDi: trip.id }),
              ...(attachment && { anhDinhKem: await readImage(attachment) }),
            });
            setDescription('');
            notify('Đã tiếp nhận sự cố ' + saved.maSuCo);
          },
          !resourceId || !location.trim() || !description.trim(),
        )}
      </>
    );

    return content;
  }
  function RebalancingScreen(): ReactNode {
    let content: ReactNode;

    content = (
      <>
        {page('CÂN BẰNG MẠNG LƯỚI', 'Điều chuyển xe')}
        {me.role === 'OPERATOR' &&
          card(
            <>
              {hubSelect('Hub nguồn')}
              {field(
                'Hub đích',
                <select
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setProposal(undefined);
                  }}
                >
                  {me.hubs.map(option)}
                </select>,
              )}
              {action(
                'Tính đề xuất',
                async () => {
                  const value = await api<{
                    n: number;
                    candidates: Resource[];
                    rejectedReason?: string;
                  }>(
                    '/rebalancing/proposal?' +
                      new URLSearchParams({
                        sourceHubId: hub,
                        destHubId: destination,
                      }),
                  );
                  setProposal({
                    ...value,
                    source: hub,
                    destination,
                    key: crypto.randomUUID(),
                  });
                  setVehicleIds(
                    value.candidates.slice(0, value.n).map((v) => v.id),
                  );
                },
                !hub || !destination || hub === destination,
              )}
              {proposal && (
                <>
                  <div className="route">
                    <span>{hubName(proposal.source)}</span>
                    <ArrowRight />
                    <span>{hubName(proposal.destination)}</span>
                  </div>
                  <p>
                    {proposal.n} xe có thể chuyển{' '}
                    {proposal.rejectedReason && '· ' + proposal.rejectedReason}
                  </p>
                  {proposal.candidates.map((v) => (
                    <label className="check-row" key={v.id}>
                      <input
                        type="checkbox"
                        checked={vehicleIds.includes(v.id)}
                        disabled={
                          !vehicleIds.includes(v.id) &&
                          vehicleIds.length >= proposal.n
                        }
                        onChange={(e) =>
                          setVehicleIds((ids) =>
                            e.target.checked
                              ? [...ids, v.id]
                              : ids.filter((id) => id !== v.id),
                          )
                        }
                      />
                      {v.id} · {v.battery}%
                    </label>
                  ))}
                  {action(
                    'Xác nhận tạo lệnh',
                    async () => {
                      const order = await api<Order>('/rebalancing/orders', {
                        sourceHubId: proposal.source,
                        destHubId: proposal.destination,
                        vehicleIds,
                        confirmed: true,
                        idempotencyKey: proposal.key,
                      });
                      setProposal(undefined);
                      orders.refresh();
                      notify('Đã tạo lệnh ' + order.id);
                    },
                    !vehicleIds.length,
                  )}
                </>
              )}
            </>,
          )}
        {RebalancingTaskScreen()}
      </>
    );

    return content;
  }
  function ScenarioScreen(): ReactNode {
    let content: ReactNode;

    content = (
      <>
        {page('WHAT-IF SIMULATION', 'Kịch bản What-if')}
        {card(
          <>
            {field(
              'Kịch bản đã lưu',
              <select
                value={scenario?.id ?? ''}
                onChange={(e) =>
                  loadScenario(
                    scenarios.data?.find((s) => s.id === e.target.value),
                  )
                }
              >
                <option value="">Tạo mới</option>
                {scenarios.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.params.code} · v{s.versionNo}
                  </option>
                ))}
              </select>,
            )}
            {field(
              'Mẫu kịch bản',
              <select
                defaultValue=""
                onChange={(e) => {
                  const tpl = templates.data?.find(
                    (t) => t.code === e.target.value,
                  );
                  if (tpl) {
                    setEventType(tpl.eventType);
                    setIntensity(String(tpl.intensity));
                    setDuration(String(tpl.durationMin));
                  }
                }}
              >
                <option value="">Chọn mẫu</option>
                {templates.data?.map((t) => (
                  <option key={t.code}>{t.code}</option>
                ))}
              </select>,
            )}
            {input('Mã kịch bản', scenarioCode, setScenarioCode)}
            {field(
              'Tình huống',
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                {Object.entries({
                  DEMAND_SURGE: 'Nhu cầu tăng đột biến',
                  PARKING_SURGE: 'Nhu cầu đỗ tăng',
                  CHARGER_FAILURE: 'Cổng sạc hỏng',
                  LOW_BATTERY: 'Xe pin yếu',
                }).map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>,
            )}
            {hubSelect('Hub áp dụng')}
            <div className="two-fields">
              {input('Cường độ', intensity, setIntensity, 'number')}
              {input('Thời lượng (phút)', duration, setDuration, 'number')}
            </div>
          </>,
        )}
        {action(
          'Lưu & tiếp tục',
          async () => {
            const params = {
              code: scenarioCode,
              hubIds: [hub],
              eventType,
              intensity: Number(intensity),
              durationMin: Number(duration),
            };
            const saved = await (scenario
              ? api<{ scenario: Scenario }>(
                  '/scenarios/' + pathId(scenario.id),
                  { params, expectedVersion: scenario.versionNo },
                  'PUT',
                )
              : api<{ scenario: Scenario }>('/scenarios', params));
            setScenario(saved.scenario);
            selectRun('');
            go('simulation');
          },
          !scenarioCode.trim() || !hub,
        )}
        {scenario &&
          action(
            'Nhân bản với mã đã nhập',
            async () => {
              const saved = await api<{ scenario: Scenario }>(
                '/scenarios/' + pathId(scenario.id) + '/clone',
                { newCode: scenarioCode },
              );
              loadScenario(saved.scenario);
              scenarios.refresh();
              notify('Đã nhân bản kịch bản');
            },
            scenarioCode === scenario.params.code,
            true,
          )}
      </>
    );

    return content;
  }
  function SimulationResultScreen(): ReactNode {
    let content: ReactNode;

    content = (
      <>
        {page('KẾT QUẢ MÔ PHỎNG', 'Kết quả & khuyến nghị')}
        {field(
          'Lần chạy',
          <select value={runId} onChange={(e) => selectRun(e.target.value)}>
            <option value="">Chọn lần chạy</option>
            {runs.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} · {label(r.status)}
              </option>
            ))}
          </select>,
        )}
        {current && (
          <>
            {badge(current.run.status)}
            {current.run.metrics.map((m) => (
              <div className="card" key={m.hubId}>
                <h3>{hubName(m.hubId)}</h3>
                <div className="stats">
                  <div>
                    <b>
                      {m.fulfilled}/{m.requested}
                    </b>
                    <span>Đáp ứng</span>
                  </div>
                  <div>
                    <b>{m.overloadMinutes}</b>
                    <span>Phút quá tải</span>
                  </div>
                  <div>
                    <b>{m.lowBattery}</b>
                    <span>Xe pin yếu</span>
                  </div>
                </div>
              </div>
            ))}
            {current.recommendations.map((r) => (
              <div className="card recommendation" key={r.id}>
                <Check size={18} />
                <div>
                  <h3>{label(r.type)}</h3>
                  <p>{describe(r)}</p>
                </div>
                {badge(r.status)}
              </div>
            ))}
            {current.applicable &&
              current.recommendations.some(
                (r) => r.status === 'NOT_APPLIED',
              ) && (
                <button
                  className="btn"
                  onClick={() => {
                    setSelection(
                      current.recommendations
                        .filter((r) => r.status === 'NOT_APPLIED')
                        .map((r) => r.id),
                    );
                    setImpact(undefined);
                    setApplied(undefined);
                    go('apply');
                  }}
                >
                  Xem & xác nhận áp dụng
                  <ChevronRight />
                </button>
              )}
            {field(
              'So sánh với lần chạy cùng snapshot',
              <select
                value={compareId}
                onChange={(e) => {
                  setCompareId(e.target.value);
                  setComparison(undefined);
                }}
              >
                <option value="">Chọn lần chạy</option>
                {runs.data
                  ?.filter(
                    (r) =>
                      r.id !== runId && r.snapshotId === current.run.snapshotId,
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id.slice(0, 8)}
                    </option>
                  ))}
              </select>,
            )}
            {action(
              'So sánh',
              async () =>
                setComparison(
                  await api('/runs/compare', { runIds: [runId, compareId] }),
                ),
              !compareId,
              true,
            )}
            {comparison?.map((r) => (
              <div key={r.run.id} className="card">
                <h3>{r.run.id.slice(0, 8)}</h3>
                {r.run.metrics.map((m) => (
                  <p key={m.hubId}>
                    {hubName(m.hubId)} · {m.fulfilled}/{m.requested} yêu cầu ·{' '}
                    {m.overloadMinutes} phút quá tải
                  </p>
                ))}
              </div>
            ))}
          </>
        )}
      </>
    );

    return content;
  }
  function ReportScreen(): ReactNode {
    let content: ReactNode;

    content = (
      <>
        {page('VẬN HÀNH', 'Báo cáo vận hành')}
        {card(
          <>
            {field(
              'Hub',
              <select
                value={reportHub}
                onChange={(e) => setReportHub(e.target.value)}
              >
                <option value="">Toàn mạng</option>
                {me.hubs.map(option)}
              </select>,
            )}
            {input('Từ', start, setStart, 'datetime-local')}
            {input('Đến', end, setEnd, 'datetime-local')}
          </>,
        )}
        {action(
          'Xem báo cáo',
          async () =>
            setReport(
              await api('/reports', {
                window: reportWindow(),
                ...(reportHub && { hubIds: [reportHub] }),
              }),
            ),
          !start || !end,
        )}
        {report?.rows.map((row) => (
          <div className="card" key={row.hubId}>
            <h3>{hubName(row.hubId)}</h3>
            <p>
              Đỉnh lấp đầy {percent(row.parkingRatioPeak)} · Xe khả dụng TB{' '}
              {row.averageAvailableVehicles.toFixed(1)}
            </p>
            <p>
              {row.fulfilled} yêu cầu đáp ứng · {row.rejected} bị từ chối
            </p>
          </div>
        ))}
        {report?.rows.length === 0 && (
          <p>Chưa có dữ liệu trong khoảng đã chọn.</p>
        )}
        {report?.relatedRunIds.map((id) => (
          <button
            key={id}
            className="btn secondary"
            onClick={() => {
              selectRun(id);
              go('results');
            }}
          >
            Kết quả {id.slice(0, 8)}
          </button>
        ))}
      </>
    );

    return content;
  }
  let content: ReactNode;
  switch (screen) {
    case 'charge':
      content = ChargingUI();
      break;
    case 'report':
      content = GiaoDienBaoSuCo();
      break;
    case 'dashboard': {
      if (!network.data) {
        content = network.error ? null : (
          <p role="status">Đang tải mạng lưới…</p>
        );
        break;
      }
      const rows = network.data;
      const latest = Math.max(0, ...rows.map((row) => row.lastUpdated ?? 0));
      content = (
        <DashboardUI
          hubs={rows.map((row) => ({
            id: row.hub.id,
            name: row.hub.name ?? row.hub.id,
            bikes: row.vehicles.filter((item) => item.status === 'AVAILABLE')
              .length,
            bikeTotal: row.vehicles.length,
            spots: row.spots.filter((item) => item.status === 'EMPTY').length,
            charge: row.points.filter((item) => item.status === 'RANH').length,
            chargeTotal: row.points.length,
            ratio: row.ratio,
            dataStatus: label(row.dataStatus),
          }))}
          alertCount={rows.flatMap((row) => row.alerts).length}
          updatedAt={time(latest || null)}
          technician={me.role === 'TECHNICIAN'}
          onNavigate={go}
          onResources={(hubId, tab) => {
            setHub(hubId);
            setFilter(tab);
            go('resources');
          }}
        />
      );
      break;
    }
    case 'resources': {
      const row = network.data?.find((item) => item.hub.id === hub);
      const key = filter as 'vehicles' | 'spots' | 'points';
      content = (
        <>
          {page(
            'TÀI NGUYÊN',
            'Tình trạng từng Hub',
            row && time(row.lastUpdated),
          )}
          {hubSelect()}
          <div className="chips">
            {Object.entries({
              vehicles: 'Xe',
              spots: 'Chỗ đỗ',
              points: 'Cổng sạc',
            }).map(([id, title]) => (
              <button
                key={id}
                className={key === id ? 'active' : ''}
                onClick={() => setFilter(id)}
              >
                {title}
              </button>
            ))}
          </div>
          {row?.[key].map((item) => (
            <div className="card resource" key={item.id}>
              <div className="hub-symbol">
                {key === 'vehicles' ? (
                  <Bike />
                ) : key === 'spots' ? (
                  <MapPin />
                ) : (
                  <Zap />
                )}
              </div>
              <div>
                <h3>{item.id}</h3>
                {item.battery !== undefined && <p>{item.battery}% pin</p>}
              </div>
              {badge(item.status)}
            </div>
          ))}
        </>
      );
      break;
    }
    case 'alerts':
      content = (
        <>
          {page('CẦN CHÚ Ý', 'Cảnh báo vận hành')}
          {alerts.data
            ?.filter((item) => !item.closedAt)
            .map((item) => (
              <div className="card warning-card" key={item.id}>
                {badge(
                  item.level === 'NGHIEM_TRONG' ? 'Nghiêm trọng' : 'Gần đầy',
                )}
                <h2>{hubName(item.hubId)}</h2>
                <p>
                  {item.resource === 'CHARGING' ? 'Cổng sạc' : 'Chỗ đỗ'} ·{' '}
                  {percent(item.ratio)} · {time(item.updatedAt)}
                </p>
                <div className="progress">
                  <i style={{ width: percent(item.ratio) }} />
                </div>
              </div>
            ))}
          {alerts.data && !alerts.data.some((i) => !i.closedAt) && (
            <p>Không có cảnh báo đang mở.</p>
          )}
          <button className="btn secondary" onClick={() => go('incident')}>
            Xử lý sự cố
            <ChevronRight />
          </button>
        </>
      );
      break;
    case 'incident': {
      const item = detail.data?.incident;
      const send =
        (suffix: string, body: object, method?: string) => async () => {
          await api('/incidents/' + pathId(incidentID) + suffix, body, method);
          detail.refresh();
          incidents.refresh();
          notify('Đã cập nhật sự cố');
        };
      content = (
        <>
          {page('VẬN HÀNH SỰ CỐ', 'Xử lý sự cố')}
          {field(
            'Hồ sơ',
            <select
              value={incidentID}
              onChange={(e) => {
                setIncident(e.target.value);
                setNote('');
              }}
            >
              {incidents.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.resourceId} · {label(i.status)}
                </option>
              ))}
            </select>,
          )}
          {incidents.data?.length === 0 && <p>Không có hồ sơ sự cố.</p>}
          {item &&
            card(
              <>
                {badge(item.status)}
                <h2>{item.resourceId}</h2>
                <p>{item.description}</p>
                {item.repair && <p>Kết quả: {item.repair}</p>}
                {field(
                  'Ghi chú',
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />,
                )}
                {me.role === 'OPERATOR' && item.status === 'MOI' && (
                  <>
                    {field(
                      'Nhân viên kỹ thuật',
                      <select
                        value={technician}
                        onChange={(e) => setTechnician(e.target.value)}
                      >
                        <option value="">Chọn nhân viên</option>
                        {staff.data?.map(option)}
                      </select>,
                    )}
                    {action(
                      'Xác nhận và phân công',
                      send('/assign', { maNVKyThuat: technician }),
                      !technician,
                    )}
                    {action(
                      'Từ chối báo cáo',
                      send('/reject', { lyDo: note }),
                      !note.trim(),
                      true,
                    )}
                  </>
                )}
                {item.status === 'DANG_XU_LY' &&
                  (me.role === 'TECHNICIAN' ? (
                    action(
                      'Lưu kết quả khắc phục',
                      send('/repair', { ketQua: note }, 'PUT'),
                      !note.trim(),
                    )
                  ) : (
                    <>
                      {action(
                        'Đóng sự cố',
                        send('/conclude', { dat: true }),
                        !item.repair,
                      )}
                      {action(
                        'Yêu cầu xử lý thêm',
                        send('/conclude', { dat: false }),
                        !item.repair,
                        true,
                      )}
                    </>
                  ))}
              </>,
            )}
        </>
      );
      break;
    }
    case 'schedule':
      content = (
        <>
          {page('PHÂN BỔ NĂNG LƯỢNG', 'Lịch sạc thông minh')}
          {hubSelect()}
          <div className="charge-banner">
            <Zap />
            <span>
              {schedule.data?.requests.filter(
                (i) => i.status === 'CHO_XEP_LICH',
              ).length ?? 0}{' '}
              yêu cầu đang chờ
            </span>
          </div>
          {schedule.data?.requests.map((item, i) => {
            const slot = schedule.data?.sessions.find(
              (s) => s.requestId === item.id,
            );
            return (
              <div className="card schedule-row" key={item.id}>
                <span className="rank">{i + 1}</span>
                <div>
                  <h3>{item.vehicleId}</h3>
                  <p>
                    {item.battery}% pin · {label(item.status)}
                  </p>
                  <p>
                    {slot
                      ? time(slot.start) +
                        ' – ' +
                        time(slot.end) +
                        ' · ' +
                        slot.pointId
                      : item.reason}
                  </p>
                </div>
              </div>
            );
          })}
          {me.role === 'OPERATOR' &&
            action(
              'Tính lại lịch sạc',
              async () => {
                await api('/charging/schedules', { maHub: hub });
                schedule.refresh();
                notify('Đã cập nhật lịch sạc');
              },
              !hub,
            )}
        </>
      );
      break;
    case 'transfer':
      content = RebalancingScreen();
      break;
    case 'scenario':
      content = ScenarioScreen();
      break;
    case 'simulation': {
      const run = current?.run;
      content = (
        <>
          {page('WHAT-IF SIMULATION', 'Chạy mô phỏng', scenario?.params.code)}
          <div className="card simulation-visual">
            <div
              className={
                'orbit ' + (run?.status === 'RUNNING' ? 'spinning' : '')
              }
            >
              <Play size={38} />
            </div>
            <h2>{run ? label(run.status) : 'Sẵn sàng chạy'}</h2>
            <div className="progress">
              <i style={{ width: (run?.progressPct ?? 0) + '%' }} />
            </div>
            <p>
              {run?.progressPct ?? 0}% {run?.stopReason}
            </p>
          </div>
          {scenario &&
            field(
              'Snapshot dùng chung',
              <select
                value={sharedSnapshotId}
                onChange={(e) => setSharedSnapshotId(e.target.value)}
              >
                <option value="">Chụp trạng thái hiện tại</option>
                {[...new Set(runs.data?.map((r) => r.snapshotId))].map((id) => (
                  <option key={id} value={id}>
                    {id.slice(0, 8)}
                  </option>
                ))}
              </select>,
            )}
          {scenario &&
            action(
              'Chạy mô phỏng',
              async () => {
                const started = await api<{ runId: string }>(
                  '/scenarios/' + pathId(scenario.id) + '/run',
                  {
                    expectedVersion: scenario.versionNo,
                    ...(sharedSnapshotId && { sharedSnapshotId }),
                  },
                );
                selectRun(started.runId);
              },
              Boolean(runId && (!run || run.status === 'RUNNING')),
            )}
          {run?.status === 'RUNNING' &&
            action(
              'Hủy mô phỏng',
              async () => {
                await api('/runs/' + pathId(runId) + '/cancel', {});
                result.refresh();
              },
              false,
              true,
            )}
          <button className="btn secondary" onClick={() => go('results')}>
            Xem kết quả mô phỏng
            <ChevronRight />
          </button>
        </>
      );
      break;
    }
    case 'results':
      content = SimulationResultScreen();
      break;
    case 'apply': {
      const key = JSON.stringify([runId, selection]);
      content = (
        <>
          {page('TỪ MÔ PHỎNG ĐẾN THỰC TẾ', 'Xác nhận phương án')}
          {current?.recommendations
            .filter((r) => r.status === 'NOT_APPLIED')
            .map((r) => (
              <label key={r.id} className="card check-row">
                <input
                  type="checkbox"
                  checked={selection.includes(r.id)}
                  onChange={(e) => {
                    setImpact(undefined);
                    setSelection((ids) =>
                      e.target.checked
                        ? [...ids, r.id]
                        : ids.filter((id) => id !== r.id),
                    );
                  }}
                />
                <span>
                  <strong>{label(r.type)}</strong>
                  <small>{describe(r)}</small>
                </span>
              </label>
            ))}
          {current?.applicable && !applied && (
            <>
              {action(
                'Xem trước tác động',
                async () => {
                  const data = await api<
                    Omit<NonNullable<typeof impact>, 'key'>
                  >('/runs/' + pathId(runId) + '/preview', {
                    recommendationIds: selection,
                  });
                  setImpact({ ...data, key });
                },
                !selection.length,
              )}
              {impact?.key === key &&
                card(
                  <p>
                    {impact.vehiclesToRebalance} xe · {impact.spotsToHold} chỗ ·{' '}
                    {impact.schedulesChanged} lịch sạc ·{' '}
                    {impact.notificationsToSend} thông báo
                  </p>,
                )}
              {action(
                'Xác nhận áp dụng',
                async () => {
                  const data = await api<{
                    rejectedWholePackage: boolean;
                    results: NonNullable<typeof applied>;
                  }>('/runs/' + pathId(runId) + '/apply', {
                    recommendationIds: selection,
                    confirmed: true,
                  });
                  setImpact(undefined);
                  result.refresh();
                  if (data.rejectedWholePackage)
                    throw new Error('Gói đã được xử lý. Hãy làm mới kết quả.');
                  setApplied(data.results);
                },
                impact?.key !== key,
              )}
            </>
          )}
          {applied?.map((item) => (
            <div className="card" key={item.id}>
              {badge(item.status)}
              <p>{item.reason}</p>
            </div>
          ))}
          <button className="btn secondary" onClick={() => go('results')}>
            Quay lại kết quả
          </button>
        </>
      );
      break;
    }
    case 'operationsReport':
      content = ReportScreen();
      break;
    case 'notifications':
      content = (
        <>
          {page('HOẠT ĐỘNG', 'Thông báo')}
          {notifications.data?.map((n) => (
            <div key={n.id} className="card">
              <Clock size={16} />
              <h3>{n.type}</h3>
              <p>{n.body}</p>
              <small>{time(n.createdAt)}</small>
            </div>
          ))}
          {notifications.data?.length === 0 && <p>Chưa có thông báo.</p>}
        </>
      );
      break;
  }
  const readError = [
    network,
    alerts,
    incidents,
    detail,
    staff,
    orders,
    schedule,
    charging,
    scenarios,
    templates,
    runs,
    result,
    notifications,
  ].find((item) => item.error)?.error;
  return (
    <>
      {(error || readError) && (
        <div className="note" role="alert">
          <AlertTriangle size={18} />
          {error || readError}
        </div>
      )}
      {content}
    </>
  );
}
