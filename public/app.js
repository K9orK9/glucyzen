const $ = (id) => document.getElementById(id);
const fmt = (v, suffix='') => (v === null || v === undefined ? '—' : `${typeof v === 'number' ? Math.round(v * 100) / 100 : v}${suffix}`);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const setText = (id, value) => { const el=$(id); if(el) el.textContent=value; };
let latestData = null;

const routes = {
  dashboard:['Dashboard Glycémie & Loop','Vue unifiée LIVE + laboratoire local pour tester l’interface sans agir sur les dispositifs.'],
  glycemie:['Glycémie','Courbe avancée avec chaque relevé Dexcom, bolus, glucides et basale.'],
  loop:['Loop & insuline','État Loop, IOB, COB, basale et informations disponibles sur les appareils.'],
  historique:['Historique','Historique récent des valeurs et événements chargés depuis Nightscout.'],
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

document.addEventListener('click',e=>{const btn=e.target.closest('[data-route]');if(btn)setRoute(btn.dataset.route);});
window.addEventListener('hashchange',()=>setRoute((location.hash||'#dashboard').slice(1),false));

function glucoseColor(v){
  if(v<70) return '#f15b5d';
  if(v>180) return '#f2b84b';
  return '#24b47e';
}

function renderTimeline(data,target='chart'){
  const svg=typeof target==='string'?$(target):target;
  if(!svg) return;
  const timeline=data?.timeline||{};
  const points=(timeline.glucose?.length?timeline.glucose:data?.chart||[]).map(p=>({t:Number(p.t),value:Number(p.value)})).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.value)).sort((a,b)=>a.t-b.t);
  const events=(timeline.events||[]).map(e=>({...e,t:Number(e.t),value:Number(e.value)})).filter(e=>Number.isFinite(e.t)).sort((a,b)=>a.t-b.t);
  const basal=(timeline.basal||[]).map(b=>({...b,t:Number(b.t),rate:Number(b.rate)})).filter(b=>Number.isFinite(b.t)&&Number.isFinite(b.rate)).sort((a,b)=>a.t-b.t);

  const detail=target!=='chart';
  const width=900,height=detail?340:270,left=52,right=18,top=12,bottom=38;
  const basalTop=16, basalBottom=68;
  const plotTop=detail?82:76, plotBottom=height-(detail?72:62);
  const innerW=width-left-right;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.style.height=detail?'340px':'270px';

  if(!points.length){svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#8090a7" font-size="14">Aucune donnée graphique disponible</text>';return;}

  const hours=Number(timeline.hours||6);
  const maxT=Math.max(Date.now(),points.at(-1).t);
  const minT=maxT-hours*3600000;
  const pxX=t=>left+((t-minT)/Math.max(1,maxT-minT))*innerW;
  const vals=points.filter(p=>p.t>=minT).map(p=>p.value);
  const minVal=Math.min(...vals,70),maxVal=Math.max(...vals,180);
  const minY=Math.max(20,Math.floor((minVal-30)/20)*20),maxY=Math.min(450,Math.ceil((maxVal+40)/20)*20);
  const pxY=v=>plotTop+(maxY-v)/(maxY-minY)*(plotBottom-plotTop);

  let html='';
  html+=`<rect x="${left}" y="${basalTop}" width="${innerW}" height="${basalBottom-basalTop}" rx="8" fill="#f5f9ff"/>`;
  html+=`<text x="${left+6}" y="${basalTop+13}" font-size="10" fill="#6f7f9a">BASALE / TEMP BASAL</text>`;

  if(basal.length){
    const visibleBasal=basal.filter(b=>b.t>=minT-45*60000&&b.t<=maxT);
    const maxRate=Math.max(0.1,...visibleBasal.map(b=>b.rate));
    const rateY=r=>basalBottom-7-(r/maxRate)*(basalBottom-basalTop-23);
    const seed=visibleBasal[0];
    if(seed){
      const steps=[];
      let prevX=Math.max(left,pxX(seed.t)), prevY=rateY(seed.rate);
      steps.push(`M ${prevX} ${prevY}`);
      visibleBasal.slice(1).forEach(b=>{const x=Math.max(left,Math.min(width-right,pxX(b.t)));steps.push(`H ${x} V ${rateY(b.rate)}`);prevY=rateY(b.rate);});
      steps.push(`H ${width-right}`);
      html+=`<path d="${steps.join(' ')}" fill="none" stroke="#1598d8" stroke-width="2.2" stroke-linejoin="round"/>`;
      visibleBasal.forEach((b,i)=>{if(i%Math.max(1,Math.ceil(visibleBasal.length/8))!==0)return;const x=Math.max(left+12,Math.min(width-right-20,pxX(b.t)));html+=`<text x="${x}" y="${Math.max(basalTop+14,rateY(b.rate)-5)}" text-anchor="middle" font-size="9" fill="#087db8">${Math.round(b.rate*100)/100}U</text>`;});
    }
  } else html+=`<text x="${width-right-8}" y="${basalTop+26}" text-anchor="end" font-size="10" fill="#9aa7b9">basale non exposée</text>`;

  const targetTop=Math.min(maxY,180),targetBottom=Math.max(minY,70);
  if(targetTop>targetBottom) html+=`<rect x="${left}" y="${pxY(targetTop)}" width="${innerW}" height="${pxY(targetBottom)-pxY(targetTop)}" rx="6" fill="#eef9f5"/>`;
  [70,180].filter(v=>v>=minY&&v<=maxY).forEach(v=>{html+=`<line x1="${left}" x2="${width-right}" y1="${pxY(v)}" y2="${pxY(v)}" stroke="#dfe6ee" stroke-dasharray="3 4"/><text x="${left-8}" y="${pxY(v)+4}" text-anchor="end" font-size="10" fill="#8090a7">${v}</text>`;});

  for(let i=0;i<=6;i++){
    const t=minT+(i/6)*(maxT-minT),x=pxX(t);
    html+=`<line x1="${x}" x2="${x}" y1="${plotTop}" y2="${plotBottom}" stroke="#f0f3f7"/>`;
    html+=`<text x="${x}" y="${height-8}" text-anchor="middle" font-size="10" fill="#8090a7">${new Date(t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</text>`;
  }

  const visiblePoints=points.filter(p=>p.t>=minT&&p.t<=maxT);
  if(visiblePoints.length){
    const pathD=visiblePoints.map((p,i)=>`${i?'L':'M'} ${pxX(p.t)} ${pxY(p.value)}`).join(' ');
    html+=`<path d="${pathD}" fill="none" stroke="#33a58a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>`;
    visiblePoints.forEach(p=>{
      const c=glucoseColor(p.value),x=pxX(p.t),y=pxY(p.value);
      html+=`<circle cx="${x}" cy="${y}" r="4.2" fill="${c}" stroke="#fff" stroke-width="1.4"><title>${new Date(p.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ${Math.round(p.value)} mg/dL</title></circle>`;
    });
  }

  const eventRows=[plotBottom+22,plotBottom+43];
  let eventIndex=0;
  events.filter(e=>e.t>=minT&&e.t<=maxT).forEach(e=>{
    const x=pxX(e.t), row=eventRows[eventIndex++%2];
    const isCarbs=e.type==='carbs', icon=isCarbs?'🍞':'💉', label=e.label||`${e.value}${isCarbs?' g':' U'}`;
    const bg=isCarbs?'#fff3d8':'#eaf4ff',stroke=isCarbs?'#e6b85b':'#65a8e9',text=isCarbs?'#845c0a':'#216ba8';
    const w=Math.max(46,30+String(label).length*5.8),rx=Math.max(left,Math.min(width-right-w,x-w/2));
    html+=`<line x1="${x}" x2="${x}" y1="${plotBottom-3}" y2="${row-12}" stroke="${stroke}" stroke-width="1" stroke-dasharray="2 3"/>`;
    html+=`<rect x="${rx}" y="${row-15}" width="${w}" height="22" rx="10" fill="${bg}" stroke="${stroke}" stroke-width="1"/>`;
    html+=`<text x="${rx+7}" y="${row}" font-size="10.5" fill="${text}">${icon} ${esc(label)}<title>${new Date(e.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ${esc(label)}</title></text>`;
  });

  html+=`<g transform="translate(${left+5},${plotTop+12})"><circle cx="0" cy="0" r="4" fill="#24b47e"/><text x="8" y="4" font-size="9" fill="#65758b">mesure Dexcom</text><text x="92" y="4" font-size="9" fill="#845c0a">🍞 glucides</text><text x="158" y="4" font-size="9" fill="#216ba8">💉 bolus</text></g>`;
  svg.innerHTML=html;
}

