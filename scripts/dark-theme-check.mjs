import { chromium } from 'playwright';
const screens=['login','home','hub','vehicle','book','parking','charge','reservations','edit','cancel','unlock','trip','return','report','dashboard','resources','alerts','incident','schedule','transfer','scenario','simulation','results','apply','settings'];
const browser=await chromium.launch({channel:'chromium',headless:true});
const failures=[];
for(const language of ['vi','en']){
 const page=await browser.newPage({viewport:{width:393,height:852}});
 await page.addInitScript(language=>{localStorage.setItem('pikepike-theme','dark');localStorage.setItem('pikepike-language',language)},language);
 page.on('pageerror',e=>failures.push(e.message));
 for(const screen of screens){
  await page.goto(`http://127.0.0.1:5173/?screen=${screen}`);await page.evaluate(()=>document.fonts.ready);
  const issues=await page.locator('.phone').evaluate(root=>{
   const issues=[];
   for(const element of root.querySelectorAll('*')){
    // The light appearance preview is intentionally white. Map roads are clipped internally.
    if(element.closest('.theme-thumbnail.light,svg,.road'))continue;
    const style=getComputedStyle(element),rect=element.getBoundingClientRect();
    if(!rect.width||!rect.height||style.display==='none'||style.visibility==='hidden')continue;
    const color=style.backgroundColor.match(/[\d.]+/g)?.map(Number);
    if(color&&color[0]>235&&color[1]>235&&color[2]>235&&(color.length<4||color[3]>.75))issues.push(`white surface: ${element.className||element.tagName}`);
    if(rect.right>innerWidth+1||rect.left< -1)issues.push(`horizontal overflow: ${element.className||element.tagName}`);
   }
   const heading=root.querySelector('.title-row h1'),action=root.querySelector('.title-action');
   if(heading&&action){const h=heading.getBoundingClientRect(),a=action.getBoundingClientRect();if(heading.scrollWidth>h.width+1||h.right>a.left)issues.push('title/action overlap');}
   const banner=root.querySelector('.ride-banner');
   if(banner&&getComputedStyle(banner).clipPath==='none')issues.push('banner blur not clipped');
   return issues;
  });
  failures.push(...issues.map(issue=>`${language}/${screen}: ${issue}`));
 }
 await page.close();
}
await browser.close();
if(failures.length)throw new Error(failures.join('\n'));
console.log('50 dark-theme screens checked: no unintended white surfaces, horizontal overflow, title/action overlaps or unclipped banner blur.');
