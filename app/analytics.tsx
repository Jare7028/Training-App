'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, ArrowUpRight, BarChart3, Users, Clock, Keyboard } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AnalyticsResponse, AssessmentAnalytics, RequestAnalytics, CountRow, TrendPoint } from '@/lib/analytics';
import { analyticsCsv } from '@/lib/analytics-export';
import { kindLabels, type ModuleKind } from '@/lib/assessment';

const count = (value: number) => value.toLocaleString('en-GB');
const percentage = (value: number | null) => value === null ? '—' : `${value}%`;
const number = (value: number | null) => value === null ? '—' : count(value);
const today = () => new Date().toISOString().slice(0, 10);
const chartDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortName = (value: string) => value.length > 18 ? value.slice(0, 17) + '…' : value;
type Cell = string | number | React.ReactNode;

function DataTable({ headers, rows, label }: { headers: string[]; rows: Cell[][]; label: string }) {
    return <div className="analytics-table-wrap" role="region" aria-label={`${label} table`} tabIndex={0}><table className="analytics-table" aria-label={label}><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j} data-label={headers[j]}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
function ChartData({ headers, rows, label }: { headers: string[]; rows: Cell[][]; label: string }) {
    return <details className="analytics-chart-data"><summary>View data</summary><DataTable headers={headers} rows={rows} label={label}/></details>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
    return <article className="analytics-metric" aria-label={label}><h2>{label}</h2><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}
