const $ = (id) => document.getElementById(id);
const fmt = (v, suffix='') => (v === null || v === undefined ? '—' : `${typeof v === 'number' ? Math.round(v * 100) / 100 : v}${suffix}`);
const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

function renderChart(points){
  const svg = $('chart');
  const width=760,height=220,left=44,right=12,top=14,bottom=30;
  const innerW=width-left-right, innerH=height-top-bottom;
  const normalized=(points||[]).map((p,i)=>Array.isArray(p)?{t:i,value:Number(p[1])}:{t:Number(p.t),value:Number(p.value)}).filter(p=>Number.isFinite(p.value));
  if(!normalized.length){svg.innerHTML=`<text x="50%" y="50%" text-anchor="middle" fill="#8090a7" font-size="14">Aucune donnée graphique disponible</text>`;return;}
  const minVal=Math.min(...normalized.map(p=>p.value),70);
  const maxVal=Math.max(...normalized.map(p=>p.value),180);
  const minY=Math.max(20,Math.floor((minVal-30)/20)*20);
  const maxY=Math.min(450,Math.ceil((maxVal+40)/20)*20);
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

function render(data){
  const g=data.glucose||{};
  $('glucoseValue').textContent=fmt(g.value);
  $('trendArrow').textContent=g.trend || '—';
  $('trendLabel').textContent=g.trendLabel || '—';
  $('glucoseAge').textContent=g.minutesAgo==null?'—':`il y a ${g.minutesAgo} min`;
  $('delta').textContent=g.delta==null?'—':`${g.delta>0?'+':''}${g.delta} mg/dL`;

  const loop=data.loop||{};
  $('loopMode').textContent=loop.mode || '—';
  $('loopMode').className=`pill ${loop.status==='stale'?'warning-pill':'success'}`;
  $('loopAge').textContent=loop.lastLoopMinutes==null?'—':`il y a ${loop.lastLoopMinutes} min`;
  $('loopDetail').textContent=loop.modeDetail || '—';
  if(loop.prediction?.points?.length){
    $('prediction').textContent=`Min ${Math.round(loop.prediction.min)} · fin ${Math.round(loop.prediction.end)} mg/dL`;
  }else $('prediction').textContent='Non exposée dans les données reçues';

  const insulin=data.insulin||{};
  $('iob').textContent=fmt(insulin.iob,' U');
  $('cob').textContent=fmt(insulin.cob,' g');
  $('basal').textContent=fmt(insulin.basal,' U/h');
  $('basalSource').textContent=insulin.basalSource?`source : ${insulin.basalSource}`:'source indisponible';
  $('bolus').textContent=insulin.lastBolus==null?'—':`${insulin.lastBolus} U à ${insulin.lastBolusTime || '—'}`;

  const devices=data.devices||{};
  $('pumpBattery').textContent=devices.pumpBattery==null?'—':`${devices.pumpBattery} %`;
  $('reservoir').textContent=devices.reservoir==null?'—':`${devices.reservoir} U`;
  $('pod').textContent=devices.podAgeHours==null?'—':`${devices.podAgeHours} h${devices.podEstimated?' (estimé)':''}`;
  $('sensor').textContent=devices.sensorAgeHours==null?'—':`${devices.sensorAgeHours} h${devices.sensorEstimated?' (estimé)':''}`;
  $('sensorEnd').textContent=devices.sensorExpiresAt?`fin estimée : ${devices.sensorExpiresAt}`:'fin non disponible';
  $('dexcom').textContent=devices.dexcom || '—';

  const r=data.range||{};
  const rin=r.inRange??0, rlow=r.low??0, rhigh=r.high??0;
  $('tirIn').style.width=`${rin}%`; $('tirLow').style.width=`${rlow}%`; $('tirHigh').style.width=`${rhigh}%`;
  $('tirInText').textContent=r.inRange==null?'—':`${r.inRange} %`;
  $('tirLowText').textContent=r.low==null?'—':`${r.low} %`;
  $('tirHighText').textContent=r.high==null?'—':`${r.high} %`;
  $('tirPeriod').textContent=r.label || 'Période disponible';
  $('tirSamples').textContent=r.sampleCount?`${r.sampleCount} mesures`:'—';

  $('aiAdvice').innerHTML=(data.aiAdvice||[]).map((t,i)=>`<div class="advice"><i>${i+1}</i><span>${esc(t)}</span></div>`).join('');
  $('systemAlerts').innerHTML=(data.systemAlerts||[]).map(a=>`<div class="alert ${esc(a.severity||'info')}">${esc(a.text)}</div>`).join('');
  $('lastRefresh').textContent=new Date(data.generatedAt || Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  const source=data.source||'mock';
  $('sourceLabel').textContent=source==='nightscout-live'?'LIVE · Nightscout':source==='nightscout-error'?'LIVE · ERREUR':'Mode démo';
  $('readOnlyBadge').textContent=data.connection?.readOnly===true?'🔒 Flux réel lecture seule':'Démo';
  document.body.dataset.source=source;

  let globalText='Données à jour', globalClass='big-ok';
  if(source==='nightscout-error'){globalText='Données indisponibles';globalClass='big-status danger';}
  else if(g.minutesAgo!=null&&g.minutesAgo>12){globalText='Données anciennes';globalClass='big-status warn';}
  else if(g.value!=null&&g.value<70){globalText='Sous la plage affichée';globalClass='big-status warn';}
  else if(g.value!=null&&g.value>180){globalText='Au-dessus de la plage affichée';globalClass='big-status warn';}
  $('globalState').textContent=globalText;$('globalState').className=globalClass;
  $('globalDetail').textContent=source==='nightscout-live'?'Nightscout connecté · aucune écriture réelle':'Vérifie la source de données';

  renderChart(data.chart||[]);
  window.dispatchEvent(new CustomEvent('glucyzen:data',{detail:data}));
}

async function load(){
  try{
    const res=await fetch('/api/live',{cache:'no-store'});
    const data=await res.json();
    render(data);
    if(!res.ok) console.error('API live:',data.error||res.statusText);
  }catch(e){
    $('sourceLabel').textContent='Erreur de chargement';
    $('systemAlerts').innerHTML='<div class="alert warning">Impossible de joindre le serveur GlucyZen.</div>';
    console.error(e);
  }
}

load();
setInterval(load,30000);