function renderDetailViews(data){
  const g=data.glucose||{},loop=data.loop||{},ins=data.insulin||{},d=data.devices||{},r=data.range||{};
  setText('detailGlucose',fmt(g.value));setText('detailTrend',g.trend||'—');setText('detailTrendLabel',g.trendLabel||'—');
  setText('detailGlucoseAge',g.minutesAgo==null?'—':`il y a ${g.minutesAgo} min`);setText('detailDelta',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);
  setText('detailCurrent',g.value==null?'—':`${g.value} mg/dL`);setText('detailDelta2',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);setText('detailTrend2',`${g.trend||'—'} ${g.trendLabel||''}`.trim());setText('detailFreshness',g.minutesAgo==null?'—':`${g.minutesAgo} min`);
  renderTimeline(data,'glucoseDetailChart');

  setText('detailLoopMode',loop.mode||'—');setText('detailLoopAge',loop.lastLoopMinutes==null?'—':`il y a ${loop.lastLoopMinutes} min`);setText('detailLoopDetail',loop.modeDetail||'—');setText('detailPrediction',loop.prediction?.points?.length?`Min ${Math.round(loop.prediction.min)} · fin ${Math.round(loop.prediction.end)} mg/dL`:'Non exposée');
  setText('detailIob',fmt(ins.iob,' U'));setText('detailCob',fmt(ins.cob,' g'));setText('detailBasal',fmt(ins.basal,' U/h'));setText('detailBolus',ins.lastBolus==null?'—':`${ins.lastBolus} U à ${ins.lastBolusTime||'—'}`);
  setText('detailBattery',d.pumpBattery==null?'—':`${d.pumpBattery} %`);setText('detailReservoir',d.reservoir==null?'—':`${d.reservoir} U`);setText('detailPod',d.podAgeHours==null?'—':`${d.podAgeHours} h${d.podEstimated?' (estimé)':''}`);setText('detailSensor',d.sensorAgeHours==null?'—':`${d.sensorAgeHours} h${d.sensorEstimated?' (estimé)':''}`);

  renderTimeline(data,'historyChart');
  const rows=$('historyRows');if(rows){const history=(data.timeline?.glucose||data.chart||[]).slice(-18).reverse();rows.innerHTML=history.length?history.map(p=>{const v=Number(p.value),state=v<70?'Bas':v>180?'Haut':'Dans la plage';return `<tr><td>${new Date(p.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td><b>${Math.round(v)} mg/dL</b></td><td><span class="history-state ${state==='Bas'?'low':state==='Haut'?'high':'ok'}">${state}</span></td></tr>`}).join(''):'<tr><td colspan="3">Aucune donnée récente disponible.</td></tr>';}

  setText('reportPeriod',r.label||'Période disponible');setText('reportTir',r.inRange==null?'—':`${r.inRange} %`);setText('reportIn',r.inRange==null?'—':`${r.inRange} %`);setText('reportLow',r.low==null?'—':`${r.low} %`);setText('reportHigh',r.high==null?'—':`${r.high} %`);setText('reportSamples',r.sampleCount??'—');setText('reportCoverage',r.coverageHours==null?'—':`${r.coverageHours} h`);
  const rin=r.inRange??0,rlow=r.low??0,rhigh=r.high??0;if($('reportTirIn'))$('reportTirIn').style.width=`${rin}%`;if($('reportTirLow'))$('reportTirLow').style.width=`${rlow}%`;if($('reportTirHigh'))$('reportTirHigh').style.width=`${rhigh}%`;
  setText('settingsSource',data.source==='nightscout-live'?'Nightscout LIVE':data.source||'—');
}

