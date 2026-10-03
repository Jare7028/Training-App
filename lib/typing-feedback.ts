// Word-level guidance is visual. The final measurement uses prefixTypingScore.
export function normalizeTyping(text: string) {
    return text.replace(/\r\n?/g, '\n').normalize('NFC');
}

function parts(text: string) {
    return [...normalizeTyping(text).matchAll(/\S+\s*|\s+/gu)].map(match => {
        const word = match[0].match(/^\S*/u)![0];
        return { word, space: match[0].slice(word.length), start: match.index, end: match.index + match[0].length };
    });
}

export function typingFeedback(passage: string, text: string, selection = text.length) {
    const source = parts(passage), typed = parts(text);
    const cursor = normalizeTyping(text.slice(0, selection)).length;
    let current = typed.findIndex(p => cursor < p.end);
    if (current < 0) current = typed.length && !typed.at(-1)!.space ? typed.length - 1 : typed.length;
    const offset = typed[current] ? Array.from(normalizeTyping(text).slice(typed[current].start, cursor)).length : 0;
    const items = source.map((reference, index) => {
        const actual = typed[index];
        const committed = !!actual && (!!actual.space || index < typed.length - 1);
        const word = Array.from(reference.word), entered = Array.from(actual?.word || '');
        const space = Array.from(reference.space), enteredSpace = Array.from(actual?.space || '');
        const chars = word.map((char, i) => ({ char, state: i < entered.length ? char === entered[i] ? 'correct' : 'incorrect' : committed ? 'incorrect' : 'pending' }));
        const spaces = space.map((char, i) => ({ char, state: i < enteredSpace.length ? char === enteredSpace[i] ? 'correct' : 'incorrect' : committed && index < typed.length - 1 ? 'incorrect' : 'pending' }));
        const extraWord = entered.slice(word.length).map(char => ({char, state:'incorrect', extra:true}));
        const extraSpace = enteredSpace.slice(space.length).map(char => ({char:char===' '?'·':char, state:'incorrect', extra:true}));
        const rendered = [...chars, ...extraWord, ...spaces, ...extraSpace];
        const incorrect = rendered.some(c => c.state === 'incorrect');
        const visualOffset = offset <= entered.length ? offset : Math.max(word.length, entered.length) + offset - entered.length;
        const wholeWord = chars.every(c => c.state === 'correct') && (committed || (index === source.length-1 && !space.length));
        return { chars, rendered, current: index === current, offset: visualOffset, state: incorrect ? 'incorrect' : wholeWord ? 'correct' : index === current ? 'current' : 'pending' };
    });
    const currentWord = Array.from(source[current]?.word || ''), currentSpace = Array.from(source[current]?.space || '');
    const enteredLength = Array.from(typed[current]?.word || '').length;
    const expected = offset < currentWord.length && offset <= enteredLength ? currentWord[offset] : currentSpace[Math.max(0,offset-enteredLength)];
    return { items, activeIndex: current, expected, complete: normalizeTyping(text) === normalizeTyping(passage) };
}
