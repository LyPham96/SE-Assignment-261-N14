import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bike,
  Home,
  Ticket,
  Zap,
  LayoutDashboard,
  ChevronRight,
  Play,
  Truck,
  Signal,
  Wifi,
  Battery,
  Settings,
  CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './style.css';
import './glass.css';
import './mobile.css';
import './blue.css';
import { Settings as SettingsPage, usePreferences } from './preferences';
import { api as accountApi } from './account-api';
import { GiaoDienHub, studentScreens } from './student-screens';
import {
  createApi,
  OperationsUI,
  liveScreens,
  type Api,
  type Identity,
  type LiveScreen,
} from './live-screens';

const screens = [
  ['login', 'Đăng nhập / vai trò', 'M1'],
  ['settings', 'Cài đặt', 'M1'],
  ['home', 'Tìm Hub', 'M2'],
  ['hub', 'Tài nguyên tại Hub', 'M2'],
  ['vehicle', 'Chọn xe dùng chung', 'M2'],
  ['book', 'Xác nhận đặt xe', 'M2'],
  ['parking', 'Đặt chỗ đỗ cá nhân', 'M2'],
  ['charge', 'Đăng ký sạc', 'M3'],
  ['reservations', 'Đặt chỗ của tôi', 'M2'],
  ['edit', 'Sửa đặt chỗ', 'M2'],
  ['cancel', 'Hủy đặt chỗ', 'M2'],
  ['unlock', 'Nhận xe QR / mã', 'M2'],
  ['trip', 'Chuyến đi hiện tại', 'M2'],
  ['return', 'Trả xe', 'M2'],
  ['report', 'Báo sự cố', 'M3'],
  ['dashboard', 'Toàn mạng vận hành', 'M3'],
  ['resources', 'Xe, chỗ đỗ & cổng sạc', 'M3'],
  ['alerts', 'Cảnh báo vận hành', 'M3'],
  ['incident', 'Xử lý sự cố', 'M3'],
  ['schedule', 'Lập lịch sạc thông minh', 'M3'],
  ['transfer', 'Điều chuyển xe', 'M4'],
  ['scenario', 'Tạo kịch bản What-if', 'M4'],
  ['simulation', 'Chạy mô phỏng', 'M4'],
  ['results', 'Kết quả & khuyến nghị', 'M4'],
  ['apply', 'Xác nhận áp dụng', 'M4'],
  ['operationsReport', 'Báo cáo vận hành', 'M4'],
  ['notifications', 'Thông báo', 'M3'],
] as const;
type Screen = (typeof screens)[number][0];
function ManHinhChinh() {
  const { theme, setTheme, language, setLanguage } = usePreferences();
  const [screen, setScreen] = useState<Screen>(
    (new URLSearchParams(location.search).get('screen') as Screen) || 'login',
  );
  useEffect(() => {
    document.documentElement.dataset.screen = screen;
    return () => {
      delete document.documentElement.dataset.screen;
    };
  }, [screen]);
  const [session, setSession] = useState<{ api: Api; me: Identity }>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  async function signIn() {
    if (!username.trim() || !password || loggingIn) return;
    setLoginError('');
    setLoggingIn(true);
    try {
      await accountApi('/auth/login', { username, password });
      const api = createApi();
      const me = await api<Identity>('/me');
      setSession({ api, me });
      setPassword('');
      setRole(
        {
          STUDENT: 'Sinh viên',
          OPERATOR: 'Vận hành',
          TECHNICIAN: 'Kỹ thuật',
          ADMIN: 'Quản trị',
        }[me.role],
      );
      go(['OPERATOR', 'TECHNICIAN'].includes(me.role) ? 'dashboard' : 'home');
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : 'Không thể kết nối máy chủ.',
      );
    } finally {
      setLoggingIn(false);
    }
  }
  const [role, setRole] = useState('Sinh viên');
  const [toast, setToast] = useState('');
  const [loginReady, setLoginReady] = useState(false);
  useEffect(() => {
    let active = true;
    const api = createApi();
    void api<Identity>('/me')
      .then(
        (me) => {
          if (!active) return;
          setSession({ api, me });
          setRole(
            {
              STUDENT: 'Sinh viên',
              OPERATOR: 'Vận hành',
              TECHNICIAN: 'Kỹ thuật',
              ADMIN: 'Quản trị',
            }[me.role],
          );
          if (!new URLSearchParams(location.search).has('screen')) {
            const next =
              me.role === 'OPERATOR' || me.role === 'TECHNICIAN'
                ? 'dashboard'
                : 'home';
            setScreen(next);
            history.replaceState(null, '', '?screen=' + next);
          }
        },
        () => {},
      )
      .finally(() => {
        if (active) setLoginReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const [settingsOrigin, setSettingsOrigin] = useState<Screen>('home');
  const go = (s: Screen) => {
    if (s === 'settings') {
      setSettingsOrigin(operational ? 'dashboard' : 'home');
    }
    setScreen(s);
    history.replaceState(null, '', `?screen=${s}`);
    document.querySelector('.scroll')?.scrollTo(0, 0);
  };
  const notify = (s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(''), 3200);
  };
  const button = (label: string, fn: () => void) => (
    <button className="btn" onClick={fn}>
      {label}
      <ArrowRight size={17} />
    </button>
  );
  const isLive = liveScreens.includes(screen as LiveScreen);
  const isStudentScreen = studentScreens.includes(
    screen as (typeof studentScreens)[number],
  );
  const operational =
    (screen === 'settings' && role !== 'Sinh viên') ||
    (isLive && !['charge', 'report', 'notifications'].includes(screen)) ||
    (screen === 'notifications' && role !== 'Sinh viên');
  let content: React.ReactNode;
  switch (screen) {
    case 'login':
      content = (
        <ManHinhDangNhap
          username={username}
          password={password}
          setUsername={setUsername}
          setPassword={setPassword}
          error={loginError}
          busy={loggingIn || !loginReady}
          submit={() => void signIn()}
        />
      );
      break;
    case 'settings':
      content = (
        <>
          <SettingsPage
            theme={theme}
            setTheme={setTheme}
            language={language}
            setLanguage={setLanguage}
            role={role}
          />
          {session &&
            button('Đăng xuất', () => {
              void accountApi('/auth/logout', {}).then(
                () => {
                  setSession(undefined);
                  setRole('Sinh viên');
                  go('login');
                },
                (error) => notify(error.message),
              );
            })}
        </>
      );
      break;
    default:
      content = null;
  }
  const pageNames: Record<Screen, string> = {
    settings: 'Cài đặt',
    login: 'Đăng nhập',
    home: 'Khám phá',
    hub: 'Tài nguyên tại Hub',
    vehicle: 'Chọn xe',
    book: 'Đặt xe',
    parking: 'Đặt chỗ đỗ',
    charge: 'Đăng ký sạc',
    reservations: 'Đặt chỗ của tôi',
    edit: 'Sửa đặt chỗ',
    cancel: 'Hủy đặt chỗ',
    unlock: 'Nhận xe',
    trip: 'Chuyến đi',
    return: 'Trả xe',
    report: 'Báo sự cố',
    dashboard: 'Tổng quan',
    resources: 'Tài nguyên',
    alerts: 'Cảnh báo',
    incident: 'Xử lý sự cố',
    schedule: 'Lịch sạc',
    transfer: 'Điều chuyển',
    scenario: 'Tạo kịch bản',
    simulation: 'Mô phỏng',
    results: 'Kết quả',
    apply: 'Duyệt phương án',
    operationsReport: 'Báo cáo vận hành',
    notifications: 'Thông báo',
  };
  const formPages = [
    'parking',
    'charge',
    'edit',
    'report',
    'incident',
    'transfer',
    'scenario',
    'apply',
  ];
  if ((isLive || isStudentScreen) && !session)
    content = (
      <div className="card">
        <p>Đăng nhập để xem dữ liệu và thao tác vận hành.</p>
        {button('Về đăng nhập', () => go('login'))}
      </div>
    );
  const parts =
    React.isValidElement<{ children: React.ReactNode }>(content) &&
    content.type === React.Fragment
      ? React.Children.toArray(content.props.children)
      : [content];
  const primaryIndex = parts.findIndex(
    (child) =>
      React.isValidElement<{ className?: string }>(child) &&
      child.type === 'button' &&
      child.props.className === 'btn',
  );
  const primary = primaryIndex >= 0 ? parts[primaryIndex] : null;
  const pinned = primary && screen !== 'login';
  if (pinned) content = <>{parts.filter((_, i) => i !== primaryIndex)}</>;
  return (
    <div className="studio">
      <aside className="catalog">
        <div className="brand">
          <Bike size={30} />
          PikePike<span>ĐIỀU PHỐI DI CHUYỂN</span>
        </div>
        <p>
          Đi xanh mỗi ngày.
          <br />
          Smart E-Mobility Hub · ĐHQG-HCM
        </p>
        {['M1', 'M2', 'M3', 'M4'].map((m) => (
          <div key={m}>
            <h4>
              {m} ·{' '}
              {m === 'M1'
                ? 'Bắt đầu'
                : m === 'M2'
                  ? 'Hành trình sinh viên'
                  : m === 'M3'
                    ? 'Sạc & vận hành'
                    : 'Điều phối & What-if'}
            </h4>
            {screens
              .filter((s) => s[2] === m)
              .map((s) => (
                <button
                  key={s[0]}
                  className={screen === s[0] ? 'current' : ''}
                  onClick={() => go(s[0])}
                >
                  {s[1]}
                  <ChevronRight size={13} />
                </button>
              ))}
          </div>
        ))}
        <small>
          TypeScript · Android-ready via Capacitor
          <br />
          Đặt xe và vận hành
        </small>
      </aside>
      <main className="preview">
        <div className="preview-label">
          <span>PIKEPIKE / MOBILE EXPERIENCE</span>
          <b>{screens.find((s) => s[0] === screen)?.[1]}</b>
        </div>
        <div className="phone">
          <div className="phone-screen">
            <div className="notch" />
            <div className="status">
              <b>9:41</b>
              <span>
                <Signal size={14} />
                <Wifi size={14} />
                <Battery size={18} />
              </span>
            </div>
            <header className="mobile-header">
              <div className="chrome-row">
                <button
                  className="icon-button"
                  aria-label="Quay lại"
                  onClick={() =>
                    go(
                      screen === 'settings'
                        ? settingsOrigin
                        : operational
                          ? 'dashboard'
                          : 'home',
                    )
                  }
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  className="icon-button settings-shortcut"
                  aria-label="Cài đặt"
                  onClick={() => go('settings')}
                >
                  <Settings size={18} />
                </button>
                <div className="brand-notification">
                  <button
                    className="header-settings"
                    aria-label="Hồ sơ và cài đặt"
                    onClick={() => go('settings')}
                  >
                    <span>
                      PikePike
                      <i />
                    </span>
                  </button>
                  <button
                    className="notification"
                    aria-label="Thông báo"
                    onClick={() => go('notifications')}
                  >
                    <Bell size={18} />
                    <i />
                  </button>
                </div>
              </div>
              <div className="title-row">
                <h1>{pageNames[screen]}</h1>
                {pinned && formPages.includes(screen) && (
                  <div className="title-action">{primary}</div>
                )}
              </div>
            </header>
            <div className="scroll">
              {isLive && session ? (
                <OperationsUI
                  screen={screen as LiveScreen}
                  api={session.api}
                  me={session.me}
                  go={go}
                  notify={notify}
                />
              ) : isStudentScreen && session ? (
                <GiaoDienHub
                  screen={screen as (typeof studentScreens)[number]}
                  go={go}
                  notify={notify}
                  student={session.me.role === 'STUDENT'}
                />
              ) : (
                <React.Fragment key={screen}>{content}</React.Fragment>
              )}
            </div>
            {pinned && !formPages.includes(screen) && (
              <div className="primary-dock">{primary}</div>
            )}
            {screen !== 'login' && (
              <nav className="bottom-nav">
                {(operational
                  ? [
                      [LayoutDashboard, 'Tổng quan', 'dashboard'],
                      [Zap, 'Lịch sạc', 'schedule'],
                      [Truck, 'Điều phối', 'transfer'],
                      ...(session?.me.role === 'TECHNICIAN'
                        ? []
                        : [[Play, 'What-if', 'scenario']]),
                    ]
                  : [
                      [Home, 'Trang chủ', 'home'],
                      [Ticket, 'Đặt chỗ', 'reservations'],
                      [Zap, 'Sạc xe', 'charge'],
                      [Bike, 'Chuyến đi', 'trip'],
                    ]
                ).map(([I, l, s]) => {
                  let Icon = I as LucideIcon;
                  let active = screen === s;
                  return (
                    <button
                      aria-label={l as string}
                      key={s as string}
                      className={active ? 'active' : ''}
                      onClick={() => go(s as Screen)}
                    >
                      <Icon size={20} />
                      {active && <span>{l as string}</span>}
                    </button>
                  );
                })}
              </nav>
            )}
            {toast && (
              <div className="toast" role="status">
                <CheckCircle2 size={18} />
                {toast}
              </div>
            )}
            <div className="home-indicator" />
          </div>
        </div>
        <div className="preview-footer">
          <span>Designed for your everyday green ride.</span>
          <span>393 × 852 · iPhone 14 Pro</span>
        </div>
      </main>
    </div>
  );
}
function ManHinhDangNhap({
  username,
  password,
  setUsername,
  setPassword,
  error,
  busy,
  submit,
}: {
  username: string;
  password: string;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  error: string;
  busy: boolean;
  submit: () => void;
}) {
  return (
    <>
      <div className="hero login-hero">
        <div>
          <h2>
            Đi gần hơn.
            <br />
            Sống xanh hơn.
          </h2>
        </div>
        <img
          className="bike-art"
          src="/images/vehicle.png"
          alt="Xe điện PikePike"
        />
      </div>
      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>Tài khoản</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Mật khẩu</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button
          className="btn"
          disabled={busy || !username.trim() || !password}
        >
          Đăng nhập
          <ArrowRight size={17} />
        </button>
      </form>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ManHinhChinh />
  </React.StrictMode>,
);
