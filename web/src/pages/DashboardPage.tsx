import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DateFilter } from "../components/DateFilter";
import type { DateRange } from "../lib/datetime";
import {
  useDashboardSummary,
  useDashboardTimeseries,
} from "../lib/useDashboard";

type Metric = "feedItems" | "tickets" | "deliveries";

const METRICS: Record<
  Metric,
  { label: string; color: string; light: string }
> = {
  feedItems: {
    label: "Feed items",
    color: "#557ab4",
    light: "#9ab8ee",
  },
  tickets: {
    label: "Tickets",
    color: "#278f83",
    light: "#76d6c6",
  },
  deliveries: {
    label: "Deliveries",
    color: "#a57b43",
    light: "#e5c48c",
  },
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#7d91b7",
  RESEARCH: "#8c80bd",
  READY: "#d0ac6d",
  SENT: "#53a79b",
  CLOSED: "#697789",
};

const dashboardStyles = `
  .db-page {
    --db-surface: #ffffff;
    --db-inset: #f5f7fa;
    --db-border: #e2e7ee;
    --db-text: #233044;
    --db-muted: #637187;
    --db-grid: #e8edf3;
    --db-selected: #e8eef8;
    --db-tooltip: #ffffff;
    color: var(--db-text);
  }

  html[data-theme="dark"] .db-page {
    --db-surface: #182438;
    --db-inset: #142035;
    --db-border: #2c3b50;
    --db-text: #e8edf5;
    --db-muted: #a4b2c6;
    --db-grid: #2a384d;
    --db-selected: #2a3b57;
    --db-tooltip: #1d2c41;
  }

  .db-card {
    min-width: 0;
    background: var(--db-surface);
    border: 1px solid var(--db-border);
    border-radius: 12px;
  }

  .db-muted {
    color: var(--db-muted);
  }

  .db-number {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.04em;
  }

  .db-tab {
    border-radius: 6px;
    padding: 7px 11px;
    font-size: 12px;
    color: var(--db-muted);
    transition: background-color 160ms, color 160ms;
  }

  .db-tab[aria-pressed="true"] {
    color: var(--db-text);
    background: var(--db-selected);
    font-weight: 600;
  }

  .db-tab:hover {
    background: var(--db-selected);
  }

  .db-stat-strip {
    background: var(--db-inset);
    border: 1px solid var(--db-border);
    border-radius: 8px;
  }

  .db-legend-row + .db-legend-row {
    border-top: 1px solid var(--db-border);
  }

  .db-chart {
    height: 320px;
    min-width: 0;
    border-radius: 10px;
    background: linear-gradient(
      180deg,
      var(--db-inset) 0%,
      var(--db-surface) 100%
    );
  }

  .db-donut {
    height: 208px;
    min-width: 0;
  }

  .db-chart .recharts-bar-rectangle path {
    transition: opacity 160ms ease;
  }

  .db-tooltip {
    min-width: 180px;
    padding: 14px;
    color: var(--db-text);
    background: var(--db-tooltip);
    border: 1px solid var(--db-border);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgb(0 0 0 / 14%);
  }

  .db-tooltip-date {
    margin: 0;
    color: var(--db-muted);
    font-size: 11px;
  }

  .db-tooltip-value {
    margin: 10px 0 0;
    font-size: 26px;
    line-height: 1.2;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .db-tooltip-label {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 6px 0 0;
    color: var(--db-muted);
    font-size: 12px;
  }

  @media (max-width: 640px) {
    .db-chart {
      height: 260px;
    }

    .db-tab {
      padding: 7px 9px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .db-page * {
      transition: none !important;
    }
  }
`;