function render(data){
  latestData=data;window.glucyzenLatestData=data;
  const g=data.glucose||{};setText('glucoseValue',fmt(g.value));setText('trendArrow',g.trend||'—');setText('trendLabel',g.trendLabel||'—');setText('glucoseAge',g.minutesAgo==null?'—':`il y a ${g.minutesAgo} min`);setText('delta',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);
  const loop=data.loop||{};setText('loopMode',loop.mode||'—');if($('loopMode'))$('loopMode').className=`pill ${loop.status==='stale'?'warning-pill':'success'}`;setText('loopAge',loop.lastLoopMinutes==null?'—':`il y a ${loop.lastLoopMinutes} min`);setText('loopDetail',loop.modeDetail||'—');setText('prediction',loop.prediction?.points?.length?`Min ${Math.round(loop.prediction.min)} · fin ${Math.round(loop.prediction.end)} mg/dL`:'Non exposée dans les données reçues');
  const insulin=data.insulin||{};setText('iob',fmt(insulin.iob,' U'));setText('cob',fmt(insulin.cob,' g'));setText('basal',fmt(insulin.basal,' U/h'));setText('basalSource',insulin.basalSource?`source : ${insulin.basalSource}`:'source indisponible');setText('bolus',insulin.lastBolus==null?'—':`${insulin.lastBolus} U à ${insulin.lastBolusTime||'—'}`);
  const devices=data.devices||{};setText('pumpBattery',devices.pumpBattery==null?'—':`${devices.pumpBattery} %`);setText('reservoir',devices.reservoir==null?'—':`${devices.reservoir} U`);setText('pod',devices.podAgeHours==null?'—':`${devices.podAgeHours} h${devices.podEstimated?' (estimé)':''}`);setText('sensor',devices.sensorAgeHours==null?'—':`${devices.sensorAgeHours} h${devices.sensorEstimated?' (estimé)':''}`);setText('sensorEnd',devices.sensorExpiresAt?`fin estimée : ${devices.sensorExpiresAt}`:'fin non disponible');setText('dexcom',devices.dexcom||'—');
  const r=data.range||{},rin=r.inRange??0,rlow=r.low??0,rhigh=r.high??0;if($('tirIn'))$('tirIn').style.width=`${rin}%`;if($('tirLow'))$('tirLow').style.width=`${rlow}%`;if($('tirHigh'))$('tirHigh').style.width=`${rhigh}%`;setText('tirInText',r.inRange==null?'—':`${r.inRange} %`);setText('tirLowText',r.low==null?'—':`${r.low} %`);setText('tirHighText',r.high==null?'—':`${r.high} %`);setText('tirPeriod',r.label||'Période disponible');setText('tirSamples',r.sampleCount?`${r.sampleCount} mesures`:'—');
  if($('aiAdvice'))$('aiAdvice').innerHTML=(data.aiAdvice||[]).map((t,i)=>`<div class="advice"><i>${i+1}</i><span>${esc(t)}</span></div>`).join('');if($('systemAlerts'))$('systemAlerts').innerHTML=(data.systemAlerts||[]).map(a=>`<div class="alert ${esc(a.severity||'info')}">${esc(a.text)}</div>`).join('');
  setText('lastRefresh',new Date(data.generatedAt||Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));const source=data.source||'mock';setText('sourceLabel',source==='nightscout-live'?'LIVE · Nightscout':source==='nightscout-error'?'LIVE · ERREUR':'Mode démo');setText('readOnlyBadge',data.connection?.readOnly===true?'🔒 Flux réel lecture seule':'Démo');document.body.dataset.source=source;
  let globalText='Données à jour',globalClass='big-ok';if(source==='nightscout-error'){globalText='Données indisponibles';globalClass='big-status danger';}else if(g.minutesAgo!=null&&g.minutesAgo>12){globalText='Données anciennes';globalClass='big-status warn';}else if(g.value!=null&&g.value<70){globalText='Sous la plage affichée';globalClass='big-status warn';}else if(g.value!=null&&g.value>180){globalText='Au-dessus de la plage affichée';globalClass='big-status warn';}setText('globalState',globalText);if($('globalState'))$('globalState').className=globalClass;setText('globalDetail',source==='nightscout-live'?'Nightscout connecté · aucune écriture réelle':'Vérifie la source de données');
  renderTimeline(data,'chart');renderDetailViews(data);window.dispatchEvent(new CustomEvent('glucyzen:data',{detail:data}));
}

async function load(){try{const res=await fetch('/api/live',{cache:'no-store'});const data=await res.json();render(data);if(!res.ok)console.error('API live:',data.error||res.statusText);}catch(e){setText('sourceLabel','Erreur de chargement');if($('systemAlerts'))$('systemAlerts').innerHTML='<div class="alert warning">Impossible de joindre le serveur GlucyZen.</div>';console.error(e);}}

setRoute((location.hash||'#dashboard').slice(1),false);
load();
setInterval(load,30000);
