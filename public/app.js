const $ = (id) => document.getElementById(id);
const fmt = (v, suffix='') => (v === null || v === undefined ? '—' : `${typeof v === 'number' ? Math.round(v * 100) / 100 : v}${suffix}`);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setText = (id, value) => { const el=$(id); if(el) el.textContent=value; };
let latestData = null;

const RANGE_KEY = 'glucyzen.timeline.range.v1';
const LAYERS_KEY = 'glucyzen.timeline.layers.v1';
const TIMELINE_RANGES = [1,2,3,4,6,12,24];
let timelineHours = Number(localStorage.getItem(RANGE_KEY) || 6);
if(!TIMELINE_RANGES.includes(timelineHours)) timelineHours = 6;
let timelineLayers = { carbs:true, bolus:true, basal:true };
try { timelineLayers = { ...timelineLayers, ...JSON.parse(localStorage.getItem(LAYERS_KEY) || '{}') }; } catch(_) {}

let tooltipPinned = false;
let tooltipEventKey = null;

const routes = {
  dashboard:['Dashboard Glycémie & Loop','Vue unifiée LIVE + laboratoire local pour tester l’interface sans agir sur les dispositifs.'],
  glycemie:['Glycémie','Courbe avancée avec chaque relevé Dexcom, bolus, glucides, basale et événements détaillés Nightscout.'],
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
  setText('pageTitle',routes[route][0]);
  setText('pageSubtitle',routes[route][1]);
  if(pushHash && location.hash!==`#${route}`) history.pushState(null,'',`#${route}`);
  window.scrollTo({top:0,behavior:'smooth'});
  hideTimelineTooltip(true);
  if(latestData) renderDetailViews(latestData);
}

document.addEventListener('click',e=>{
  const routeBtn=e.target.closest('[data-route]');
  if(routeBtn){setRoute(routeBtn.dataset.route);return;}
  const rangeBtn=e.target.closest('[data-timeline-range]');
  if(rangeBtn){
    const h=Number(rangeBtn.dataset.timelineRange);
    if(TIMELINE_RANGES.includes(h)){
      timelineHours=h;
      localStorage.setItem(RANGE_KEY,String(h));
      syncTimelineControls();
      hideTimelineTooltip(true);
      if(latestData) renderAllTimelines(latestData);
    }
    return;
  }
  const layerBtn=e.target.closest('[data-timeline-layer]');
  if(layerBtn){
    const layer=layerBtn.dataset.timelineLayer;
    if(layer in timelineLayers){
      timelineLayers[layer]=!timelineLayers[layer];
      localStorage.setItem(LAYERS_KEY,JSON.stringify(timelineLayers));
      syncTimelineControls();
      hideTimelineTooltip(true);
      if(latestData) renderAllTimelines(latestData);
    }
    return;
  }
  if(!e.target.closest('.timeline-event-tooltip') && !e.target.closest('.timeline-event-marker')) hideTimelineTooltip(true);
});
window.addEventListener('hashchange',()=>setRoute((location.hash||'#dashboard').slice(1),false));
window.addEventListener('resize',()=>hideTimelineTooltip(true));
window.addEventListener('scroll',()=>{ if(!tooltipPinned) hideTimelineTooltip(true); },true);

