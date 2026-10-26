import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useNavigate,
} from "react-router";
import {
  decodeTokenExp,
  formatSessionCountdown,
} from "../lib/sessionCountdown";
import {
  clearToken,
  useSession,
} from "../lib/tokenStore";

const NAV_COLLAPSED_KEY = "secnews_nav_collapsed";

type NavItem = {
  to: string;
  label: string;
};

const GUEST_ITEMS: NavItem[] = [
  { to: "/login", label: "Login" },
  { to: "/bootstrap", label: "Bootstrap" },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/integrations", label: "Integrations" },
  { to: "/email-template", label: "Email template" },
  { to: "/prompts", label: "Prompts" },
  { to: "/users", label: "Users" },
];

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

  const exp = decodeTokenExp(token);

  if (exp === null) {
    return null;
  }

  const countdown = formatSessionCountdown(exp, now);

  return (
    <p
      className={`mt-1 text-xs ${
        countdown.warning
          ? "text-red-400"
          : "text-slate-400"
      }`}
    >
      {countdown.text}
    </p>
  );
}

export function AppShell() {
  const { token, user } = useSession();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(
    () =>
      localStorage.getItem(NAV_COLLAPSED_KEY) === "1",
  );

  const isManager =
    user?.role === "ADMIN" ||
    user?.role === "EDITOR";

  const canUseResearch =
    user?.role === "ADMIN" ||
    user?.role === "EDITOR" ||
    user?.role === "ANALYST";

  const memberItems: NavItem[] = [
    ...(canUseResearch
      ? [{ to: "/dashboard", label: "Dashboard" }]
      : []),
    ...(isManager
      ? [{ to: "/feeds", label: "Feeds" }]
      : []),
    ...(canUseResearch
      ? [{ to: "/reports", label: "Reports" }]
      : []),
    { to: "/feeds/items", label: "Feed items" },
    { to: "/tickets", label: "Tickets" },
    {
      to: "/research-tools",
      label: "Recap & IOC library",
    },
    { to: "/clients", label: "Clients" },
    { to: "/bulletin", label: "Bulletin" },
    ...(canUseResearch
      ? [{ to: "/otx", label: "OTX pulses" }]
      : []),
    ...(user?.role === "ADMIN" ? ADMIN_ITEMS : []),
  ].filter(
    (item) =>
      item.to !== "/research-tools" ||
      canUseResearch,
  );

  const items =
    token === null ? GUEST_ITEMS : memberItems;

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

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside
        className={`sticky top-0 flex h-dvh shrink-0 flex-col overflow-hidden bg-slate-900 text-slate-100 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3 py-4">
          {!collapsed ? (
            <NavLink
              to="/"
              className="text-sm font-bold tracking-wide text-white"
            >
              SECNEWS CMS
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
            className="rounded-md px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav
          id="primary-nav"
          aria-label="Primary"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/feeds"}
              title={item.label}
              aria-label={item.label}
              className={({ isActive }) =>
                [
                  "flex items-center rounded-md py-2.5 text-sm transition-colors",
                  collapsed
                    ? "justify-center px-1"
                    : "px-3",
                  isActive
                    ? "bg-indigo-600 font-medium text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                ].join(" ")
              }
            >
              {collapsed ? (
                <span
                  aria-hidden="true"
                  className="text-xs font-semibold"
                >
                  {initialsOf(item.label)}
                </span>
              ) : (
                item.label
              )}
            </NavLink>
          ))}
        </nav>

        {user !== null ? (
          <div
            role="group"
            aria-label="Signed-in user"
            className="shrink-0 border-t border-slate-800 p-3"
          >
            <NavLink
              to="/account"
              aria-label="Open profile"
              title={user.name}
              className={`flex items-center gap-3 rounded-md ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
              >
                {initialsOf(user.name)}
              </span>

              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {user.name}
                  </p>

                  <span className="text-xs text-indigo-300">
                    {user.role}
                  </span>

                  {token !== null ? (
                    <SessionCountdown token={token} />
                  ) : null}
                </div>
              ) : null}
            </NavLink>

            <div className="mt-3 flex flex-col gap-1">
              <NavLink
                to="/account"
                title="Account"
                aria-label="Account"
                className="rounded-md px-2 py-2 text-center text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {collapsed ? "AC" : "Account"}
              </NavLink>

              <button
                type="button"
                onClick={logout}
                title="Logout"
                aria-label="Logout"
                className="rounded-md px-2 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {collapsed ? "OUT" : "Logout"}
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}