function Empty({ children = 'No data for this period.' }: { children?: React.ReactNode }) { return <p className="analytics-empty">{children}</p>; }
function CountsChart({ title, rows, empty }: { title: string; rows: CountRow[]; empty?: string }) {
    const hasData = rows.some(row => row.count > 0);
    return <section className="analytics-panel"><h2>{title}</h2>{hasData ? <>
        <div className="analytics-chart analytics-bars" style={{ height: Math.max(200, rows.length * 38 + 30) }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 250 }}>
                <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }} accessibilityLayer title={title}>
                    <CartesianGrid horizontal={false} stroke="#dce3e7" strokeDasharray="3 3"/>
                    <XAxis type="number" allowDecimals={false} tick={{ fill: '#526572', fontSize: 12 }} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" width={126} tickFormatter={shortName} tick={{ fill: '#526572', fontSize: 12 }} axisLine={false} tickLine={false}/>
                    <Tooltip cursor={{ fill: '#edf3f5' }} formatter={value => [value, 'Count']} contentStyle={{ borderRadius: 8, color: '#162d3b' }}/>
                    <Bar dataKey="count" name="Count" fill="#315e69" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}/>
                </BarChart>
            </ResponsiveContainer>
        </div><ChartData label={title + ' data'} headers={['Status', 'Count']} rows={rows.map(row => [row.name, row.count])}/>
    </> : <Empty>{empty || 'No data for this period.'}</Empty>}</section>;
}
function ActivityChart({ title, rows, second, granularity }: { title: string; rows: TrendPoint[]; second: 'submitted' | 'archived'; granularity: string }) {
    const labels = { created: second === 'submitted' ? 'Links created' : 'Requests created', submitted: 'Submitted', archived: 'Archived' };
    return <section className="analytics-panel analytics-activity"><div className="analytics-section-heading"><h2>{title}</h2><span>{granularity === 'month' ? 'Monthly' : granularity === 'week' ? 'Weekly' : 'Daily'} · UTC</span></div>{rows.length ? <>
        <div className="analytics-legend"><span><i className="analytics-line"/>{labels.created}</span><span><i className="analytics-line secondary"/>{labels[second]}</span></div>
        <div className="analytics-chart analytics-lines"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 260 }}>
            <LineChart data={rows} margin={{ top: 10, right: 10, left: -22, bottom: 5 }} accessibilityLayer title={title}>
                <CartesianGrid vertical={false} stroke="#dce3e7" strokeDasharray="3 3"/>
                <XAxis dataKey="date" tickFormatter={chartDate} minTickGap={32} tick={{ fill: '#526572', fontSize: 12 }} axisLine={false} tickLine={false}/>
                <YAxis allowDecimals={false} tick={{ fill: '#526572', fontSize: 12 }} axisLine={false} tickLine={false}/>
                <Tooltip labelFormatter={value => String(value) + ' UTC'} formatter={(value, name) => [value, labels[name as keyof typeof labels] || name]} contentStyle={{ borderRadius: 8, color: '#162d3b' }}/>
                <Line type="linear" dataKey="created" name="created" stroke="#315e69" strokeWidth={2.5} dot={rows.length < 3} activeDot={{ r: 4 }} isAnimationActive={false}/>
                <Line type="linear" dataKey={second} name={second} stroke="#946534" strokeWidth={2.5} strokeDasharray="5 4" dot={rows.length < 3} activeDot={{ r: 4 }} isAnimationActive={false}/>
            </LineChart>
        </ResponsiveContainer></div>
        <ChartData label={title + ' data'} headers={[second === 'submitted' ? 'Link date (UTC)' : 'Created date (UTC)', labels.created, labels[second]]} rows={rows.map(row => [row.date, row.created, row[second]])}/>
    </> : <Empty>{second === 'submitted' ? 'No candidate links in this period.' : 'No requests in this period.'}</Empty>}</section>;
}
function AssessmentReport({ data, onReview }: { data: AssessmentAnalytics; onReview: () => void }) {
    const objective = data.modules.filter(module => module.kind !== 'typing'), typing = data.modules.filter(module => module.kind === 'typing');
    const duration = data.medianSeconds === null ? '—' : `${Math.floor(Math.round(data.medianSeconds) / 60)}m ${Math.round(data.medianSeconds) % 60}s`;
    return <>
        <div className="analytics-metrics">
            <Metric label="Links created" value={count(data.links)}/>
            <Metric label="Submitted" value={count(data.submitted)} detail={data.completionRate === null ? undefined : `${percentage(data.completionRate)} completion`}/>
            <Metric label="Awaiting written scores" value={count(data.awaiting)}/>
            <Metric label="Objective accuracy" value={percentage(data.accuracy)} detail={`${count(data.correct)} of ${count(data.total)} answers correct`}/>
        </div>
        <ActivityChart title="Links & submissions by link date" rows={data.trend} second="submitted" granularity={data.granularity}/>
        <div className="analytics-two-columns"><CountsChart title="Candidate progress" rows={data.pipeline}/><CountsChart title="Written score" rows={data.reviewOutcomes} empty="No writing submissions in this period."/></div>
        <section className="analytics-panel"><div className="analytics-section-heading"><h2><Users size={18}/>Assessments</h2><Button variant="ghost" onClick={onReview}>Candidate review<ArrowUpRight size={16}/></Button></div>
            {data.assessments.length ? <DataTable label="Assessment performance" headers={['Assessment', 'Links', 'Submitted', 'Completion', 'Awaiting scores', 'Objective accuracy']} rows={data.assessments.map(row => [row.title, count(row.links), count(row.submitted), percentage(row.links ? Math.round(row.submitted / row.links * 1000) / 10 : null), count(row.awaiting), <span key="accuracy">{percentage(row.accuracy)}<small>{row.correct} / {row.total} correct</small></span>])}/> : <Empty>No candidate links in this period.</Empty>}
        </section>
        <section className="analytics-panel"><h2><BarChart3 size={18}/>Objective modules</h2>{objective.length ? <DataTable label="Objective module performance" headers={['Assigned module', 'Submissions', 'Correct / questions', 'Accuracy']} rows={objective.map(row => [<span key="module">{row.title}<small>{kindLabels[row.kind as ModuleKind]} · {row.version}</small></span>, count(row.samples), `${count(row.correct)} / ${count(row.total)}`, percentage(row.accuracy)])}/> : <Empty>No scored objective modules in this period.</Empty>}</section>
        <section className="analytics-panel"><h2><Keyboard size={18}/>Typing</h2>{typing.length ? <>
            <div className="analytics-mini-metrics"><span>Median net WPM<strong>{number(data.typing.wpm)}</strong></span><span>Median accuracy<strong>{percentage(data.typing.accuracy)}</strong></span><span>Measured samples<strong>{count(data.typing.samples)}</strong></span><span>Excluded samples<strong>{count(data.typing.excluded)}</strong></span></div>
            <DataTable label="Typing module performance" headers={['Assigned module', 'Samples', 'Net WPM', 'Accuracy', 'Excluded', 'Finished early']} rows={typing.map(row => [<span key="module">{row.title}<small>{row.version}</small></span>, count(row.samples), number(row.wpm), percentage(row.typingAccuracy), count(row.excluded), count(row.ceiling)])}/>
        </> : <Empty>No typing results in this period.</Empty>}</section>
        <section className="analytics-panel"><h2>Human writing ratings</h2>{data.writing.length ? <DataTable label="Human writing ratings" headers={['Criterion', 'Assigned module', 'Reviews', 'Average rating']} rows={data.writing.map(row => [row.title, <span key="module">{row.moduleTitle}<small>{row.version}</small></span>, count(row.samples), `${row.average} / ${row.max}`])}/> : <Empty>No scored writing reviews in this period.</Empty>}</section>
        <section className="analytics-panel analytics-timing"><h2><Clock size={18}/>Work time</h2><div className="analytics-mini-metrics"><span>Median time to submit<strong>{duration}</strong></span><span>Timed-out submissions<strong>{count(data.timedOut)}</strong></span></div></section>
        <details className="analytics-definitions"><summary>About these figures</summary><p>The date range selects when candidate links were created. Counts show their current progress; submissions in the chart belong to links created in that date bucket. Preview tests are excluded.</p><p>Objective accuracy is correct answers divided by all objective questions in submitted tests, including unanswered questions. Typing and written work are separate. Completion is submissions divided by links created, including expired and revoked links.</p><p>Modules with different assigned content have separate snapshot identifiers. Writing ratings use each assigned rubric; not-scorable reviews are excluded. Typing values are medians of measured samples; interrupted and not-attempted tasks are excluded. An early finish means the reference passage was completed within the timer.</p><p>Work time runs from starting timed work to submission, including pauses. Overdue attempts without a saved result appear as Awaiting finalisation.</p></details>
    </>;
}
function RequestReport({ data, onRequests }: { data: RequestAnalytics; onRequests: () => void }) {
    return <>
        <div className="analytics-metrics"><Metric label="On board" value={count(data.onBoard)} detail={`${count(data.created)} created · ${count(data.archived)} archived`}/><Metric label="Unassigned" value={count(data.unassigned)}/><Metric label="High or urgent" value={count(data.urgent)}/><Metric label="Median age on board" value={data.medianAgeDays === null ? '—' : `${data.medianAgeDays} days`}/></div>
        <ActivityChart title="Requests by created date" rows={data.trend} second="archived" granularity={data.granularity}/>
        <div className="analytics-two-columns"><CountsChart title="Board columns" rows={data.columns} empty="No requests on the board in this period."/><CountsChart title="Priority" rows={data.priorities} empty="No requests on the board in this period."/></div>
        <section className="analytics-panel"><div className="analytics-section-heading"><h2>Team workload</h2><Button variant="ghost" onClick={onRequests}>Requests board<ArrowUpRight size={16}/></Button></div>{data.workload.length ? <DataTable label="Request team workload" headers={['Assignee', 'On board', 'High or urgent', 'Median age (days)']} rows={data.workload.map(row => [row.name, count(row.count), count(row.urgent), number(row.ageDays)])}/> : <Empty>No assigned or unassigned requests in this period.</Empty>}</section>
        <details className="analytics-definitions"><summary>About these figures</summary><p>The date range selects when requests were created. Columns, priorities and assignment show their current state. On board includes all unarchived cards, whatever their column is called. Archived cards are counted separately; custom column names do not imply completion.</p><p>Age runs from creation to now. Archived requests in the chart belong to requests created in that date bucket. The table includes inactive assignees if they still hold cards.</p></details>
    </>;
}
export default function Analytics({ tenantId, onReview, onRequests }: { tenantId: string; onReview: () => void; onRequests: () => void }) {
    const [view, setView] = useState('assessments'), [period, setPeriod] = useState('30'), [assessment, setAssessment] = useState('all');
    const [from, setFrom] = useState(today()), [to, setTo] = useState(today()), [data, setData] = useState<AnalyticsResponse | null>(null);
    const [options, setOptions] = useState<{ id: string; title: string }[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
    const [loadedFilter, setLoadedFilter] = useState('');
    const [refresh, setRefresh] = useState(0), generation = useRef(0);
    const filterKey = JSON.stringify([tenantId, view, period, assessment, ...(period === 'custom' ? [from, to] : [])]);
    const ready = !loading && loadedFilter === filterKey;
    const load = useCallback(async (controller: AbortController) => {
        const sequence = ++generation.current; setLoading(true); setError(''); setData(null);
        const params = new URLSearchParams({ view, period, assessment, ...(period === 'custom' ? { from, to } : {}) });
        try {
            const response = await fetch('/api/analytics?' + params, { signal: controller.signal, headers: { 'X-Tenant-Id': tenantId }, cache: 'no-store' });
            const result = await response.json() as AnalyticsResponse & { error?: string };
            if (!response.ok) throw new Error(result.error || 'Analytics could not be loaded.');
            if (result.tenantId !== tenantId) throw new Error('The selected business changed. Reload before continuing.');
            if (sequence !== generation.current || controller.signal.aborted) return;
            setData(result); setLoadedFilter(filterKey); if (view === 'assessments') setOptions(result.assessmentOptions);
        } catch (e) { if (sequence === generation.current && !controller.signal.aborted) { setError((e as Error).message); setLoadedFilter(filterKey); } }
        finally { if (sequence === generation.current && !controller.signal.aborted) setLoading(false); }
    }, [view, period, assessment, from, to, tenantId, filterKey]);
    useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load, refresh]);
    const exportCsv = () => {
        if (!data || !ready || error) return;
        const blob = new Blob([analyticsCsv(data, options.find(option => option.id === assessment)?.title || 'All assessments')], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = `analytics-${view}-${data.range.fromDate || 'all'}-${data.range.toDate}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <div className="analytics-page">
        <div className="page-heading"><h1>Analytics</h1><div className="analytics-actions"><Button variant="outline" aria-label="Refresh analytics" disabled={!ready} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16}/><span>Refresh</span></Button><Button variant="outline" disabled={!data || !ready || !!error} onClick={exportCsv}><Download size={16}/>Export CSV</Button></div></div>
        <Tabs value={view} onValueChange={setView}><TabsList aria-label="Analytics views"><TabsTrigger value="assessments">Assessments</TabsTrigger><TabsTrigger value="requests">Requests</TabsTrigger></TabsList>
            <div className="analytics-filters">
                <label className="field"><span>{view === 'assessments' ? 'Link dates (UTC)' : 'Request dates (UTC)'}</span><select className="select-field" aria-label="Analytics date range" value={period} onChange={event => setPeriod(event.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="all">All time</option><option value="custom">Custom dates</option></select></label>
                {period === 'custom' && <><label className="field"><span>From</span><Input type="date" min="2000-01-01" max={today()} aria-label="Analytics from date" value={from} onChange={event => setFrom(event.target.value)}/></label><label className="field"><span>To</span><Input type="date" min={from || '2000-01-01'} max={today()} aria-label="Analytics to date" value={to} onChange={event => setTo(event.target.value)}/></label></>}
                {view === 'assessments' && <label className="field analytics-assessment-filter"><span>Assessment</span><select className="select-field" aria-label="Analytics assessment" value={assessment} onChange={event => setAssessment(event.target.value)}><option value="all">All assessments</option>{options.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label>}
            </div>
            {ready && error && <div className="error-panel" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button></div>}
            {!ready && <div className="analytics-loading" role="status" aria-label="Loading analytics"><div className="analytics-metrics">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full"/>)}</div><Skeleton className="h-72 w-full"/></div>}
            <TabsContent value="assessments">{ready && !error && data?.assessments && <AssessmentReport data={data.assessments} onReview={onReview}/>}</TabsContent>
            <TabsContent value="requests">{ready && !error && data?.requests && <RequestReport data={data.requests} onRequests={onRequests}/>}</TabsContent>
        </Tabs>
    </div>;
}
