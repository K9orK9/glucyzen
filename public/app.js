const $ = (id) => document.getElementById(id);
const fmt = (v, suffix='') => (v === null || v === undefined ? '—' : `${typeof v === 'number' ? Math.round(v * 100) / 100 : v}${suffix}`);
const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const setText = (id, value) => { const el=$(id); if(el) el.textContent=value; };
let latestData = null;

const routes = {
  dashboard:['Dashboard Glycémie & Loop','Vue unifiée LIVE + laboratoire local pour tester l’interface sans agir sur les dispositifs.'],
  glycemie:['Glycémie','Vue détaillée des mesures Dexcom ONE+ reçues via Nightscout.'],
  loop:['Loop & insuline','État Loop, IOB, COB, basale et informations disponibles sur les appareils.'],
  historique:['Historique','Historique récent des valeurs actuellement chargées depuis Nightscout.'],
  rapports:['Rapports','Synthèse du temps dans la cible sur la période réellement disponible.'],
  assistant:['Assistant IA','Analyse descriptive et rappels, sans décision thérapeutique ni calcul de dose.'],
  labo:['Mode labo','Tester les futures interactions de l’interface sans aucune commande réelle.'],
  parametres:['Paramètres','État de la connexion locale et raccourcis de maintenance.']
};

function setRoute(route, pushHash=true){
  if(!routes[route]) route='dashboard';
  document.querySelectorAll('.page-view').forEach(v=>v.classList.toggle('active',v.dataset.view===route));
  document.querySelectorAll('[data-route]').forEach(btn=>btn.classList.toggle('active',btn.dataset.route===route && btn.classList.contains('nav')));
  setText('pageTitle',routes[route][0]); setText('pageSubtitle',routes[route][1]);
  if(pushHash && location.hash!==`#${route}`) history.pushState(null,'',`#${route}`);
  window.scrollTo({top:0,behavior:'smooth'});
  if(latestData) renderDetailViews(latestData);
}

document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-route]');
  if(!btn) return;
  setRoute(btn.dataset.route);
});
window.addEventListener('hashchange',()=>setRoute((location.hash||'#dashboard').slice(1),false));

