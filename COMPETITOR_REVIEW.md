# Assessment product review — 3 October 2026

Reviewed public first-party pages, not paid accounts or competitors' source code:

- [TestGorilla: analyzing results](https://support.testgorilla.com/hc/en-us/articles/9028486941979-Guide-to-analyzing-results): comparing candidates, assessment/status/stage filters, human ratings and notes, and links to downloaded results.
- [TestGorilla: assessment management](https://support.testgorilla.com/hc/en-us/sections/9025081984155-Creating-and-managing-assessments): candidate management, shortlists, accommodations, custom questions and advanced assessment settings.
- [TestDome: custom questions](https://www.testdome.com/custom-questions): reusable custom questions, library filtering, multiple formats, URL invitations and individual reports.

| Workflow | Existing app | Addition in this release |
| --- | --- | --- |
| Author reusable content | Blank question, typing and writing modules with editable scoring | Search/type filters and duplicate modules; duplicate assessments into editable drafts |
| Compare applicants | Individual reviews and aggregate Analytics | Select 2–4 candidates and compare assigned content, objective points, typing results and human rubric ratings |
| Track follow-up decisions | Writing-review outcome and evidence | Hiring stages, custom stage names and private notes saved separately from answers, timers and scores |
| Export applicant results | Aggregate Analytics CSV and individual JSON | Filtered candidate CSV with objective, typing and human-review evidence |

Comparison uses assigned snapshots. Different assessment content or settings are flagged. Objective accuracy uses question counts and excludes typing; human ratings stay separate. Interrupted typing retains its administration flag. There is no automatic hiring verdict or invented percentile norm.

Hiring changes require Admin or Editor access, existing business RLS and a separate metadata revision check. Viewer access includes reading, comparison and CSV export. Candidates and previews cannot read hiring notes. CSV contains results rather than answer keys, answers, reviewer notes or bearer links, and escapes spreadsheet formulas. Candidate reads use complete keyset pagination rather than the previous 200-record cap.

Future gaps include richer question formats, candidate file uploads, configurable pool drawing, assessment archiving and ATS integrations. These need their own content, privacy and scoring design. This release does not claim those capabilities or imitate competitors' question banks, algorithms or calibrated benchmarks.
