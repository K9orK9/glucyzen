(() => {
  const style=document.createElement('style');
  style.textContent=`
    .brand-button{border:0;background:transparent;padding:0;width:100%;text-align:left;cursor:pointer;color:inherit}.page-view{display:none}.page-view.active{display:block}.detail-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.8fr);gap:18px}.detail-grid.three{grid-template-columns:repeat(3,1fr)}.detail-hero{min-height:430px}.detail-hero #glucoseDetailChart,#historyChart{width:100%;height:260px;margin-top:18px}.stat-stack{display:flex;flex-direction:column}.stat-stack>div{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid var(--line);align-items:flex-start}.stat-stack>div:last-child{border-bottom:0}.stat-stack span{color:var(--muted);font-size:13px}.stat-stack b{text-align:right}.table-wrap{overflow:auto;margin-top:18px}.history-table{width:100%;border-collapse:collapse;font-size:13px}.history-table th,.history-table td{text-align:left;padding:12px;border-bottom:1px solid var(--line)}.history-table th{color:var(--muted);font-size:12px}.history-state{padding:5px 9px;border-radius:999px;font-weight:800;font-size:11px}.history-state.ok{background:var(--green-soft);color:#18895f}.history-state.high{background:#fff4df;color:#976100}.history-state.low{background:#ffeded;color:#a52d32}.report-score{font-size:58px;font-weight:900;letter-spacing:-2px;color:var(--green);margin:10px 0}.assistant-layout{grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr)}.safety-list{display:flex;flex-direction:column;gap:10px}.safety-list>div{padding:11px 12px;border-radius:12px;background:#eef8f5;color:#176e53;font-weight:700;font-size:13px}.settings-help p{color:var(--muted);font-size:13px;margin:10px 0 6px}.settings-help code{display:inline-block;padding:9px 11px;border-radius:9px;background:#f3f6fa;color:#34445e;font-weight:700}.lab-card.standalone{margin-top:0}.nav.active{background:#e8f2ff;color:#1e69d6;font-weight:700}
    .history-intelligence{grid-column:1/-1}.intel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.intel-status{display:flex;gap:8px;flex-wrap:wrap}.intel-status span{padding:6px 9px;border-radius:999px;background:#f0f4f9;color:#53647c;font-size:11px;font-weight:800}.forecast-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.forecast-card{border:1px solid var(--line);border-radius:14px;padding:12px;background:#fbfcfe}.forecast-card span{display:block;color:var(--muted);font-size:11px}.forecast-card b{display:block;font-size:22px;margin:4px 0;color:#233550}.forecast-card small{color:#718098}.intel-summary{display:flex;flex-direction:column;gap:8px;margin-top:12px}.intel-summary>div{padding:11px 12px;border-radius:12px;background:#f5f8fc;color:#354760;font-size:13px;line-height:1.45}.meal-context{margin-top:12px;padding:12px;border-radius:12px;background:#fff8e9;border:1px solid #f1dfb4;color:#6f5516}.intel-warning{margin-top:12px;padding:10px 12px;border-radius:12px;background:#fff5f5;color:#8b3737;font-size:12px}.intel-loading{color:var(--muted);padding:14px 0}
    @media(max-width:1180px){.detail-grid,.detail-grid.three,.assistant-layout{grid-template-columns:1fr}.forecast-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:720px){.forecast-grid{grid-template-columns:1fr}.stat-stack>div{gap:10px}.report-score{font-size:46px}}
  `;
  document.head.appendChild(style);

  const $ = id => document.getElementById(id);
  const STORE='glucyzen.lab.actions.v1';
  let latest=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function installIntelligenceUI(){
    const grid=document.querySelector('.page-view[data-view="assistant"] .assistant-layout');
    if(!grid||$('historicalIntelligence'))return;
    const card=document.createElement('article');
    card.className='card history-intelligence'; card.id='historicalIntelligence';
    card.innerHTML=`<div class="intel-head"><div class="card-title"><span>🧠 Historical Intelligence</span><span class="pill beta">Expérimental</span></div><div id="intelStatus" class="intel-status"></div></div><p class="muted">Projection descriptive calculée localement à partir des situations similaires trouvées dans l’historique Nightscout. Aucun calcul de dose ni décision thérapeutique.</p><div id="intelBody" class="intel-loading">Chargement de l’historique…</div>`;
    grid.prepend(card);
  }

  function renderIntelligence(data){
    installIntelligenceUI();
    const x=data?.intelligence||{}; const body=$('intelBody'), status=$('intelStatus'); if(!body||!status)return;
    status.innerHTML=`<span>${x.coverageDays??0} j d’historique</span><span>${x.examples??0} situations similaires</span><span>Confiance : ${esc(x.confidence||'insuffisante')}</span>${x.status==='loading'?'<span>Synchronisation…</span>':''}`;
    if(!Array.isArray(x.forecast)||!x.forecast.some(p=>p?.median!=null)){
      body.innerHTML=`<div class="intel-loading">${x.status==='loading'?'L’historique 90 jours se synchronise en arrière-plan. ':' '}Pas encore assez de situations comparables pour une projection personnalisée.</div>${(x.summary||[]).map(s=>`<div class="intel-summary"><div>${esc(s)}</div></div>`).join('')}`;
      return;
    }
    const cards=x.forecast.map(p=>`<div class="forecast-card"><span>+${p.minutes} min</span><b>${p.median==null?'—':Math.round(p.median)+' mg/dL'}</b><small>${p.low==null||p.high==null?'Fourchette indisponible':`20e–80e percentile : ${Math.round(p.low)}–${Math.round(p.high)}`}</small></div>`).join('');
    const meal=x.mealContext?`<div class="meal-context"><b>🍽 Repas similaires au dernier apport</b><div>${x.mealContext.count} épisodes proches pour ~${x.mealContext.carbs} g de glucides. Pic médian observé : ${x.mealContext.medianPeakDelta>=0?'+':''}${x.mealContext.medianPeakDelta} mg/dL vers ${x.mealContext.medianTimeToPeak} min.</div></div>`:'';
    body.innerHTML=`<div class="forecast-grid">${cards}</div>${meal}<div class="intel-summary">${(x.summary||[]).map(s=>`<div>${esc(s)}</div>`).join('')}</div><div class="intel-warning">Ces estimations décrivent ce qui s’est passé dans des situations similaires. Elles ne doivent pas être utilisées pour décider une dose, retarder/avancer un repas ou traiter une hypo/hyperglycémie.</div>`;
  }

  function actions(){try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch{return []}}
  function save(list){localStorage.setItem(STORE,JSON.stringify(list.slice(0,30)));renderLog();}
  function add(type,detail){const list=actions();list.unshift({at:new Date().toISOString(),type,detail});save(list);toast('Simulation enregistrée — aucune commande envoyée.');}
  function renderLog(){const el=$('labLog');if(!el)return;const list=actions();el.innerHTML=list.length?list.map(a=>`<div class="lab-log-row"><span>${new Date(a.at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><b>${esc(a.type)}</b><em>${esc(a.detail)}</em></div>`).join(''):'<div class="muted">Aucune simulation enregistrée.</div>';}
  function toast(text){const el=$('labToast');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600);}
  function confirmLab(message){return window.confirm(`${message}\n\nMODE LABO UNIQUEMENT : aucune commande ne sera envoyée à Loop, Nightscout, Dexcom ou Omnipod.`);}

  function chartChange(chart,minutes){const pts=(chart||[]).map(p=>({t:Number(p?.t),v:Number(p?.value)})).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v)).sort((a,b)=>a.t-b.t);if(pts.length<2)return null;const last=pts.at(-1),wanted=last.t-minutes*60000;let older=pts[0];for(const p of pts)if(Math.abs(p.t-wanted)<Math.abs(older.t-wanted))older=p;if(last.t-older.t<Math.min(15,minutes*.5)*60000)return null;return {delta:Math.round(last.v-older.v),minutes:Math.round((last.t-older.t)/60000)};}

  function smartAdvice(data){
    const out=[]; const g=data?.glucose||{},loop=data?.loop||{},d=data?.devices||{},r=data?.range||{},ins=data?.insulin||{},intel=data?.intelligence||{};
    if(data?.source==='nightscout-error')return ['Nightscout n’est pas joignable actuellement : l’analyse LIVE est suspendue.'];
    if(g.value!=null){out.push(`Lecture actuelle : ${Math.round(g.value)} mg/dL · ${g.trendLabel||g.trend||'tendance non disponible'}.`);const ch30=chartChange(data?.chart,30);if(ch30&&Math.abs(ch30.delta)>=10)out.push(`Sur environ ${ch30.minutes} min, la courbe a ${ch30.delta>0?'augmenté':'diminué'} d’environ ${Math.abs(ch30.delta)} mg/dL.`);}
    if(Array.isArray(intel.summary)) out.push(...intel.summary.slice(0,2));
    if(g.minutesAgo!=null&&g.minutesAgo>10)out.push(`Dernière donnée il y a ${g.minutesAgo} min : vérifie la connexion Dexcom/Loop.`);
    if(ins.iob!=null)out.push(`Insuline active visible : ${Math.round(ins.iob*100)/100} U, affichée uniquement comme contexte.`);
    if(r.sampleCount>0&&r.inRange!=null)out.push(`${r.label||'Période disponible'} : ${r.inRange}% dans la plage (${r.sampleCount} mesures).`);
    if(d.pumpBattery!=null&&d.pumpBattery<=25)out.push(`Rappel matériel : batterie pompe ${Math.round(d.pumpBattery)}%.`);
    return out.slice(0,8);
  }

  function renderSmart(data){latest=data;const el=$('aiSmartAdvice');if(el)el.innerHTML=smartAdvice(data).map((t,i)=>`<div class="smart-advice"><i>${i+1}</i><span>${esc(t)}</span></div>`).join('');renderIntelligence(data);}
  async function refreshSmart(){try{const r=await fetch('/api/live',{cache:'no-store'});const d=await r.json();renderSmart(d);}catch{const el=$('aiSmartAdvice');if(el)el.innerHTML='<div class="smart-advice"><span>Analyse indisponible : serveur GlucyZen non joignable.</span></div>';}}

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-lab-action]');if(!btn)return;const action=btn.dataset.labAction;
    if(action==='bolus'){const v=Number($('labBolus')?.value);if(!Number.isFinite(v)||v<0){toast('Valeur invalide.');return;}if(confirmLab(`Simuler un bolus de ${v} U ?`))add('Bolus simulé',`${v} U — local uniquement`);}
    if(action==='pause'&&confirmLab('Simuler une pause de pompe ?'))add('Pause simulée','État UI local uniquement');
    if(action==='target'){const lo=Number($('labTargetLow')?.value),hi=Number($('labTargetHigh')?.value),dur=Number($('labTargetDuration')?.value);if(![lo,hi,dur].every(Number.isFinite)||lo<=0||hi<=0||dur<=0||lo>=hi){toast('Paramètres invalides.');return;}if(confirmLab(`Simuler une cible temporaire ${lo}–${hi} mg/dL pendant ${dur} min ?`))add('Cible temporaire simulée',`${lo}–${hi} mg/dL · ${dur} min`);}
    if(action==='reminder')add('Rappel simulé',($('labReminder')?.value||'Rappel test').trim().slice(0,120));
    if(action==='clear'){localStorage.removeItem(STORE);renderLog();toast('Journal effacé.');}
    if(action==='analyze'){latest?renderSmart(latest):refreshSmart();toast('Analyse actualisée.');}
  });

  window.addEventListener('glucyzen:data',e=>renderSmart(e.detail));
  installIntelligenceUI(); renderLog(); refreshSmart(); setInterval(refreshSmart,60000);
})();
