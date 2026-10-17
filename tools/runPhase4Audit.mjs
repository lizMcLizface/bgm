// Run with the Vite server active. JSON is checkpointed after each sound.
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return [key,value.join('=')||true];}));
const candidates=[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const executablePath=args.browser??candidates.find(existsSync);if(!executablePath)throw Error('Set CHROME_BIN or pass --browser=/path/to/chrome.');
const output=path.resolve(args.output??'.tmp/phase4-audit.json');await fs.mkdir(path.dirname(output),{recursive:true});
const groups=new Map();
const add=(preset,role,sound,modes)=>{const key=[preset,role,sound].join('/'),entry=groups.get(key)??{preset,auditRole:role,sound,modes:[]};entry.modes=[...new Set([...entry.modes,...modes])];groups.set(key,entry);};
for(const [preset,role,sound]of [['rainy-cafe','pad','library'],['fireside-folk','pad','library'],['fireside-folk','lead','library'],['zero-fun-zone','lead','library'],['oxygen-debt','bass','library'],['boss-fight-politely','pad','library'],['deep-night','pad','library'],['chapel-organ','pad','library'],['rainy-cafe','pad','generated'],['fireside-folk','lead','generated'],['zero-fun-zone','lead','generated'],['oxygen-debt','bass','generated'],['boss-fight-politely','pad','generated'],['deep-night','pad','generated']])add(preset,role,sound,['current']);
for(const [preset,role,sound]of [['rainy-cafe','pad','library'],['fireside-folk','pad','library'],['fireside-folk','bass','library'],['rainy-cafe','pad','generated'],['fireside-folk','lead','generated'],['zero-fun-zone','lead','generated'],['deep-night','pad','generated']])add(preset,role,sound,['reference','current','tight']);
for(const [preset,role]of [['rainy-cafe','lead'],['rainy-cafe','pad'],['fireside-folk','pad'],['boss-fight-politely','pad']])add(preset,role,'library',['current','slides']);
const report={complete:false,reports:[],errors:[],created:new Date().toISOString()};
const browser=await puppeteer.launch({executablePath,headless:true,pipe:true,protocolTimeout:240000,args:['--no-sandbox']});
try {
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(new URL('/tools/phase4.html',args.url??'http://127.0.0.1:5173').href);await page.waitForFunction(()=>window.__phase4Review);
 for(const group of groups.values()) {
  if(args.preset&&group.preset!==args.preset)continue;
  console.log('Audit '+group.preset+' / '+group.auditRole+' / '+group.sound+' / '+group.modes.join(', '));
  const options={...group,seed:42,soundSeed:12345,...(args.quick?{cases:['soft','hard','held','dense','cancel','resume',group.auditRole==='pad'?'chord-slide':'lead-slide']}:{})};
  report.reports.push(await page.evaluate(o=>window.__phase4Review.runSoundAudit(o),options));await fs.writeFile(output,JSON.stringify(report,null,2));
 }
 report.complete=true;report.cases=report.reports.reduce((n,r)=>n+r.rows.length,0);report.findings=report.reports.reduce((n,r)=>n+r.warningCount,0);
 await fs.writeFile(output,JSON.stringify(report,null,2));console.log(report.cases+' cases; '+report.findings+' findings; '+report.errors.length+' browser errors. '+output);
 if(report.findings||report.errors.length)process.exitCode=1;
}finally{await browser.close();}
