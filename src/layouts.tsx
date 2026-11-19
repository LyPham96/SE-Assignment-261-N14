import {
  ArrowUpRight,
  Bike,
  MapPin,
  Zap,
  ChevronRight,
  AlertTriangle,
  Truck,
  Play,
  Circle,
  Wrench,
  BarChart3,
} from 'lucide-react';
type OperationsHub = {
  id: string;
  name: string;
  bikes: number;
  bikeTotal: number;
  spots: number;
  charge: number;
  chargeTotal: number;
  ratio: number;
  dataStatus: string;
};
type OperationsProps = {
  hubs: OperationsHub[];
  alertCount: number;
  updatedAt: string;
  technician: boolean;
  onNavigate: (
    screen:
      | 'alerts'
      | 'incident'
      | 'schedule'
      | 'transfer'
      | 'scenario'
      | 'results'
      | 'operationsReport',
  ) => void;
  onResources: (hubId: string, tab: 'vehicles' | 'spots' | 'points') => void;
};
export function DashboardUI({
  hubs,
  alertCount,
  updatedAt,
  technician,
  onNavigate,
  onResources,
}: OperationsProps) {
  const resource = (tab: 'vehicles' | 'spots' | 'points', hub = hubs[0]) => {
    if (hub) onResources(hub.id, tab);
  };
  const total = (
    key: 'bikes' | 'bikeTotal' | 'spots' | 'charge' | 'chargeTotal',
  ) => hubs.reduce((sum, hub) => sum + hub[key], 0);
  const shortcuts = [
    { screen: 'alerts', label: 'Cảnh báo', Icon: AlertTriangle },
    { screen: 'incident', label: 'Xử lý sự cố', Icon: Wrench },
    { screen: 'schedule', label: 'Lịch sạc', Icon: Zap },
    { screen: 'transfer', label: 'Điều chuyển', Icon: Truck },
    { screen: 'scenario', label: 'Tạo What-if', Icon: Play },
    { screen: 'results', label: 'Kết quả mô phỏng', Icon: BarChart3 },
    { screen: 'operationsReport', label: 'Báo cáo vận hành', Icon: BarChart3 },
  ] as const;
  return (
    <div className="operations-layout supervisor-layout">
      <div className="supervisor-heading">
        <span>GIÁM SÁT TOÀN MẠNG</span>
        <span className="online-indicator">
          <i />
          {updatedAt}
        </span>
      </div>
      <div className="supervisor-metrics">
        <button disabled={!hubs.length} onClick={() => resource('vehicles')}>
          <Bike size={19} />
          <b>
            {total('bikes')}
            <span>/{total('bikeTotal')}</span>
          </b>
          <span>Xe khả dụng</span>
          <ArrowUpRight size={13} />
        </button>
        <button disabled={!hubs.length} onClick={() => resource('spots')}>
          <MapPin size={19} />
          <b>{total('spots')}</b>
          <span>Chỗ đỗ trống</span>
          <ArrowUpRight size={13} />
        </button>
        <button disabled={!hubs.length} onClick={() => resource('points')}>
          <Zap size={19} />
          <b>
            {total('charge')}
            <span>/{total('chargeTotal')}</span>
          </b>
          <span>Cổng sạc rảnh</span>
          <ArrowUpRight size={13} />
        </button>
      </div>
      <button className="supervisor-alert" onClick={() => onNavigate('alerts')}>
        <AlertTriangle size={18} />
        <span>{alertCount} cảnh báo đang mở</span>
        <ChevronRight size={16} />
      </button>
      <div className="section">
        <h2>Trung tâm thao tác</h2>
        <span className="section-detail">M3 · M4</span>
      </div>
      <div className="supervisor-links">
        {shortcuts
          .filter(
            ({ screen }) =>
              !technician ||
              !['scenario', 'results', 'operationsReport'].includes(screen),
          )
          .map(({ screen, label, Icon }) => (
            <button key={screen} onClick={() => onNavigate(screen)}>
              <Icon size={19} />
              <span>
                <strong>{label}</strong>
              </span>
              <ChevronRight size={13} />
            </button>
          ))}
      </div>
      <div className="section">
        <h2>Mạng lưới Hub</h2>
        <button disabled={!hubs.length} onClick={() => resource('vehicles')}>
          Tất cả tài nguyên
          <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="network-table">
        <div className="network-table-head">
          <span>HUB / MỨC LẤP ĐẦY</span>
          <span>XE</span>
          <span>SẠC</span>
        </div>
        {hubs.map((h) => {
          const occupancy = Math.round(h.ratio * 100) + '%';
          return (
            <button
              className="network-table-row"
              key={h.id}
              onClick={() => resource('vehicles', h)}
            >
              <div>
                <h3>
                  <Circle size={7} fill="#6dacea" color="transparent" />
                  {h.name}
                </h3>
                <div className="occupancy">
                  <span>
                    <i style={{ width: occupancy, background: '#6dacea' }} />
                  </span>
                  <small>
                    {occupancy} · {h.dataStatus}
                  </small>
                </div>
              </div>
              <b>{h.bikes}</b>
              <b>
                {h.charge}
                <small>/{h.chargeTotal}</small>
              </b>
            </button>
          );
        })}
      </div>
    </div>
  );
}