function readableStatus(value: string): string {
  const text = value.toLowerCase().replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(value: string, full = false): string {
  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: full ? "long" : "short",
    ...(full ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(date);
}

function ActivityTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: unknown }>;
  label?: unknown;
  metric: Metric;
}) {
  const value = payload?.[0]?.value;

  if (!active || typeof value !== "number") {
    return null;
  }

  const category = METRICS[metric];

  return (
    <div className="db-tooltip">
      <p className="db-tooltip-date">
        {formatDate(String(label), true)}
      </p>

      <p className="db-tooltip-value">
        {value.toLocaleString()}
      </p>

      <p className="db-tooltip-label">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        {category.label}
      </p>
    </div>
  );
}

export function DashboardPage() {
  const [range, setRange] = useState<DateRange>({});
  const [metric, setMetric] = useState<Metric>("feedItems");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [animateChart, setAnimateChart] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const update = (): void => {
      setAnimateChart(!preference.matches);
    };

    update();
    preference.addEventListener("change", update);

    return () => {
      preference.removeEventListener("change", update);
    };
  }, []);

  const summary = useDashboardSummary(range.from, range.to);
  const timeseries = useDashboardTimeseries(range.from, range.to);

  const data = summary.data;
  const selectedMetric = METRICS[metric];

  const chartData = useMemo(
    () =>
      (timeseries.data?.buckets ?? []).map((bucket) => ({
        date: bucket.bucket.slice(0, 10),
        feedItems: bucket.feedItems,
        tickets: bucket.tickets,
        deliveries: bucket.deliveries,
      })),
    [timeseries.data],
  );

  const ticketStatuses = useMemo(
    () =>
      Object.entries(summary.data?.tickets.byStatus ?? {})
        .filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === "number" && entry[1] > 0,
        )
        .map(([status, value]) => ({
          status,
          name: readableStatus(status),
          value,
          color: STATUS_COLORS[status] ?? "#7d91b7",
        })),
    [summary.data],
  );

  const activityTotal = chartData.reduce(
    (sum, row) => sum + row[metric],
    0,
  );

  const activeDays = chartData.filter(
    (row) => row[metric] > 0,
  ).length;

  const peak = chartData.reduce<
    (typeof chartData)[number] | undefined
  >(
    (current, row) =>
      current === undefined || row[metric] > current[metric]
        ? row
        : current,
    undefined,
  );

  const sent = data?.deliveries.sent ?? 0;
  const failed = data?.deliveries.failed ?? 0;
  const deliveryAttempts = sent + failed;

  const successRate =
    deliveryAttempts > 0
      ? (sent / deliveryAttempts) * 100
      : null;

  const ticketTotal = ticketStatuses.reduce(
    (sum, row) => sum + row.value,
    0,
  );

  const tooltipStyle = {
    backgroundColor: "var(--db-tooltip)",
    border: "1px solid var(--db-border)",
    borderRadius: 8,
    color: "var(--db-text)",
    fontSize: 12,
    padding: "10px 14px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  };

  return (
    <section className="db-page mx-auto w-full max-w-7xl space-y-6">
      <style>{dashboardStyles}</style>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="db-muted mt-1 text-sm">
            A closer look at your newsroom activity.
          </p>
        </div>

        <span role="status" className="db-muted text-xs">
          {summary.isFetching || timeseries.isFetching
            ? "Updating…"
            : "Latest available data"}
        </span>
      </header>

      <div className="db-card p-3">
        <DateFilter
          value={range}
          onChange={(next) => {
            setHoveredDate(null);
            setRange(next);
          }}
        />
      </div>

      {summary.isPending ? (
        <p className="db-muted text-sm">
          Loading dashboard…
        </p>
      ) : null}

      {summary.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600"
        >
          <p>
            {summary.error instanceof Error
              ? summary.error.message
              : "Failed to load dashboard."}
          </p>
          <button
            type="button"
            onClick={() => void summary.refetch()}
            disabled={summary.isFetching}
            className="mt-2 underline disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      ) : null}

      {data !== undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Feed items",
              value: data.feedItems.total.toLocaleString(),
              note: "Collected from your feeds",
              color: "#6b88c9",
            },
            {
              title: "Tickets",
              value: data.tickets.total.toLocaleString(),
              note: "Across all workflow statuses",
              color: "#42a99d",
            },
            {
              title: "Delivery attempts",
              value: deliveryAttempts.toLocaleString(),
              note: `${sent} sent · ${failed} failed`,
              color: "#bf985f",
            },
            {
              title: "Delivery success",
              value:
                successRate === null
                  ? "—"
                  : `${successRate.toFixed(1)}%`,
              note:
                deliveryAttempts === 0
                  ? "No attempts in this period"
                  : "Successful attempts in this period",
              color: "#8c80bd",
            },
          ].map((card) => (
            <article key={card.title} className="db-card p-5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: card.color }}
                />
                <h2 className="db-muted text-xs font-medium">
                  {card.title}
                </h2>
              </div>

              <p className="db-number mt-4 text-3xl font-semibold">
                {card.value}
              </p>

              <p className="db-muted mt-2 text-xs">
                {card.note}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="db-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">
                Daily activity
              </h2>
              <p className="db-muted mt-1 text-xs">
                Daily counts for the selected period.
              </p>
            </div>

            <div
              role="group"
              aria-label="Activity category"
              className="db-stat-strip flex flex-wrap gap-1 p-1"
            >
              {(Object.keys(METRICS) as Metric[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="db-tab"
                  aria-pressed={metric === key}
                  onClick={() => {
                    setHoveredDate(null);
                    setMetric(key);
                  }}
                >
                  {METRICS[key].label}
                </button>
              ))}
            </div>
          </div>

          {timeseries.isPending ? (
            <p className="db-muted py-16 text-sm">
              Loading activity…
            </p>
          ) : timeseries.isError ? (
            <div role="alert" className="py-10 text-sm text-red-600">
              <p>
                {timeseries.error instanceof Error
                  ? timeseries.error.message
                  : "Failed to load activity."}
              </p>
              <button
                type="button"
                onClick={() => void timeseries.refetch()}
                disabled={timeseries.isFetching}
                className="mt-2 underline disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          ) : chartData.length === 0 ? (
            <p className="db-muted py-16 text-center text-sm">
              No activity data for this period.
            </p>
          ) : (
            <>
              <div className="db-stat-strip mt-6 grid grid-cols-3 gap-3 p-4">
                <div>
                  <p className="db-muted text-xs">
                    Total in chart
                  </p>
                  <p className="db-number mt-1 text-xl font-semibold">
                    {activityTotal.toLocaleString()}
                  </p>
                </div>

                <div>
                  <p className="db-muted text-xs">
                    Active days
                  </p>
                  <p className="db-number mt-1 text-xl font-semibold">
                    {activeDays}
                    <span className="db-muted ml-1 text-xs font-normal">
                      / {chartData.length}
                    </span>
                  </p>
                </div>

                <div>
                  <p className="db-muted text-xs">
                    Highest day
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {peak !== undefined && peak[metric] > 0
                      ? formatDate(peak.date)
                      : "—"}
                  </p>
                  <p className="db-muted mt-0.5 text-xs">
                    {peak !== undefined && peak[metric] > 0
                      ? `${peak[metric]} ${selectedMetric.label.toLowerCase()}`
                      : "No activity"}
                  </p>
                </div>
              </div>

              <div
                className="db-chart mt-5"
                onMouseLeave={() => setHoveredDate(null)}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  debounce={100}
                >
                  <BarChart
                    data={chartData}
                    accessibilityLayer
                    margin={{
                      top: 18,
                      right: 12,
                      bottom: 4,
                      left: -18,
                    }}
                    barCategoryGap="35%"
                  >
                    <defs>
                      <linearGradient
                        id={`activity-gradient-${metric}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={selectedMetric.light}
                        />
                        <stop
                          offset="100%"
                          stopColor={selectedMetric.color}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      vertical={false}
                      stroke="var(--db-grid)"
                      strokeDasharray="3 5"
                    />

                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) =>
                        formatDate(String(value))
                      }
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "var(--db-muted)",
                        fontSize: 11,
                      }}
                      minTickGap={28}
                      dy={8}
                    />

                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "var(--db-muted)",
                        fontSize: 11,
                      }}
                      domain={[0, "auto"]}
                    />

                    <Tooltip
                      content={
                        <ActivityTooltip metric={metric} />
                      }
                      cursor={{
                        fill: "var(--db-selected)",
                        opacity: 0.45,
                      }}
                      isAnimationActive={animateChart}
                    />

                    <Bar
                      key={`${metric}-${range.from ?? "all"}-${range.to ?? "all"}`}
                      dataKey={metric}
                      name={selectedMetric.label}
                      fill={`url(#activity-gradient-${metric})`}
                      maxBarSize={36}
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={animateChart}
                      animationBegin={60}
                      animationDuration={650}
                      animationEasing="ease-out"
                      activeBar={{
                        stroke: selectedMetric.light,
                        strokeWidth: 1.5,
                      }}
                    >
                      {chartData.map((row) => (
                        <Cell
                          key={row.date}
                          fill={`url(#activity-gradient-${metric})`}
                          opacity={
                            hoveredDate === null ||
                            hoveredDate === row.date
                              ? 1
                              : 0.4
                          }
                          onMouseEnter={() =>
                            setHoveredDate(row.date)
                          }
                          onMouseLeave={() =>
                            setHoveredDate(null)
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="db-muted mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: selectedMetric.color,
                  }}
                />
                <span>{selectedMetric.label}</span>
                <span className="ml-auto">
                  Hover or tap for details
                </span>
              </div>
            </>
          )}
        </section>

        <section className="db-card p-5 sm:p-6">
          <h2 className="text-base font-semibold">
            Ticket status
          </h2>
          <p className="db-muted mt-1 text-xs">
            Workflow breakdown for this period.
          </p>

          {data === undefined ? (
            <p className="db-muted py-12 text-sm">
              {summary.isPending
                ? "Loading ticket statuses…"
                : "Ticket status data is unavailable."}
            </p>
          ) : ticketTotal === 0 ? (
            <p className="db-muted py-12 text-center text-sm">
              No tickets in this period.
            </p>
          ) : (
            <>
              <div className="db-donut relative mt-4">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  debounce={100}
                >
                  <PieChart>
                    <Pie
                      data={ticketStatuses}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={82}
                      paddingAngle={
                        ticketStatuses.length > 1 ? 3 : 0
                      }
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                      isAnimationActive={animateChart}
                      animationDuration={650}
                      animationEasing="ease-out"
                    >
                      {ticketStatuses.map((status) => (
                        <Cell
                          key={status.status}
                          fill={status.color}
                        />
                      ))}
                    </Pie>

                    <Tooltip
                      contentStyle={tooltipStyle}
                      itemStyle={{
                        color: "var(--db-text)",
                      }}
                      isAnimationActive={animateChart}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="db-number text-3xl font-semibold">
                    {ticketTotal.toLocaleString()}
                  </p>
                  <p className="db-muted mt-1 text-xs">
                    Total tickets
                  </p>
                </div>
              </div>

              <ul className="mt-2">
                {ticketStatuses.map((status) => (
                  <li
                    key={status.status}
                    className="db-legend-row flex items-center gap-2 py-3 text-xs"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: status.color,
                      }}
                    />

                    <span className="db-muted">
                      {status.name}
                    </span>

                    <span className="ml-auto font-semibold tabular-nums">
                      {status.value}
                    </span>

                    <span className="db-muted w-10 text-right tabular-nums">
                      {Math.round(
                        (status.value / ticketTotal) * 100,
                      )}
                      %
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </section>
  );
}