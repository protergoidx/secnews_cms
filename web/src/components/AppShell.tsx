import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router";
import {
  decodeTokenExp,
  formatSessionCountdown,
} from "../lib/sessionCountdown";
import { applyTheme, getInitialTheme } from "../lib/theme";
import { clearToken, useSession } from "../lib/tokenStore";

const NAV_COLLAPSED_KEY = "secnews_nav_collapsed";

type NavItem = {
  to: string;
  label: string;
  icon: string;
};

const ICONS = {
  dashboard:
    "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  feeds:
    "M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M6 20a2 2 0 1 0-4 0 2 2 0 0 0 4 0",
  reports:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h8",
  feedItems:
    "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  tickets:
    "M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 11v2M13 17v2",
  library:
    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2ZM8 7h8M8 11h8",
  clients:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  bulletin:
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v5h5M8 13h8M8 17h8",
  otx:
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10",
  integrations:
    "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  email:
    "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 6l-10 7L2 6",
  prompts:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2",
  users:
    "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  account:
    "M18 20a6 6 0 0 0-12 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  logout:
    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  shield:
    "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11ZM9 12l2 2 4-4",
  sun:
    "M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon:
    "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z",
  chevronLeft: "m14 6-6 6 6 6",
  chevronRight: "m10 6 6 6-6 6",
};

const compactStyles = `
  .compact-shell {
    font-size: 13px;
  }

  .compact-sidebar {
    width: 208px;
  }

  .compact-sidebar.is-collapsed {
    width: 56px;
  }

  .compact-brand {
    height: 56px;
    flex-shrink: 0;
  }

  .compact-header {
    position: sticky;
    top: 0;
    z-index: 20;
    min-height: 56px;
  }

  .compact-content {
    padding: 20px;
  }

  .compact-nav-link {
    min-height: 36px;
    font-size: 13px;
  }

  .compact-shell .db-page {
    max-width: 1280px;
  }

  .compact-shell .db-page > :not(:last-child) {
    margin-bottom: 18px;
  }

  .compact-shell .db-page h1 {
    font-size: 22px;
    line-height: 1.3;
  }

  .compact-shell .db-card {
    padding: 16px;
  }

  .compact-shell .db-number.text-3xl {
    font-size: 28px;
    line-height: 1.2;
  }

  .compact-shell .db-stat-strip {
    padding: 12px;
  }

  .compact-shell .db-stat-strip[role="group"] {
    padding: 4px;
  }

  .compact-shell .db-tab {
    padding: 6px 9px;
  }

  .compact-shell .db-chart {
    height: 280px;
  }

  .compact-shell .db-donut {
    height: 190px;
  }

  @media (max-width: 1100px) {
    .compact-content {
      padding: 16px;
    }
  }

  @media (max-width: 767px) {
    .compact-sidebar {
      width: 56px;
    }

    .compact-sidebar .sidebar-label,
    .compact-sidebar .sidebar-wordmark,
    .compact-sidebar .sidebar-user-details,
    .compact-sidebar .sidebar-section-label,
    .compact-sidebar .sidebar-collapse {
      display: none;
    }

    .compact-sidebar .compact-nav-link {
      justify-content: center;
      padding-left: 8px;
      padding-right: 8px;
    }

    .compact-sidebar .sidebar-user-link,
    .compact-sidebar .compact-brand {
      justify-content: center;
    }

    .compact-sidebar .sidebar-utilities {
      flex-direction: column;
    }

    .compact-content {
      padding: 12px;
    }

    .compact-shell .db-chart {
      height: 250px;
    }
  }
`;

