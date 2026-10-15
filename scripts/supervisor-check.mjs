import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,channel:'chromium'});
const failures=[];
for(const theme of ['light','dark'])for(const language of ['vi','en']){
 const page=await browser.newPage({viewport:{width:393,height:852}});
 await page.addInitScript(({theme,language})=>{localStorage.setItem('pikepike-theme',theme);localStorage.setItem('pikepike-language',language)},{theme,language});
 page.on('pageerror',e=>failures.push(e.message));
 await page.goto('http://127.0.0.1:5173/?screen=dashboard');
 for(const [index,route] of ['alerts','incident','schedule','transfer','scenario','results'].entries()){
  await page.locator('.supervisor-links>button').nth(index).click();
  if(new URL(page.url()).searchParams.get('screen')!==route)failures.push(`${theme}/${language}: shortcut ${route}`);
  await page.locator('.bottom-nav>button').first().click();
 }
 for(let index=0;index<3;index++){
  await page.locator('.supervisor-metrics>button').nth(index).click();
  if(new URL(page.url()).searchParams.get('screen')!=='resources')failures.push('Metric did not open resources');
  if(!await page.locator('.chips>button').nth(index).evaluate(e=>e.classList.contains('active')))failures.push('Resource tab not preserved');
  await page.locator('.bottom-nav>button').first().click();
 }
 await page.locator('.network-table-row').nth(1).click();
 const selectedHub=await page.locator('.page-title p').innerText();
 if(!selectedHub.includes(language==='vi'?'Ký túc xá khu A':'Dormitory Zone A'))failures.push('Selected Hub not preserved');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))failures.push('Horizontal overflow');
 await page.close();
}
await browser.close();if(failures.length)throw new Error(failures.join('\n'));
console.log('Supervisor dashboard passed in 4 variants: 6 workflow shortcuts, 3 resource tabs, selected Hub context and return navigation.');
