import type { AnalyticsResponse } from './analytics';

// Spreadsheet formula injection is possible even in correctly quoted cells.
export function csvCell(value: string | number | null) {
    let text = value === null ? '' : String(value);
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
}
export function analyticsCsv(data: AnalyticsResponse, assessmentTitle: string) {
    const rows: (string | number | null)[][] = [
        ['Report', data.assessments ? 'Assessments' : 'Requests'], ['Created from (UTC)', data.range.fromDate || 'All time'], ['Created through (UTC)', data.range.toDate], ['Generated at (UTC)', new Date(data.generatedAt).toISOString()],
    ];
    if (data.assessments) {
        const a = data.assessments;
        rows.push(['Assessment filter', assessmentTitle], [], ['Metric', 'Value'], ['Links created', a.links], ['Submitted', a.submitted], ['Completion rate (%)', a.completionRate], ['Awaiting written scores', a.awaiting], ['Correct objective answers', a.correct], ['Objective questions', a.total], ['Objective accuracy (%)', a.accuracy], ['Median work time (seconds)', a.medianSeconds], ['Timed-out submissions', a.timedOut], ['Typing samples', a.typing.samples], ['Typing samples excluded', a.typing.excluded], ['Median net WPM', a.typing.wpm], ['Median typing accuracy (%)', a.typing.accuracy], [], ['Link date (UTC)', 'Links created', 'Submitted from those links']);
        for (const row of a.trend) rows.push([row.date, row.created, row.submitted]);
        rows.push([], ['Candidate status', 'Count']); for (const row of a.pipeline) rows.push([row.name, row.count]);
        rows.push([], ['Written score outcome', 'Count']); for (const row of a.reviewOutcomes) rows.push([row.name, row.count]);
        rows.push([], ['Assessment', 'Links', 'Submitted', 'Awaiting scores', 'Correct', 'Questions', 'Accuracy (%)']); for (const row of a.assessments) rows.push([row.title, row.links, row.submitted, row.awaiting, row.correct, row.total, row.accuracy]);
        rows.push([], ['Module', 'Assigned version', 'Kind', 'Samples', 'Correct', 'Questions', 'Accuracy (%)', 'Median net WPM', 'Median typing accuracy (%)', 'Excluded typing samples', 'Passage completed early']); for (const row of a.modules) rows.push([row.title, row.version, row.kind, row.samples, row.correct, row.total, row.accuracy, row.wpm, row.typingAccuracy, row.excluded, row.ceiling]);
        rows.push([], ['Writing module', 'Assigned version', 'Criterion', 'Samples', 'Average human rating', 'Maximum']); for (const row of a.writing) rows.push([row.moduleTitle, row.version, row.title, row.samples, row.average, row.max]);
    }
    if (data.requests) {
        const r = data.requests;
        rows.push([], ['Metric', 'Value'], ['Requests created', r.created], ['On board', r.onBoard], ['Unassigned', r.unassigned], ['High or urgent', r.urgent], ['Archived', r.archived], ['Median age on board (days)', r.medianAgeDays], [], ['Created date (UTC)', 'Requests created', 'Archived from those requests']);
        for (const row of r.trend) rows.push([row.date, row.created, row.archived]);
        rows.push([], ['Board column', 'Count']); for (const row of r.columns) rows.push([row.name, row.count]);
        rows.push([], ['Priority', 'Count']); for (const row of r.priorities) rows.push([row.name, row.count]);
        rows.push([], ['Assignee', 'On board', 'High or urgent', 'Median age (days)']); for (const row of r.workload) rows.push([row.name, row.count, row.urgent, row.ageDays]);
    }
    return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