function injectTimelineStyles(){
  if(document.querySelector('link[data-glucyzen-timeline-css]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/timeline-v10.css';
  link.dataset.glucyzenTimelineCss='1';
  document.head.appendChild(link);
}

function installTimelineControls(){
  ['chart','glucoseDetailChart','historyChart'].forEach(id=>{
    const svg=$(id);
    if(!svg || svg.previousElementSibling?.classList?.contains('timeline-toolbar')) return;
    const bar=document.createElement('div');
    bar.className='timeline-toolbar';
    bar.innerHTML=`<div class="timeline-range-group"><span>Période</span>${TIMELINE_RANGES.map(h=>`<button type="button" data-timeline-range="${h}">${h} h</button>`).join('')}</div><div class="timeline-layer-group"><span>Afficher</span><button type="button" data-timeline-layer="carbs">🍞 Glucides</button><button type="button" data-timeline-layer="bolus">💉 Bolus</button><button type="button" data-timeline-layer="basal">〽 Basale</button></div>`;
    svg.parentNode.insertBefore(bar,svg);
  });
  syncTimelineControls();
}

function syncTimelineControls(){
  document.querySelectorAll('[data-timeline-range]').forEach(b=>b.classList.toggle('active',Number(b.dataset.timelineRange)===timelineHours));
  document.querySelectorAll('[data-timeline-layer]').forEach(b=>b.classList.toggle('active',Boolean(timelineLayers[b.dataset.timelineLayer])));
}

function glucoseColor(v){
  if(v<70) return '#e95459';
  if(v>180) return '#f3a62f';
  return '#22aa78';
}

function niceStep(hours){
  if(hours<=1) return 10;
  if(hours<=2) return 20;
  if(hours<=4) return 30;
  if(hours<=6) return 60;
  if(hours<=12) return 120;
  return 240;
}

function ensureTimelineTooltip(){
  let tip=$('timelineEventTooltip');
  if(tip) return tip;
  tip=document.createElement('div');
  tip.id='timelineEventTooltip';
  tip.className='timeline-event-tooltip';
  tip.hidden=true;
  document.body.appendChild(tip);
  return tip;
}

function richEventRows(e){
  const rows=[];
  const time=new Date(e.t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  rows.push(['Heure',time]);
  rows.push(['Treatment type',e.eventType || (e.type==='carbs'?'Carb Correction':'Bolus')]);
  if(e.carbs!==null && e.carbs!==undefined) rows.push(['Carbs',`${e.carbs} g`]);
  if(e.insulin!==null && e.insulin!==undefined) rows.push(['Insulin',`${e.insulin} U`]);
  if(e.programmedInsulin!==null && e.programmedInsulin!==undefined) rows.push(['Programmed',`${e.programmedInsulin} U`]);
  if(e.deliveredInsulin!==null && e.deliveredInsulin!==undefined) rows.push(['Delivered',`${e.deliveredInsulin} U`]);
  if(e.absorptionDisplay) rows.push(['Absorption Time',e.absorptionDisplay]);
  if(e.durationDisplay) rows.push(['Duration',e.durationDisplay]);
  if(e.enteredBy) rows.push(['Entered By',e.enteredBy]);
  if(e.notes) rows.push(['Notes',e.notes]);
  if(e.source) rows.push(['Source',e.source]);
  return rows;
}

function positionTimelineTooltip(clientX,clientY){
  const tip=ensureTimelineTooltip();
  const gap=14;
  const rect=tip.getBoundingClientRect();
  let left=clientX+gap;
  let top=clientY+gap;
  if(left+rect.width>window.innerWidth-10) left=clientX-rect.width-gap;
  if(top+rect.height>window.innerHeight-10) top=clientY-rect.height-gap;
  tip.style.left=`${Math.max(8,left)}px`;
  tip.style.top=`${Math.max(8,top)}px`;
}

function showTimelineTooltip(e,mouseEvent,pin=false){
  const tip=ensureTimelineTooltip();
  const key=`${e.id||''}-${e.type}-${e.t}`;
  tooltipPinned=pin;
  tooltipEventKey=key;
  const title=e.type==='carbs'?'🍞 Glucides':'💉 Bolus';
  const rows=richEventRows(e);
  tip.innerHTML=`<div class="timeline-tooltip-head"><b>${title}</b><button type="button" data-tooltip-close aria-label="Fermer">×</button></div><div class="timeline-tooltip-body">${rows.map(([k,v])=>`<div class="timeline-tooltip-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div><div class="timeline-tooltip-foot">Événement reçu depuis Nightscout · affichage uniquement</div>`;
  tip.hidden=false;
  tip.classList.toggle('pinned',pin);
  const x=mouseEvent?.clientX ?? window.innerWidth/2;
  const y=mouseEvent?.clientY ?? window.innerHeight/2;
  requestAnimationFrame(()=>positionTimelineTooltip(x,y));
  const close=tip.querySelector('[data-tooltip-close]');
  if(close) close.onclick=(ev)=>{ev.stopPropagation();hideTimelineTooltip(true);};
}

function hideTimelineTooltip(force=false){
  if(tooltipPinned && !force) return;
  const tip=$('timelineEventTooltip');
  if(tip){tip.hidden=true;tip.classList.remove('pinned');}
  tooltipPinned=false;
  tooltipEventKey=null;
}

function bindRichEventMarkers(svg,events){
  svg.querySelectorAll('.timeline-event-marker').forEach(marker=>{
    const index=Number(marker.dataset.eventIndex);
    const event=events[index];
    if(!event) return;
    marker.addEventListener('mouseenter',ev=>{if(!tooltipPinned)showTimelineTooltip(event,ev,false);});
    marker.addEventListener('mousemove',ev=>{if(!tooltipPinned)positionTimelineTooltip(ev.clientX,ev.clientY);});
    marker.addEventListener('mouseleave',()=>hideTimelineTooltip(false));
    marker.addEventListener('click',ev=>{
      ev.stopPropagation();
      const key=`${event.id||''}-${event.type}-${event.t}`;
      if(tooltipPinned && tooltipEventKey===key) hideTimelineTooltip(true);
      else showTimelineTooltip(event,ev,true);
    });
    marker.addEventListener('keydown',ev=>{
      if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();showTimelineTooltip(event,ev,true);}
      if(ev.key==='Escape')hideTimelineTooltip(true);
    });
  });
}

function renderTimeline(data,target='chart'){
  const svg=typeof target==='string'?$(target):target;
  if(!svg) return;
  const timeline=data?.timeline||{};
  const allPoints=(timeline.glucose?.length?timeline.glucose:data?.chart||[])
    .map(p=>({t:Number(p.t),value:Number(p.value)}))
    .filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.value)).sort((a,b)=>a.t-b.t);
  const allEvents=(timeline.events||[])
    .map(e=>({...e,t:Number(e.t),value:Number(e.value)}))
    .filter(e=>Number.isFinite(e.t)).sort((a,b)=>a.t-b.t);
  const allBasal=(timeline.basal||[])
    .map(b=>({...b,t:Number(b.t),rate:Number(b.rate)}))
    .filter(b=>Number.isFinite(b.t)&&Number.isFinite(b.rate)).sort((a,b)=>a.t-b.t);

  if(!allPoints.length){
    svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#8090a7" font-size="14">Aucune donnée graphique disponible</text>';
    return;
  }

  const latestPoint=allPoints.at(-1).t;
  const maxT=Math.min(Date.now()+5*60000,latestPoint+5*60000);
  const minT=maxT-timelineHours*3600000;
  const points=allPoints.filter(p=>p.t>=minT&&p.t<=maxT);
  const events=allEvents.filter(e=>e.t>=minT&&e.t<=maxT&&((e.type==='carbs'&&timelineLayers.carbs)||(e.type==='bolus'&&timelineLayers.bolus)));
  const basal=timelineLayers.basal?allBasal.filter(b=>b.t>=minT-60*60000&&b.t<=maxT):[];
  const detail=target!=='chart';
  const hasBasal=basal.length>0;
  const hasEvents=events.length>0;
  const width=960;
  const basalHeight=timelineLayers.basal?(hasBasal?54:26):0;
  const eventHeight=hasEvents?(detail?64:58):24;
  const height=(detail?326:282)+basalHeight+(hasEvents?30:0);
  const left=56,right=18,top=14,bottom=38;
  const basalTop=top,basalBottom=top+basalHeight;
  const plotTop=top+basalHeight+(basalHeight?10:0);
  const plotBottom=height-bottom-eventHeight;
  const innerW=width-left-right;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.style.height=`${height}px`;

  if(!points.length){
    svg.innerHTML=`<text x="50%" y="50%" text-anchor="middle" fill="#8090a7" font-size="14">Aucune mesure sur les ${timelineHours} dernières heures</text>`;
    return;
  }

  const pxX=t=>left+((t-minT)/Math.max(1,maxT-minT))*innerW;
  const vals=points.map(p=>p.value);
  const minVal=Math.min(...vals,70),maxVal=Math.max(...vals,180);
  const pad=Math.max(20,(maxVal-minVal)*0.16);
  const minY=Math.max(20,Math.floor((minVal-pad)/20)*20);
  const maxY=Math.min(450,Math.ceil((maxVal+pad)/20)*20);
  const pxY=v=>plotTop+(maxY-v)/(maxY-minY)*(plotBottom-plotTop);
  let html='';

  if(timelineLayers.basal&&basalHeight){
    if(hasBasal){
      html+=`<rect x="${left}" y="${basalTop}" width="${innerW}" height="${basalHeight}" rx="8" fill="#f7faff"/>`;
      html+=`<text x="${left+8}" y="${basalTop+13}" font-size="9.5" fill="#77879b">BASALE / TEMP BASAL</text>`;
      const maxRate=Math.max(.1,...basal.map(b=>b.rate));
      const rateY=r=>basalBottom-7-(r/maxRate)*Math.max(12,basalHeight-23);
      const seed=basal[0];
      const steps=[`M ${Math.max(left,pxX(seed.t))} ${rateY(seed.rate)}`];
      basal.slice(1).forEach(b=>{const x=Math.max(left,Math.min(width-right,pxX(b.t)));steps.push(`H ${x} V ${rateY(b.rate)}`);});
      steps.push(`H ${width-right}`);
      html+=`<path d="${steps.join(' ')}" fill="none" stroke="#168fd0" stroke-width="2" stroke-linejoin="round"/>`;
      const labelEvery=Math.max(1,Math.ceil(basal.length/7));
      basal.forEach((b,i)=>{if(i%labelEvery)return;const x=Math.max(left+18,Math.min(width-right-22,pxX(b.t)));html+=`<text x="${x}" y="${Math.max(basalTop+14,rateY(b.rate)-4)}" text-anchor="middle" font-size="8.5" fill="#087bb5">${Math.round(b.rate*100)/100} U/h</text>`;});
    }else{
      html+=`<text x="${left}" y="${basalTop+16}" font-size="9.5" fill="#a0aabd">Basale non exposée par Nightscout sur cette période</text>`;
    }
  }

  const targetTop=Math.min(maxY,180),targetBottom=Math.max(minY,70);
  if(targetTop>targetBottom)html+=`<rect x="${left}" y="${pxY(targetTop)}" width="${innerW}" height="${pxY(targetBottom)-pxY(targetTop)}" rx="4" fill="#ecf8f3"/>`;

  [40,55,70,120,180,260,400].filter(v=>v>=minY&&v<=maxY).forEach(v=>{
    const strong=v===70||v===180;
    html+=`<line x1="${left}" x2="${width-right}" y1="${pxY(v)}" y2="${pxY(v)}" stroke="${strong?'#ccd6e2':'#edf1f5'}" ${strong?'stroke-dasharray="4 4"':''}/><text x="${left-9}" y="${pxY(v)+4}" text-anchor="end" font-size="9.5" fill="#7d8ca0">${v}</text>`;
  });

  const stepMin=niceStep(timelineHours);
  const firstTick=Math.ceil(minT/(stepMin*60000))*stepMin*60000;
  for(let t=firstTick;t<=maxT;t+=stepMin*60000){
    const x=pxX(t),dt=new Date(t);
    html+=`<line x1="${x}" x2="${x}" y1="${plotTop}" y2="${plotBottom}" stroke="#edf1f5"/>`;
    const label=timelineHours>=12&&dt.getHours()===0?dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}):dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    html+=`<text x="${x}" y="${height-9}" text-anchor="middle" font-size="9.5" fill="#7d8ca0">${label}</text>`;
  }

  const pathD=points.map((p,i)=>`${i?'L':'M'} ${pxX(p.t)} ${pxY(p.value)}`).join(' ');
  html+=`<path d="${pathD}" fill="none" stroke="#23957e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
  const radius=timelineHours>=12?2.7:timelineHours>=6?3.2:4;
  points.forEach(p=>{
    const c=glucoseColor(p.value),x=pxX(p.t),y=pxY(p.value);
    html+=`<circle cx="${x}" cy="${y}" r="${radius}" fill="${c}" stroke="#fff" stroke-width="1.1"><title>${new Date(p.t).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ${Math.round(p.value)} mg/dL</title></circle>`;
  });

  if(hasEvents){
    const rows=[plotBottom+25,plotBottom+51];
    let idx=0,lastX=-999,lastRow=0;
    events.forEach((e,eventIndex)=>{
      const x=pxX(e.t),isCarbs=e.type==='carbs',icon=isCarbs?'🍞':'💉',label=e.label||`${e.value}${isCarbs?' g':' U'}`;
      if(x-lastX<76)lastRow=1-lastRow;else lastRow=idx%2;
      const row=rows[lastRow];idx++;lastX=x;
      const bg=isCarbs?'#fff6df':'#edf6ff',stroke=isCarbs?'#e9bd60':'#6baeea',text=isCarbs?'#7f5a12':'#1f6fae';
      const w=Math.max(54,35+String(label).length*5.7),rx=Math.max(left,Math.min(width-right-w,x-w/2));
      html+=`<line x1="${x}" x2="${x}" y1="${plotBottom-2}" y2="${row-13}" stroke="${stroke}" stroke-width="1" stroke-dasharray="2 3"/>`;
      html+=`<g class="timeline-event-marker" data-event-index="${eventIndex}" tabindex="0" role="button" aria-label="${esc(e.eventType||label)}">`;
      html+=`<rect x="${rx}" y="${row-16}" width="${w}" height="24" rx="11" fill="${bg}" stroke="${stroke}"/>`;
      html+=`<text x="${rx+8}" y="${row}" font-size="10.5" font-weight="700" fill="${text}">${icon} ${esc(label)}</text>`;
      html+=`</g>`;
    });
  }

  const latest=points.at(-1);
  html+=`<line x1="${pxX(latest.t)}" x2="${pxX(latest.t)}" y1="${plotTop}" y2="${plotBottom}" stroke="#99a8ba" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/>`;
  html+=`<text x="${left+4}" y="${plotTop+13}" font-size="9" fill="#6d7c90">● mesures Dexcom</text><text x="${left+104}" y="${plotTop+13}" font-size="9" fill="#845c0a">🍞 glucides</text><text x="${left+173}" y="${plotTop+13}" font-size="9" fill="#216ba8">💉 bolus</text>`;
  svg.innerHTML=html;
  bindRichEventMarkers(svg,events);
}

function renderAllTimelines(data){
  renderTimeline(data,'chart');
  renderTimeline(data,'glucoseDetailChart');
  renderTimeline(data,'historyChart');
  document.querySelectorAll('.timeline-current-range').forEach(el=>el.textContent=`${timelineHours} h`);
}

function renderDetailViews(data){
  const g=data.glucose||{},loop=data.loop||{},ins=data.insulin||{},d=data.devices||{},r=data.range||{};
  setText('detailGlucose',fmt(g.value));
  setText('detailTrend',g.trend||'—');
  setText('detailTrendLabel',g.trendLabel||'—');
  setText('detailGlucoseAge',g.minutesAgo==null?'—':`il y a ${g.minutesAgo} min`);
  setText('detailDelta',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);
  setText('detailCurrent',g.value==null?'—':`${g.value} mg/dL`);
  setText('detailDelta2',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);
  setText('detailTrend2',`${g.trend||'—'} ${g.trendLabel||''}`.trim());
  setText('detailFreshness',g.minutesAgo==null?'—':`${g.minutesAgo} min`);
  renderTimeline(data,'glucoseDetailChart');

  setText('detailLoopMode',loop.mode||'—');
  setText('detailLoopAge',loop.lastLoopMinutes==null?'—':`il y a ${loop.lastLoopMinutes} min`);
  setText('detailLoopDetail',loop.modeDetail||'—');
  setText('detailPrediction',loop.prediction?.points?.length?`Min ${Math.round(loop.prediction.min)} · fin ${Math.round(loop.prediction.end)} mg/dL`:'Non exposée');
  setText('detailIob',fmt(ins.iob,' U'));
  setText('detailCob',fmt(ins.cob,' g'));
  setText('detailBasal',fmt(ins.basal,' U/h'));
  setText('detailBolus',ins.lastBolus==null?'—':`${ins.lastBolus} U à ${ins.lastBolusTime||'—'}`);
  setText('detailBattery',d.pumpBattery==null?'—':`${d.pumpBattery} %`);
  setText('detailReservoir',d.reservoir==null?'—':`${d.reservoir} U`);
  setText('detailPod',d.podAgeHours==null?'—':`${d.podAgeHours} h${d.podEstimated?' (estimé)':''}`);
  setText('detailSensor',d.sensorAgeHours==null?'—':`${d.sensorAgeHours} h${d.sensorEstimated?' (estimé)':''}`);

  renderTimeline(data,'historyChart');
  const rows=$('historyRows');
  if(rows){
    const cutoff=Date.now()-timelineHours*3600000;
    const history=(data.timeline?.glucose||data.chart||[]).filter(p=>Number(p.t)>=cutoff).slice(-30).reverse();
    rows.innerHTML=history.length?history.map(p=>{
      const v=Number(p.value),state=v<70?'Bas':v>180?'Haut':'Dans la plage';
      return `<tr><td>${new Date(p.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td><b>${Math.round(v)} mg/dL</b></td><td><span class="history-state ${state==='Bas'?'low':state==='Haut'?'high':'ok'}">${state}</span></td></tr>`;
    }).join(''):'<tr><td colspan="3">Aucune donnée récente disponible.</td></tr>';
  }

  setText('reportPeriod',r.label||'Période disponible');
  setText('reportTir',r.inRange==null?'—':`${r.inRange} %`);
  setText('reportIn',r.inRange==null?'—':`${r.inRange} %`);
  setText('reportLow',r.low==null?'—':`${r.low} %`);
  setText('reportHigh',r.high==null?'—':`${r.high} %`);
  setText('reportSamples',r.sampleCount??'—');
  setText('reportCoverage',r.coverageHours==null?'—':`${r.coverageHours} h`);
  const rin=r.inRange??0,rlow=r.low??0,rhigh=r.high??0;
  if($('reportTirIn'))$('reportTirIn').style.width=`${rin}%`;
  if($('reportTirLow'))$('reportTirLow').style.width=`${rlow}%`;
  if($('reportTirHigh'))$('reportTirHigh').style.width=`${rhigh}%`;
  setText('settingsSource',data.source==='nightscout-live'?'Nightscout LIVE':data.source||'—');
}

function render(data){
  latestData=data;
  window.glucyzenLatestData=data;
  const g=data.glucose||{};
  setText('glucoseValue',fmt(g.value));
  setText('trendArrow',g.trend||'—');
  setText('trendLabel',g.trendLabel||'—');
  setText('glucoseAge',g.minutesAgo==null?'—':`il y a ${g.minutesAgo} min`);
  setText('delta',g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`);

  const loop=data.loop||{};
  setText('loopMode',loop.mode||'—');
  if($('loopMode'))$('loopMode').className=`pill ${loop.status==='stale'?'warning-pill':'success'}`;
  setText('loopAge',loop.lastLoopMinutes==null?'—':`il y a ${loop.lastLoopMinutes} min`);
  setText('loopDetail',loop.modeDetail||'—');
  setText('prediction',loop.prediction?.points?.length?`Min ${Math.round(loop.prediction.min)} · fin ${Math.round(loop.prediction.end)} mg/dL`:'Non exposée dans les données reçues');

  const insulin=data.insulin||{};
  setText('iob',fmt(insulin.iob,' U'));
  setText('cob',fmt(insulin.cob,' g'));
  setText('basal',fmt(insulin.basal,' U/h'));
  setText('basalSource',insulin.basalSource?`source : ${insulin.basalSource}`:'source indisponible');
  setText('bolus',insulin.lastBolus==null?'—':`${insulin.lastBolus} U à ${insulin.lastBolusTime||'—'}`);

  const devices=data.devices||{};
  setText('pumpBattery',devices.pumpBattery==null?'—':`${devices.pumpBattery} %`);
  setText('reservoir',devices.reservoir==null?'—':`${devices.reservoir} U`);
  setText('pod',devices.podAgeHours==null?'—':`${devices.podAgeHours} h${devices.podEstimated?' (estimé)':''}`);
  setText('sensor',devices.sensorAgeHours==null?'—':`${devices.sensorAgeHours} h${devices.sensorEstimated?' (estimé)':''}`);
  setText('sensorEnd',devices.sensorExpiresAt?`fin estimée : ${devices.sensorExpiresAt}`:'fin non disponible');
  setText('dexcom',devices.dexcom||'—');

  const r=data.range||{},rin=r.inRange??0,rlow=r.low??0,rhigh=r.high??0;
  if($('tirIn'))$('tirIn').style.width=`${rin}%`;
  if($('tirLow'))$('tirLow').style.width=`${rlow}%`;
  if($('tirHigh'))$('tirHigh').style.width=`${rhigh}%`;
  setText('tirInText',r.inRange==null?'—':`${r.inRange} %`);
  setText('tirLowText',r.low==null?'—':`${r.low} %`);
  setText('tirHighText',r.high==null?'—':`${r.high} %`);
  setText('tirPeriod',r.label||'Période disponible');
  setText('tirSamples',r.sampleCount?`${r.sampleCount} mesures`:'—');

  if($('aiAdvice'))$('aiAdvice').innerHTML=(data.aiAdvice||[]).map((t,i)=>`<div class="advice"><i>${i+1}</i><span>${esc(t)}</span></div>`).join('');
  if($('systemAlerts'))$('systemAlerts').innerHTML=(data.systemAlerts||[]).map(a=>`<div class="alert ${esc(a.severity||'info')}">${esc(a.text)}</div>`).join('');
  setText('lastRefresh',new Date(data.generatedAt||Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));

  const source=data.source||'mock';
  setText('sourceLabel',source==='nightscout-live'?'LIVE · Nightscout':source==='nightscout-error'?'LIVE · ERREUR':'Mode démo');
  setText('readOnlyBadge',data.connection?.readOnly===true?'🔒 Flux réel lecture seule':'Démo');
  document.body.dataset.source=source;

  let globalText='Données à jour',globalClass='big-ok';
  if(source==='nightscout-error'){globalText='Données indisponibles';globalClass='big-status danger';}
  else if(g.minutesAgo!=null&&g.minutesAgo>12){globalText='Données anciennes';globalClass='big-status warn';}
  else if(g.value!=null&&g.value<70){globalText='Sous la plage affichée';globalClass='big-status warn';}
  else if(g.value!=null&&g.value>180){globalText='Au-dessus de la plage affichée';globalClass='big-status warn';}
  setText('globalState',globalText);
  if($('globalState'))$('globalState').className=globalClass;
  setText('globalDetail',source==='nightscout-live'?'Nightscout connecté · aucune écriture réelle':'Vérifie la source de données');

  renderAllTimelines(data);
  renderDetailViews(data);
  window.dispatchEvent(new CustomEvent('glucyzen:data',{detail:data}));
}

async function load(){
  try{
    const res=await fetch('/api/live',{cache:'no-store'});
    const data=await res.json();
    render(data);
    if(!res.ok)console.error('API live:',data.error||res.statusText);
  }catch(e){
    setText('sourceLabel','Erreur de chargement');
    if($('systemAlerts'))$('systemAlerts').innerHTML='<div class="alert warning">Impossible de joindre le serveur GlucyZen.</div>';
    console.error(e);
  }
}

injectTimelineStyles();
installTimelineControls();
ensureTimelineTooltip();
document.querySelectorAll('footer').forEach(f=>{ if(f.textContent.includes('GlucyZen v')) f.textContent=f.textContent.replace(/GlucyZen v[^·]+/, 'GlucyZen v0.10 Rich Events '); });
setRoute((location.hash||'#dashboard').slice(1),false);
load();
setInterval(load,30000);