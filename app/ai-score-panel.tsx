'use client';
import type { Attempt } from '@/lib/assessment';
import { reviewCriteria } from '@/lib/assessment';
import { Button } from '@/components/ui/button';

export function AiScorePanel({attempt: a, available, readOnly, busy, onScore}: {
    attempt: Attempt; available: boolean; readOnly: boolean; busy: boolean; onScore: () => void;
}) {
    const failed = a.aiScoring?.state === 'failed';
    const running = a.aiScoring?.state === 'running';
    const criteria = [...new Map(reviewCriteria(a.modules).map(r => [r.key, r])).values()];
    const errors: Record<string, string> = {
        configuration: 'Check the OpenAI API key.', capacity: 'OpenAI usage limit reached. Check billing or try again shortly.',
        model_unavailable: 'GPT-6 Luna is unavailable to this OpenAI project.',
        invalid_output: 'The score did not pass rubric validation.', refused: 'OpenAI could not score this response.',
    };
    return <section className="ai-score-panel" aria-label="Written scoring">
        <div className="ai-score-heading"><div><h3>{a.review ? 'Rubric scores' : !available ? 'Scoring setup needed' : failed ? 'Scoring failed' : 'Scoring written responses…'}</h3>
            {a.review && <small>{a.review.source === 'ai' ? 'GPT-6 Luna' : 'Assessor adjustment'} · {new Date(a.review.reviewedAt).toLocaleDateString('en-GB')}</small>}</div>
            {!readOnly && available && !running && (a.review || failed || a.aiScoring?.state === 'blocked') && <Button variant="outline" disabled={busy} onClick={onScore}>{a.review ? 'Score again' : 'Retry scoring'}</Button>}
        </div>
        {!a.review && !available && <p>Add OPENAI_API_KEY in the deployment settings to enable automatic scoring.</p>}
        {failed && <p role="status">{errors[a.aiScoring?.error || ''] || 'Scoring was interrupted. Your answers are saved.'}{available && (a.aiScoring?.tries || 0) < 3 ? ' Retrying automatically.' : ''}</p>}
        {a.review && <><p>{a.review.notes}</p>{criteria.map(r => <div className="ai-criterion" key={r.key}>
            <div><strong>{r.title}</strong><strong>{a.review?.ratings[r.key] ?? '—'} / {r.max}</strong></div>
            {a.review?.evidence?.[r.key] && <p>{a.review.evidence[r.key]}</p>}
            <details><summary>Scoring guide</summary><p>{r.help}</p><small>{r.anchors.length === r.max + 1 ? r.anchors.map((anchor, n) => `${n}: ${anchor}`).join(' · ') : `0: ${r.anchors[0]} · 2: ${r.anchors[1]} · 4: ${r.anchors[2]}`}</small></details>
        </div>)}</>}
    </section>;
}
