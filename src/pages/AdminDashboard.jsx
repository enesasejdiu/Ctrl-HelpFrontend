// AdminDashboard.jsx – statistics for admins at /admin.
// Everything comes from one request (GET /stats): stat cards on top, then three charts and two tables.
// Resolution times are in hours, from when a ticket was created until it was resolved.
import { AlertTriangle, CheckCircle2, Clock, Inbox, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import client, { errorMessage } from '../api/client'
import { PriorityBadge } from '../components/Badges'
import { Alert, Avatar, EmptyState, PageHeader, Spinner } from '../components/Ui'
import { STATUSES, formatHours, statusLabel } from '../utils/format'

// Chart colors (validated for color-blind readers and contrast): one hue for single-series charts,
// a second, clearly different hue for the "resolved" line
const SERIES_1 = '#2a78d6'
const SERIES_2 = '#eb6834'
const AXIS = { fontSize: 12, fill: '#6b7280' }
const GRID = '#eef0f3'
const TOOLTIP = {
  contentStyle: { borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxShadow: '0 4px 12px rgb(16 24 40 / 0.08)' },
  labelStyle: { fontWeight: 600, color: '#111827' },
  cursor: { fill: 'rgb(79 70 229 / 0.06)' },
}
const FINISHED = ['resolved', 'closed']
const TOP_CATEGORIES = 8

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Fetches the stats; state is only set once the request finishes
  // useCallback keeps the same function between renders, so the effect below only runs once
  const fetchStats = useCallback(
    () =>
      client
        .get('/stats')
        .then(({ data }) => {
          setStats(data)
          setError('')
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Refresh button: show the spinner icon while reloading
  function load() {
    setLoading(true)
    fetchStats()
  }

  const header = (
    <PageHeader
      title="Dashboard"
      subtitle="How the helpdesk is doing: workload, speed and where problems come from."
      actions={
        <button type="button" className="btn btn--secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : undefined} aria-hidden="true" />
          Refresh
        </button>
      }
    />
  )

  // First load only: after a failed refresh the old numbers stay on screen with an error above them
  if (!stats) {
    return (
      <>
        {header}
        {error ? <Alert>{error}</Alert> : <Spinner label="Loading statistics…" />}
      </>
    )
  }

  // Nothing to chart yet
  if (stats.total === 0) {
    return (
      <>
        {header}
        {error && <Alert>{error}</Alert>}
        <section className="card">
          <EmptyState icon={Inbox} title="No tickets yet.">
            The statistics appear here once the first ticket is reported.
          </EmptyState>
        </section>
      </>
    )
  }

  // The API only lists statuses that occur; show all of them in workflow order, with 0 for the missing ones
  const countByStatus = Object.fromEntries(stats.byStatus.map((s) => [s.status, s.count]))
  const statusData = STATUSES.map((status) => ({ name: statusLabel(status), count: countByStatus[status] || 0 }))
  // "Still open" = everything except resolved and closed, including reopened tickets
  const openCount = stats.byStatus.filter((s) => !FINISHED.includes(s.status)).reduce((sum, s) => sum + s.count, 0)

  // The API sorts categories by count, so this keeps the most common ones
  const categoryData = stats.byCategory.slice(0, TOP_CATEGORIES)
  // "2026-W44" → "W44" for the x-axis; the tooltip shows the full week
  const trendData = stats.trend.map((w) => ({ ...w, label: w.week.split('-')[1] }))

  return (
    <>
      {header}
      {error && <Alert>{error}</Alert>}

      <div className="stat-grid">
        <StatCard icon={Inbox} label="Total tickets" value={stats.total} />
        <StatCard icon={Clock} label="Still open" value={openCount} hint="Not resolved or closed yet" />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={stats.overdueCount}
          hint="Older than their priority's target time"
          tone={stats.overdueCount > 0 ? 'danger' : undefined}
        />
        <StatCard
          icon={CheckCircle2}
          label="Average resolution time"
          value={formatHours(stats.avgResolutionHours)}
          hint={`Across ${stats.resolvedCount} resolved ${stats.resolvedCount === 1 ? 'ticket' : 'tickets'}`}
        />
      </div>

      <div className="dashboard-grid">
        <ChartCard title="Tickets by status" subtitle="Where every ticket stands right now">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={statusData} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...TOOLTIP} formatter={(value) => [value, 'Tickets']} />
              <Bar dataKey="count" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={40}>
                <LabelList dataKey="count" position="top" fontSize={12} fill="#374151" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Most common categories" subtitle="Which kinds of problems are reported most">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={110} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip {...TOOLTIP} formatter={(value) => [value, 'Tickets']} />
              <Bar dataKey="count" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList dataKey="count" position="right" fontSize={12} fill="#374151" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Created vs. resolved" subtitle="Tickets per week, last 8 weeks" wide>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip
                {...TOOLTIP}
                cursor={{ stroke: '#d1d5db', strokeWidth: 1 }}
                labelFormatter={(_, payload) => `Week ${payload?.[0]?.payload.week ?? ''}`}
              />
              <Legend verticalAlign="top" align="right" iconType="plainline" height={32} wrapperStyle={{ fontSize: 13 }} />
              <Line type="monotone" dataKey="created" name="Created" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="resolved" name="Resolved" stroke={SERIES_2} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Agent performance" subtitle="Tickets currently assigned to each staff member">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className="table__num">Assigned</th>
                  <th className="table__num">Resolved</th>
                  <th className="table__num">Avg. time</th>
                </tr>
              </thead>
              <tbody>
                {stats.byAgent.map((agent) => (
                  <tr key={agent.name}>
                    <td>
                      <span className="person">
                        <Avatar name={agent.name} size="sm" />
                        {agent.name}
                      </span>
                    </td>
                    <td className="table__num">{agent.assigned}</td>
                    <td className="table__num">{agent.resolved}</td>
                    <td className="table__num">{formatHours(agent.avg_hours)}</td>
                  </tr>
                ))}
                {stats.byAgent.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-muted">No active staff yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Resolution time by priority" subtitle="Red when the average is slower than the target">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th className="table__num">Tickets</th>
                  <th className="table__num">Target</th>
                  <th className="table__num">Avg. time</th>
                </tr>
              </thead>
              <tbody>
                {stats.byPriority.map((p) => {
                  // No average yet (null) never counts as too slow
                  const tooSlow = p.avg_hours !== null && p.avg_hours > p.target_hours
                  return (
                    <tr key={p.name}>
                      <td>
                        <PriorityBadge priority={p.name} />
                      </td>
                      <td className="table__num">{p.count}</td>
                      <td className="table__num text-muted">{formatHours(p.target_hours)}</td>
                      <td className={`table__num${tooSlow ? ' text-danger' : ''}`}>
                        {formatHours(p.avg_hours)}
                        {tooSlow && <span className="sr-only"> (above target)</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </>
  )
}

function StatCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className={`card stat-card${tone ? ` stat-card--${tone}` : ''}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__icon">
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      <div className="stat-card__value">{value}</div>
      {hint && <div className="stat-card__hint">{hint}</div>}
    </div>
  )
}

function ChartCard({ title, subtitle, wide, children }) {
  return (
    <section className={`card chart-card${wide ? ' chart-card--wide' : ''}`}>
      <div className="chart-card__header">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="chart-card__body">{children}</div>
    </section>
  )
}