function Icon({
  path,
  className = "h-4 w-4",
}: {
  path: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";

  return (
    second === ""
      ? first.slice(0, 2)
      : `${first.charAt(0)}${second.charAt(0)}`
  ).toUpperCase();
}

function SessionCountdown({
  token,
}: {
  token: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const expiry = decodeTokenExp(token);
  if (expiry === null) return null;

  const countdown = formatSessionCountdown(expiry, now);

  return (
    <span
      className={`block text-xs ${
        countdown.warning
          ? "text-red-400"
          : "text-slate-400"
      }`}
    >
      {countdown.text}
    </span>
  );
}

export function AppShell() {
  const { token, user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(
    () =>
      localStorage.getItem(NAV_COLLAPSED_KEY) === "1",
  );

  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isManager =
    user?.role === "ADMIN" ||
    user?.role === "EDITOR";

  const canUseResearch =
    user?.role === "ADMIN" ||
    user?.role === "EDITOR" ||
    user?.role === "ANALYST";

  const guestItems: NavItem[] = [
    {
      to: "/login",
      label: "Login",
      icon: ICONS.account,
    },
    {
      to: "/bootstrap",
      label: "Bootstrap",
      icon: ICONS.shield,
    },
  ];

  const memberItems: NavItem[] = [
    ...(canUseResearch
      ? [{
          to: "/dashboard",
          label: "Dashboard",
          icon: ICONS.dashboard,
        }]
      : []),
    ...(isManager
      ? [{
          to: "/feeds",
          label: "Feeds",
          icon: ICONS.feeds,
        }]
      : []),
    ...(canUseResearch
      ? [{
          to: "/reports",
          label: "Reports",
          icon: ICONS.reports,
        }]
      : []),
    {
      to: "/feeds/items",
      label: "Feed items",
      icon: ICONS.feedItems,
    },
    {
      to: "/tickets",
      label: "Tickets",
      icon: ICONS.tickets,
    },
    ...(canUseResearch
      ? [{
          to: "/research-tools",
          label: "Recap & IOC library",
          icon: ICONS.library,
        }]
      : []),
    {
      to: "/clients",
      label: "Clients",
      icon: ICONS.clients,
    },
    {
      to: "/bulletin",
      label: "Bulletin",
      icon: ICONS.bulletin,
    },
    ...(canUseResearch
      ? [{
          to: "/otx",
          label: "OTX pulses",
          icon: ICONS.otx,
        }]
      : []),
    ...(user?.role === "ADMIN"
      ? [
          {
            to: "/integrations",
            label: "Integrations",
            icon: ICONS.integrations,
          },
          {
            to: "/email-template",
            label: "Email template",
            icon: ICONS.email,
          },
          {
            to: "/prompts",
            label: "Prompts",
            icon: ICONS.prompts,
          },
          {
            to: "/users",
            label: "Users",
            icon: ICONS.users,
          },
        ]
      : []),
  ];

  const items = token === null ? guestItems : memberItems;

  const currentItem = items.find((item) =>
    item.to === "/tickets"
      ? location.pathname === "/tickets" ||
        location.pathname.startsWith("/tickets/")
      : location.pathname === item.to,
  );

  const pageTitle =
    location.pathname === "/account"
      ? "Account"
      : currentItem?.label ?? "Workspace";

  function toggleCollapsed(): void {
    const next = !collapsed;

    localStorage.setItem(
      NAV_COLLAPSED_KEY,
      next ? "1" : "0",
    );

    setCollapsed(next);
  }

  function logout(): void {
    clearToken();
    navigate("/login");
  }

  if (location.pathname === "/login") {
    return <Outlet />;
  }

  return (
    <div className="compact-shell flex min-h-screen bg-slate-100 text-slate-900">
      <style>{compactStyles}</style>

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:p-3"
      >
        Skip to content
      </a>

      <aside
        className={`compact-sidebar sticky top-0 flex h-dvh shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-100 ${
          collapsed ? "is-collapsed" : ""
        }`}
      >
        <div
          className={`compact-brand flex items-center gap-2 border-b border-slate-800 px-2 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed ? (
            <NavLink
              to="/"
              className="flex min-w-0 items-center gap-2 text-white"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
                <Icon path={ICONS.shield} />
              </span>

              <span className="sidebar-wordmark min-w-0">
                <span className="block truncate text-sm font-semibold">
                  SecNews CMS
                </span>
                <span className="block text-xs text-slate-400">
                  Security workspace
                </span>
              </span>
            </NavLink>
          ) : null}

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={
              collapsed
                ? "Expand navigation"
                : "Collapse navigation"
            }
            aria-expanded={!collapsed}
            aria-controls="primary-nav"
            title={
              collapsed
                ? "Expand navigation"
                : "Collapse navigation"
            }
            className="sidebar-collapse rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <Icon
              path={
                collapsed
                  ? ICONS.chevronRight
                  : ICONS.chevronLeft
              }
            />
          </button>
        </div>

        <nav
          id="primary-nav"
          aria-label="Primary"
          className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
        >
          {!collapsed ? (
            <p className="sidebar-section-label mb-2 px-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Workspace
            </p>
          ) : null}

          <div className="space-y-0.5">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/feeds"}
                title={item.label}
                aria-label={item.label}
                className={({ isActive }) =>
                  [
                    "compact-nav-link flex items-center gap-2.5 rounded-md",
                    collapsed
                      ? "justify-center px-2"
                      : "px-2.5",
                    isActive
                      ? "bg-indigo-600 font-medium text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  ].join(" ")
                }
              >
                <Icon
                  path={item.icon}
                  className="h-4 w-4 shrink-0"
                />

                {!collapsed ? (
                  <span className="sidebar-label min-w-0 truncate">
                    {item.label}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </div>
        </nav>

        {user !== null ? (
          <div
            role="group"
            aria-label="Signed-in user"
            className="shrink-0 border-t border-slate-800 p-2"
          >
            <NavLink
              to="/account"
              title={user.name}
              aria-label="Open profile"
              className={`sidebar-user-link flex items-center gap-2 rounded-md py-2 hover:bg-slate-800 ${
                collapsed ? "justify-center" : "px-1"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
              >
                {initialsOf(user.name)}
              </span>

              {!collapsed ? (
                <span className="sidebar-user-details min-w-0">
                  <span className="block truncate text-xs font-semibold text-white">
                    {user.name}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {user.role}
                  </span>
                  {token !== null ? (
                    <SessionCountdown token={token} />
                  ) : null}
                </span>
              ) : null}
            </NavLink>

            <div
              className={`sidebar-utilities mt-1 flex gap-1 ${
                collapsed ? "flex-col" : ""
              }`}
            >
              <NavLink
                to="/account"
                aria-label="Account"
                title="Account"
                className="flex flex-1 items-center justify-center gap-2 rounded-md p-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <Icon path={ICONS.account} />
                {!collapsed ? (
                  <span className="sidebar-label">Account</span>
                ) : null}
              </NavLink>

              <button
                type="button"
                onClick={logout}
                aria-label="Logout"
                title="Logout"
                className="flex flex-1 items-center justify-center gap-2 rounded-md p-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <Icon path={ICONS.logout} />
                {!collapsed ? (
                  <span className="sidebar-label">Logout</span>
                ) : null}
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="compact-header flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {pageTitle}
            </p>
            <p className="hidden text-xs text-slate-500 sm:block">
              SecNews workspace
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setTheme((current) =>
                  current === "dark" ? "light" : "dark",
                )
              }
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              title={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Icon
                path={
                  theme === "dark"
                    ? ICONS.sun
                    : ICONS.moon
                }
              />
              <span className="hidden sm:inline">
                {theme === "dark" ? "Light" : "Dark"}
              </span>
            </button>

            {user !== null ? (
              <NavLink
                to="/account"
                title="Open account"
                aria-label="Open account"
                className="flex items-center gap-2 rounded-md p-1 hover:bg-slate-100"
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white"
                >
                  {initialsOf(user.name)}
                </span>
                <span className="hidden max-w-32 truncate text-xs font-medium text-slate-900 sm:block">
                  {user.name}
                </span>
              </NavLink>
            ) : null}
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="compact-content min-w-0 flex-1"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}