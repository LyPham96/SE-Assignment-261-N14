import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const screens=['login','home','hub','vehicle','book','parking','charge','reservations','edit','cancel','unlock','trip','return','report','dashboard','resources','alerts','incident','schedule','transfer','scenario','simulation','results','apply','settings'];
const browser=await chromium.launch({headless:true,channel:'chromium'});
const failures=[];
await Promise.all(['light-vi','light-en','dark-vi','dark-en'].map(async variant=>{
 const [theme,language]=variant.split('-');const dir=`mockups/${variant}`;await fs.mkdir(dir,{recursive:true});
 const context=await browser.newContext({viewport:{width:1100,height:1040},deviceScaleFactor:2});
 await context.addInitScript(({theme,language})=>{localStorage.setItem('pikepike-theme',theme);localStorage.setItem('pikepike-language',language)},{theme,language});
 const page=await context.newPage();page.on('pageerror',e=>failures.push(`${variant}: ${e.message}`));
 for(let i=0;i<screens.length;i++){
  await page.goto(`http://127.0.0.1:5173/?screen=${screens[i]}`);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(70);
  await page.locator('.phone').screenshot({path:`${dir}/${String(i+1).padStart(2,'0')}-${screens[i]}.png`});
 }
 await page.setViewportSize({width:393,height:852});await page.goto('http://127.0.0.1:5173/?screen=settings');
 const state=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,language:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth}));
 if(state.theme!==theme||state.language!==language||state.overflow)failures.push(`${variant}: ${JSON.stringify(state)}`);
 await fs.writeFile(`${dir}/index.html`,`<!doctype html><meta charset="utf-8"><title>PikePike ${variant}</title><style>body{font:15px Arial;background:${theme==='dark'?'#101b2b':'#fff'};color:${theme==='dark'?'#e1edff':'#233552'};padding:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px}img{width:100%}a{color:inherit;text-decoration:none}h2{font-size:15px}</style><h1>PikePike · ${variant}</h1><main>${screens.map((s,i)=>`<a href="${String(i+1).padStart(2,'0')}-${s}.png"><h2>${i+1}. ${s}</h2><img src="${String(i+1).padStart(2,'0')}-${s}.png"></a>`).join('')}</main>`);
 await context.close();
}));
const page=await browser.newPage({viewport:{width:393,height:852}});
await page.goto('http://127.0.0.1:5173/?screen=home');await page.getByRole('button',{name:'Cài đặt',exact:true}).click();
await page.getByRole('button',{name:'Tối',exact:true}).click();await page.getByRole('button',{name:'EN English Tiếng Anh'}).click();
await page.reload();await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
if(await page.evaluate(()=>document.documentElement.dataset.theme)!=='dark')failures.push('Theme not persisted');
await page.getByRole('button',{name:'Light',exact:true}).click();await page.getByRole('button',{name:'VI Tiếng Việt Vietnamese'}).click();
await page.getByRole('button',{name:'Quay lại',exact:true}).click();await page.getByRole('heading',{name:'Khám phá',exact:true}).waitFor();
await page.setViewportSize({width:1780,height:1100});
const images=await Promise.all(['light-vi','light-en','dark-vi','dark-en'].map(async v=>({variant:v,image:await fs.readFile(`mockups/${v}/25-settings.png`,'base64')})));
await page.setContent(`<body style="margin:0;padding:30px;background:#edf3f8;font-family:Arial;color:#233552"><h1>PikePike · Settings</h1><p>iPhone 14 Pro · Light / Dark · VI / EN</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px">${images.map(v=>`<div><h2 style="font-size:16px">${v.variant}</h2><img style="width:100%" src="data:image/png;base64,${v.image}"/></div>`).join('')}</div></body>`);
await page.screenshot({path:'mockups/00-settings-variants.png',fullPage:true});
await fs.writeFile('mockups/preferences.html','<!doctype html><meta charset="utf-8"><title>PikePike · 4 variants</title><style>body{font:17px Arial;background:#f3f7fb;color:#233552;padding:30px}a{display:inline-block;padding:16px;margin:8px;background:white;border:1px solid #b9d5ed;border-radius:12px;color:#3c65d1}img{width:100%;margin-top:20px}</style><h1>PikePike · Light / Dark · VI / EN</h1><p>25 screens × 4 variants = 100 phone mockups.</p>'+['light-vi','light-en','dark-vi','dark-en'].map(v=>`<a href="${v}/index.html">${v}</a>`).join('')+'<img src="00-settings-variants.png">');
await browser.close();if(failures.length)throw new Error(failures.join('\n'));
console.log('100 mockups exported. Settings navigation, theme/language toggles, persistence and 393×852 viewport passed.');
