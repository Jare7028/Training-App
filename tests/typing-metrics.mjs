import assert from 'node:assert/strict';
import { prefixTypingScore, validateAssessment, candidateModule, cleanModule } from '../lib/assessment.ts';
import { typingFeedback } from '../lib/typing-feedback.ts';
const exact = prefixTypingScore('Abc 123.', 'Abc 123. More text', 60);
assert.equal(exact.accuracy, 100); assert.equal(exact.errors, 0); assert.equal(exact.referenceLength, 8);
const omitted = prefixTypingScore('abdef', 'abcdef remaining tail', 60);
assert.equal(omitted.errors, 1); assert.equal(omitted.matched, 5); assert.equal(omitted.referenceLength, 6);
const inserted = prefixTypingScore('abXcdef', 'abcdef tail', 60);
assert.equal(inserted.errors, 1); assert.equal(inserted.matched, 6); assert.ok(inserted.accuracy < 100);
assert.equal(prefixTypingScore('', 'abc', 60).accuracy, 0);
assert.equal(prefixTypingScore('cafe\u0301', 'café rest', 60).accuracy, 100);
assert.equal(prefixTypingScore('😀', '😀 next', 60).typedLength, 1);
assert.equal(prefixTypingScore('a\r\nb', 'a\nb', 60).accuracy, 100);
assert.equal(prefixTypingScore('abc', 'abc', 30).grossWpm, 1.2);
assert.equal(prefixTypingScore('ax', 'abc', 60).referenceLength, 2); // longest prefix on equal distance
assert.equal(prefixTypingScore('AB', 'ab', 60).matched, 0);
const section = { id:'q1', kind:'spelling', title:'Precision', seconds:105, instructions:'Use the facts', questions:[{id:'item1',prompt:'Choose',context:'Approved, not processed',options:['A','B'],optionIds:['optionA','optionB'],correct:1,explanation:'Confidential rationale'}] };
const candidate = candidateModule(section);
assert.equal(candidate.questions[0].correct, undefined); assert.equal(candidate.questions[0].explanation, undefined);
assert.deepEqual(candidate.questions[0].optionIds, ['optionA','optionB']);
assert.equal(validateAssessment({id:'',title:'Core',description:'',status:'ready',modules:[section],revision:0,updatedAt:0}), null);
assert.ok(validateAssessment({id:'',title:'Core',description:'',status:'ready',modules:[{...section,rubric:[{id:'r',title:'bad',help:'',max:3,anchors:['missing ratings']}]}],revision:0,updatedAt:0}));
console.log('Typing metric and confidential-payload assertions passed.');

const shuffled = cleanModule({...section,questions:[{...section.questions[0],options:['B','A'],optionIds:['optionB','optionA'],correctOptionId:'optionB'}]});
assert.equal(shuffled.questions[0].correct,0);
console.log('Stable option keys survive answer reordering.');

const emptyFeedback = typingFeedback('The customer is waiting.', '');
assert.equal(emptyFeedback.activeIndex, 0); assert.equal(emptyFeedback.expected, 'T');
const wordError = typingFeedback('The customer is waiting.', 'Teh ');
assert.equal(wordError.items[0].state, 'incorrect'); assert.equal(wordError.activeIndex, 1); assert.equal(wordError.expected, 'c');
const correctedFeedback = typingFeedback('The customer is waiting.', 'The ');
assert.equal(correctedFeedback.items[0].state, 'correct'); assert.equal(correctedFeedback.items[1].offset, 0);
assert.equal(typingFeedback('The customer', 'The cust').items[1].state, 'current');
assert.equal(typingFeedback('The customer', 'The  ').items[0].state, 'incorrect');
assert.equal(typingFeedback('The customer', 'The ', 1).activeIndex, 0);
assert.equal(typingFeedback('The customer', 'The ', 1).expected, 'h');
assert.equal(typingFeedback('café 😀\nNext', 'cafe\u0301 ').items[0].state, 'correct');
assert.equal(typingFeedback('Hello, world!', 'Hello ').items[0].state, 'incorrect');
assert.equal(typingFeedback('Hello, world!', 'Hello, wor').items[1].chars.at(-1).state, 'pending');
assert.equal(typingFeedback('a\r\nb', 'a\nb').complete, true);
assert.equal(typingFeedback('a\r\nb', 'a\nb').items.at(-1).state, 'correct');
assert.equal(typingFeedback('The customer', 'TheX ').items[0].rendered.map(c=>c.char).join(''), 'TheX ');
assert.equal(typingFeedback('The customer', 'TheX').expected, ' ');
console.log('Word feedback, correction, cursor, punctuation and Unicode assertions passed.');

// Independent full-matrix alignment oracle verifies the faster rolling rows
// preserve the published metric, including all equal-distance path choices.
function matrixOracle(text, reference) {
    const t = Array.from(text), r = Array.from(reference), d = Array.from({length:t.length+1}, (_,i)=>Array.from({length:r.length+1}, (_,j)=>i?j?0:i:j));
    for(let i=1;i<=t.length;i++)for(let j=1;j<=r.length;j++)d[i][j]=Math.min(d[i-1][j-1]+(t[i-1]===r[j-1]?0:1),d[i][j-1]+1,d[i-1][j]+1);
    let k=0;for(let j=1;j<=r.length;j++)if(d[t.length][j]<=d[t.length][k])k=j;
    let i=t.length,j=k,matched=0;while(i||j){if(i&&j&&t[i-1]===r[j-1]&&d[i][j]===d[i-1][j-1]){matched++;i--;j--;}else if(i&&j&&d[i][j]===d[i-1][j-1]+1){i--;j--;}else if(j&&d[i][j]===d[i][j-1]+1)j--;else i--;}
    return {matched, referenceLength:k, errors:d[t.length][k]};
}
let strings=[''];for(let length=1;length<=4;length++)strings.push(...strings.filter(s=>s.length===length-1).flatMap(s=>['a','b',' '].map(c=>s+c)));
for(const text of strings)for(const reference of strings){const actual=prefixTypingScore(text,reference,60),expected=matrixOracle(text,reference);for(const key of Object.keys(expected))assert.equal(actual[key],expected[key],JSON.stringify({text,reference,key}));}
console.log(`${strings.length**2} alignments match the independent scoring oracle.`);
