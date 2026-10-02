import assert from 'node:assert/strict';
import { prefixTypingScore, validateAssessment, candidateModule, cleanModule } from '../lib/assessment.ts';
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
