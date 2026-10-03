import { candidateModule, type Answer, type AssessmentConfig, type TestModule } from './assessment';

export const questionPosition = (module: TestModule, answer: Answer) => Math.min(Math.max(0, answer.questionIndex || 0), Math.max(0, (module.questions?.length || 1) - 1));
export const hasNextQuestion = (module: TestModule, answer: Answer, config?: AssessmentConfig) => !!config?.oneQuestionAtATime && questionPosition(module, answer) < (module.questions?.length || 0) - 1;
export function flowModule(module: TestModule, answer: Answer, config?: AssessmentConfig) {
    const safe = candidateModule(module);
    if (!config?.oneQuestionAtATime || !module.questions) return safe;
    const index = questionPosition(module, answer);
    return { ...safe, questionIndex: index, questionCount: module.questions.length, questions: safe.questions?.slice(index, index + 1) };
}
export function flowAnswer(module: TestModule, answer: Answer, config?: AssessmentConfig): Answer {
    if (!config?.oneQuestionAtATime || config.allowBackNavigation !== false || !module.questions) return answer;
    const index = questionPosition(module, answer), id = module.questions[index].id;
    return { questionIndex: index, choices: answer.choices?.[id] === undefined ? {} : { [id]: answer.choices[id] } };
}
export function questionAnswer(module: TestModule, existing: Answer, incoming: Answer, config?: AssessmentConfig): { answer: Answer; error?: never } | { error: string; answer?: never } {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return {error:'Invalid answer.'};
    const single = !!config?.oneQuestionAtATime, index = questionPosition(module, existing);
    const choices = single ? { ...existing.choices } : {} as Record<string, number>;
    if (incoming.choices !== undefined && (!incoming.choices || typeof incoming.choices !== 'object' || Array.isArray(incoming.choices))) return { error: 'Invalid answer choices.' };
    if (single && Object.keys(incoming.choices || {}).some(id => !module.questions?.some(q => q.id === id))) return { error: 'This question is unavailable.' };
    for (const [i, question] of (module.questions || []).entries()) {
        const value = incoming.choices && Object.hasOwn(incoming.choices, question.id) ? incoming.choices[question.id] : undefined;
        if (value === undefined) continue;
        if (!Number.isInteger(value) || value < 0 || value >= question.options.length) return { error: 'Invalid answer choice.' };
        if (single && i !== index) {
            if (value !== existing.choices?.[question.id]) return { error: 'Only the current question can be changed.' };
        } else choices[question.id] = value;
    }
    return { answer: { choices, ...(single ? { questionIndex: index } : {}) } };
}
export function moveQuestion(module: TestModule, answer: Answer, action: string, config?: AssessmentConfig): string | null {
    if (!config?.oneQuestionAtATime || !module.questions) return 'This section has no question navigation.';
    const index = questionPosition(module, answer), next = index + (action === 'question-back' ? -1 : 1);
    if (action === 'question-back' && config.allowBackNavigation === false) return 'Going back is disabled for this assessment.';
    if (next < 0 || next >= module.questions.length) return 'This question is unavailable.';
    answer.questionIndex = next;
    return null;
}
export function navigationError(module: TestModule, answer: Answer, config: AssessmentConfig | undefined, index: number, next: number): string | null {
    if (config?.allowBackNavigation !== false) return null;
    if (next !== index + 1) return 'Continue to the next section.';
    if (hasNextQuestion(module, answer, config)) return 'Continue through the questions before leaving this section.';
    return null;
}