function renderChart(points,target='chart'){
  const svg=typeof target==='string'?$(target):target;
  if(!svg) return;
  const width=760,height=target==='chart'?220:260,left=44,right=12,top=14,bottom=30;
  const innerW=width-left-right,innerH=height-top-bottom;
  const normalized=(points||[]).map((p,i)=>Array.isArray(p)?{t:i,value:Number(p[1])}:{t:Number(p.t),value:Number(p.value)}).filter(p=>Number.isFinite(p.value));
  if(!normalized.length){svg.innerHTML=`<text x="50%" y="50%" text-anchor="middle" fill="#8090a7" font-size="14">Aucune donnée graphique disponible</text>`;return;}
  const minVal=Math.min(...normalized.map(p=>p.value),70),maxVal=Math.max(...normalized.map(p=>p.value),180);
  const minY=Math.max(20,Math.floor((minVal-30)/20)*20),maxY=Math.min(450,Math.ceil((maxVal+40)/20)*20);
  const pxY=v=>top+(maxY-v)/(maxY-minY)*innerH;
  const times=normalized.map(p=>p.t).filter(Number.isFinite);
  const hasRealTime=times.length===normalized.length && Math.max(...times)>1e12;
  const minT=hasRealTime?Math.min(...times):0,maxT=hasRealTime?Math.max(...times):Math.max(1,normalized.length-1);
  const pxX=(p,i)=>left+(((hasRealTime?p.t:i)-minT)/Math.max(1,maxT-minT))*innerW;
  let html='';
  const targetTop=Math.min(maxY,180),targetBottom=Math.max(minY,70);
  if(targetTop>targetBottom) html+=`<rect x="${left}" y="${pxY(targetTop)}" width="${innerW}" height="${pxY(targetBottom)-pxY(targetTop)}" rx="8" fill="#e8f8f1"/>`;
  [70,180].filter(v=>v>=minY&&v<=maxY).forEach(v=>{html+=`<line x1="${left}" x2="${width-right}" y1="${pxY(v)}" y2="${pxY(v)}" stroke="#e8edf4"/><text x="4" y="${pxY(v)+4}" font-size="11" fill="#8090a7">${v}</text>`});
  for(let i=0;i<6;i++){const x=left+(i/5)*innerW;html+=`<line x1="${x}" x2="${x}" y1="${top}" y2="${height-bottom}" stroke="#f0f3f7"/>`}
  const d=normalized.map((p,i)=>`${i?'L':'M'} ${pxX(p,i)} ${pxY(p.value)}`).join(' ');
  html+=`<path d="${d}" fill="none" stroke="#24b47e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const last=normalized[normalized.length-1];html+=`<circle cx="${pxX(last,normalized.length-1)}" cy="${pxY(last.value)}" r="6" fill="#24b47e" stroke="white" stroke-width="3"/>`;
  const startLabel=hasRealTime?new Date(minT).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'début';
  const endLabel=hasRealTime?new Date(maxT).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'maintenant';
  html+=`<text x="${left}" y="${height-5}" font-size="11" fill="#8090a7">${startLabel}</text><text x="${width-right-45}" y="${height-5}" font-size="11" fill="#8090a7">${endLabel}</text>`;
  svg.innerHTML=html;
}

function renderDetailViews(data){
  const g=data.glucose||{},loop=data.loop||{},ins=data.insulin||{},d=data.devices||{},r=data.range||{};
  setText('detailGlucose',fmt(g.value)); setText('detailTrend',g.trend||'—'); setText('detailTrendLabel',g.trendLabel||'—');
  setText('detailGlucoseAge',g.minutesAgo==null?'—':`il y a ${g.minutesAgo} min`); setText('detailDelta',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);
  setText('detailCurrent',g.value==null?'—':`${g.value} mg/dL`); setText('detailDelta2',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);
  setText('detailTrend2',`${g.trend||'—'} ${g.trendLabel||''}`.trim()); setText('detailFreshness',g.minutesAgo==null?'—':`${g.minutesAgo} min`);
  renderChart(data.chart||[],'glucoseDetailChart');

  setText('detailLoopMode',loop.mode||'—'); setText('detailLoopAge',loop.lastLoopMinutes==null?'—':`il y a ${loop.lastLoopMinutes} min`); setText('detailLoopDetail',loop.modeDetail||'—');
  setText('detailPrediction',loop.prediction?.points?.length?`Min ${Math.round(loop.prediction.min)} · fin ${Math.round(loop.prediction.end)} mg/dL`:'Non exposée');
  setText('detailIob',fmt(ins.iob,' U')); setText('detailCob',fmt(ins.cob,' g')); setText('detailBasal',fmt(ins.basal,' U/h')); setText('detailBolus',ins.lastBolus==null?'—':`${ins.lastBolus} U à ${ins.lastBolusTime||'—'}`);
  setText('detailBattery',d.pumpBattery==null?'—':`${d.pumpBattery} %`); setText('detailReservoir',d.reservoir==null?'—':`${d.reservoir} U`); setText('detailPod',d.podAgeHours==null?'—':`${d.podAgeHours} h${d.podEstimated?' (estimé)':''}`); setText('detailSensor',d.sensorAgeHours==null?'—':`${d.sensorAgeHours} h${d.sensorEstimated?' (estimé)':''}`);

  renderChart(data.chart||[],'historyChart');
  const rows=$('historyRows');
  if(rows){
    const history=(data.chart||[]).slice(-18).reverse();
    rows.innerHTML=history.length?history.map(p=>{const v=Number(p.value);const state=v<70?'Bas':v>180?'Haut':'Dans la plage';return `<tr><td>${new Date(p.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td><b>${Math.round(v)} mg/dL</b></td><td><span class="history-state ${state==='Bas'?'low':state==='Haut'?'high':'ok'}">${state}</span></td></tr>`}).join(''):'<tr><td colspan="3">Aucune donnée récente disponible.</td></tr>';
  }

  setText('reportPeriod',r.label||'Période disponible'); setText('reportTir',r.inRange==null?'—':`${r.inRange} %`); setText('reportIn',r.inRange==null?'—':`${r.inRange} %`); setText('reportLow',r.low==null?'—':`${r.low} %`); setText('reportHigh',r.high==null?'—':`${r.high} %`); setText('reportSamples',r.sampleCount??'—'); setText('reportCoverage',r.coverageHours==null?'—':`${r.coverageHours} h`);
  const rin=r.inRange??0,rlow=r.low??0,rhigh=r.high??0; if($('reportTirIn')) $('reportTirIn').style.width=`${rin}%`; if($('reportTirLow')) $('reportTirLow').style.width=`${rlow}%`; if($('reportTirHigh')) $('reportTirHigh').style.width=`${rhigh}%`;
  setText('settingsSource',data.source==='nightscout-live'?'Nightscout LIVE':data.source||'—');
}

function render(data){
  latestData=data; window.glucyzenLatestData=data;
  const g=data.glucose||{};
  setText('glucoseValue',fmt(g.value)); setText('trendArrow',g.trend||'—'); setText('trendLabel',g.trendLabel||'—'); setText('glucoseAge',g.minutesAgo==null?'—':`il y a ${g.minutesAgo} min`); setText('delta',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);
  const loop=data.loop||{}; setText('loopMode',loop.mode||'—'); if($('loopMode')) $('loopMode').className=`pill ${loop.status==='stale'?'warning-pill':'success'}`; setText('loopAge',loop.lastLoopMinutes==null?'—':`il y a ${loop.lastLoopMinutes} min`); setText('loopDetail',loop.modeDetail||'—'); setText('prediction',loop.prediction?.points?.length?`Min ${Math.round(loop.prediction.min)} · fin ${Math.round(loop.prediction.end)} mg/dL`:'Non exposée dans les données reçues');
  const insulin=data.insulin||{}; setText('iob',fmt(insulin.iob,' U')); setText('cob',fmt(insulin.cob,' g')); setText('basal',fmt(insulin.basal,' U/h')); setText('basalSource',insulin.basalSource?`source : ${insulin.basalSource}`:'source indisponible'); setText('bolus',insulin.lastBolus==null?'—':`${insulin.lastBolus} U à ${insulin.lastBolusTime||'—'}`);
  const devices=data.devices||{}; setText('pumpBattery',devices.pumpBattery==null?'—':`${devices.pumpBattery} %`); setText('reservoir',devices.reservoir==null?'—':`${devices.reservoir} U`); setText('pod',devices.podAgeHours==null?'—':`${devices.podAgeHours} h${devices.podEstimated?' (estimé)':''}`); setText('sensor',devices.sensorAgeHours==null?'—':`${devices.sensorAgeHours} h${devices.sensorEstimated?' (estimé)':''}`); setText('sensorEnd',devices.sensorExpiresAt?`fin estimée : ${devices.sensorExpiresAt}`:'fin non disponible'); setText('dexcom',devices.dexcom||'—');
  const r=data.range||{},rin=r.inRange??0,rlow=r.low??0,rhigh=r.high??0; if($('tirIn')) $('tirIn').style.width=`${rin}%`; if($('tirLow')) $('tirLow').style.width=`${rlow}%`; if($('tirHigh')) $('tirHigh').style.width=`${rhigh}%`; setText('tirInText',r.inRange==null?'—':`${r.inRange} %`); setText('tirLowText',r.low==null?'—':`${r.low} %`); setText('tirHighText',r.high==null?'—':`${r.high} %`); setText('tirPeriod',r.label||'Période disponible'); setText('tirSamples',r.sampleCount?`${r.sampleCount} mesures`:'—');
  if($('aiAdvice')) $('aiAdvice').innerHTML=(data.aiAdvice||[]).map((t,i)=>`<div class="advice"><i>${i+1}</i><span>${esc(t)}</span></div>`).join('');
  if($('systemAlerts')) $('systemAlerts').innerHTML=(data.systemAlerts||[]).map(a=>`<div class="alert ${esc(a.severity||'info')}">${esc(a.text)}</div>`).join('');
  setText('lastRefresh',new Date(data.generatedAt||Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
  const source=data.source||'mock'; setText('sourceLabel',source==='nightscout-live'?'LIVE · Nightscout':source==='nightscout-error'?'LIVE · ERREUR':'Mode démo'); setText('readOnlyBadge',data.connection?.readOnly===true?'🔒 Flux réel lecture seule':'Démo'); document.body.dataset.source=source;
  let globalText='Données à jour',globalClass='big-ok'; if(source==='nightscout-error'){globalText='Données indisponibles';globalClass='big-status danger';} else if(g.minutesAgo!=null&&g.minutesAgo>12){globalText='Données anciennes';globalClass='big-status warn';} else if(g.value!=null&&g.value<70){globalText='Sous la plage affichée';globalClass='big-status warn';} else if(g.value!=null&&g.value>180){globalText='Au-dessus de la plage affichée';globalClass='big-status warn';} setText('globalState',globalText); if($('globalState')) $('globalState').className=globalClass; setText('globalDetail',source==='nightscout-live'?'Nightscout connecté · aucune écriture réelle':'Vérifie la source de données');
  renderChart(data.chart||[],'chart'); renderDetailViews(data); window.dispatchEvent(new CustomEvent('glucyzen:data',{detail:data}));
}

async function load(){
  try{const res=await fetch('/api/live',{cache:'no-store'});const data=await res.json();render(data);if(!res.ok) console.error('API live:',data.error||res.statusText);}catch(e){setText('sourceLabel','Erreur de chargement');if($('systemAlerts')) $('systemAlerts').innerHTML='<div class="alert warning">Impossible de joindre le serveur GlucyZen.</div>';console.error(e);}
}

setRoute((location.hash||'#dashboard').slice(1),false);
load();
setInterval(load,30000);
