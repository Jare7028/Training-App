import assert from 'node:assert/strict';
import { prefixTypingScore } from '../lib/assessment.ts';

// Runs on an actual signed-out attempt. The caller owns fixture cleanup.
export async function checkTypingInteraction(page, passage, pass, audit, device, screenshotPath) {
    const input = page.getByLabel('Your typed copy', {exact:true});
    const stage = page.locator('[data-typing-test]').filter({has: input});
    const reference = stage.getByRole('region', {name:'Typing reference passage',exact:true});
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Your typed copy',null,{timeout:2000});
    assert.ok(await input.evaluate(node=>node===document.activeElement));
    assert.equal(await stage.locator('[data-typing-accuracy]').innerText(), '—');
    const first = passage.match(/^\S+/u)[0];
    const wrong = (first[0]==='Z'?'Q':'Z')+first.slice(1);
    await input.pressSequentially(wrong+' ', {delay:20});
    await stage.locator('[data-state="incorrect"]').first().waitFor();
    assert.equal(await stage.locator('[data-current="true"]').count(),1);
    assert.ok(Number(await stage.locator('[data-typing-errors]').innerText())>0);
    for(let n=0;n<wrong.length+1;n++)await input.press('Backspace');await input.pressSequentially(first+' ',{delay:20});
    await page.waitForFunction(()=>document.querySelector('[data-mode="active"] [data-typing-accuracy]')?.textContent?.trim()==='100.0%');
    assert.equal(await stage.locator('[data-state="correct"]').count(),1);
    assert.ok((await stage.locator('[data-current="true"]').innerText()).startsWith(passage.split(/\s/u)[1]));
    pass(device+' real keystrokes move the caret, mark wrong words and remove corrected mistakes');
    const beforePaste=await input.inputValue();
    await input.evaluate(node=>{const data=new DataTransfer();data.setData('text/plain','PASTED ANSWER');node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
    assert.equal(await input.inputValue(),beforePaste);await stage.getByText('Please type the passage. Pasting is disabled for this sample.',{exact:true}).waitFor();
    await input.evaluate(node=>node.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()})));
    assert.equal(await input.inputValue(),beforePaste);
    await input.press('ControlOrMeta+Home');
    assert.ok((await stage.locator('[data-current="true"]').innerText()).startsWith(first));
    await input.press('Tab');assert.ok(!(await input.evaluate(node=>node===document.activeElement)));
    await reference.focus();await reference.press('Enter');assert.ok(await input.evaluate(node=>node===document.activeElement));
    pass(device+' paste/drop protection and keyboard correction preserve focus navigation');
    const target=passage.lastIndexOf(' ');
    await input.fill(passage.slice(0,target+1));
    await page.waitForFunction(()=>document.querySelector('[aria-label="Typing reference passage"]')?.scrollTop>0);
    const geometry=await stage.locator('[data-current="true"]').evaluate(word=>{const region=word.closest('[role="region"]');const caret=word.querySelector('[class*="caret"]')||word;const a=caret.getBoundingClientRect(),b=region.getBoundingClientRect();return {visible:a.top>=b.top&&a.bottom<=b.bottom,scroll:region.scrollTop};});
    assert.ok(geometry.visible);assert.ok(geometry.scroll>0);
    const sample=wrong+passage.slice(first.length,120);
    await input.fill(sample);
    const expected=prefixTypingScore(sample,passage,60);
    await page.waitForFunction(({errors,accuracy})=>{const root=document.querySelector('[data-mode="active"]');return root?.querySelector('[data-typing-errors]')?.textContent===String(errors)&&root?.querySelector('[data-typing-accuracy]')?.textContent?.trim()===accuracy.toFixed(1)+'%';},expected);
    assert.ok(Number.parseFloat(await stage.locator('[data-typing-wpm]').innerText())>0);
    await input.blur();await reference.click();assert.ok(await input.evaluate(node=>node===document.activeElement));
    await audit(page,device+' typing errors, live measurements, caret and mobile reflow');
    await stage.screenshot({path:screenshotPath});
    pass(device+' reference follows long passages and live measurements match the scoring metric');
}
