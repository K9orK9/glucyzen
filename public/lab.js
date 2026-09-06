(() => {
  const navStyle=document.createElement('style');
  navStyle.textContent=`
    .brand-button{border:0;background:transparent;padding:0;width:100%;text-align:left;cursor:pointer;color:inherit}.page-view{display:none}.page-view.active{display:block}.detail-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.8fr);gap:18px}.detail-grid.three{grid-template-columns:repeat(3,1fr)}.detail-hero{min-height:430px}.detail-hero #glucoseDetailChart,#historyChart{width:100%;height:260px;margin-top:18px}.stat-stack{display:flex;flex-direction:column}.stat-stack>div{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid var(--line);align-items:flex-start}.stat-stack>div:last-child{border-bottom:0}.stat-stack span{color:var(--muted);font-size:13px}.stat-stack b{text-align:right}.table-wrap{overflow:auto;margin-top:18px}.history-table{width:100%;border-collapse:collapse;font-size:13px}.history-table th,.history-table td{text-align:left;padding:12px;border-bottom:1px solid var(--line)}.history-table th{color:var(--muted);font-size:12px}.history-state{padding:5px 9px;border-radius:999px;font-weight:800;font-size:11px}.history-state.ok{background:var(--green-soft);color:#18895f}.history-state.high{background:#fff4df;color:#976100}.history-state.low{background:#ffeded;color:#a52d32}.report-score{font-size:58px;font-weight:900;letter-spacing:-2px;color:var(--green);margin:10px 0}.report-tir{margin-top:14px}.assistant-layout{grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr)}.safety-list{display:flex;flex-direction:column;gap:10px}.safety-list>div{padding:11px 12px;border-radius:12px;background:#eef8f5;color:#176e53;font-weight:700;font-size:13px}.settings-help p{color:var(--muted);font-size:13px;margin:10px 0 6px}.settings-help code{display:inline-block;padding:9px 11px;border-radius:9px;background:#f3f6fa;color:#34445e;font-weight:700}.lab-card.standalone{margin-top:0}.nav.active{background:#e8f2ff;color:#1e69d6;font-weight:700}
    @media(max-width:1180px){.detail-grid,.detail-grid.three,.assistant-layout{grid-template-columns:1fr}}
    @media(max-width:720px){.detail-grid,.detail-grid.three,.assistant-layout{grid-template-columns:1fr}.stat-stack>div{gap:10px}.report-score{font-size:46px}}
  `;
  document.head.appendChild(navStyle);

  const $ = (id) => document.getElementById(id);
  const STORE = 'glucyzen.lab.actions.v1';
  let latest = null;

  function esc(v){return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function actions(){try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch{return []}}
  function save(list){localStorage.setItem(STORE,JSON.stringify(list.slice(0,30)));renderLog();}
  function add(type, detail){
    const list=actions();
    list.unshift({at:new Date().toISOString(),type,detail});
    save(list);
    toast('Simulation enregistrée — aucune commande envoyée.');
  }
  function renderLog(){
    const el=$('labLog'); if(!el) return;
    const list=actions();
    el.innerHTML=list.length?list.map(a=>`<div class="lab-log-row"><span>${new Date(a.at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><b>${esc(a.type)}</b><em>${esc(a.detail)}</em></div>`).join(''):'<div class="muted">Aucune simulation enregistrée.</div>';
  }
  function toast(text){
    const el=$('labToast'); if(!el)return;
    el.textContent=text; el.classList.add('show');
    clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2600);
  }
  function confirmLab(message){
    return window.confirm(`${message}\n\nMODE LABO UNIQUEMENT : aucune commande ne sera envoyée à Loop, Nightscout, Dexcom ou Omnipod.`);
  }

  function chartChange(chart, minutes){
    const pts=(chart||[]).map(p=>({t:Number(p?.t),v:Number(p?.value)})).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v)).sort((a,b)=>a.t-b.t);
    if(pts.length<2)return null;
    const last=pts[pts.length-1];
    const wanted=last.t-minutes*60000;
    let older=pts[0];
    for(const p of pts){if(Math.abs(p.t-wanted)<Math.abs(older.t-wanted))older=p;}
    if(last.t-older.t<Math.min(15,minutes*0.5)*60000)return null;
    return {delta:Math.round(last.v-older.v),minutes:Math.round((last.t-older.t)/60000)};
  }

  function smartAdvice(data){
    const out=[];
    const g=data?.glucose||{}, loop=data?.loop||{}, d=data?.devices||{}, r=data?.range||{}, ins=data?.insulin||{};

    if(data?.source==='nightscout-error'){
      out.push('Nightscout n’est pas joignable actuellement : l’analyse LIVE est suspendue jusqu’au retour des données.');
      return out;
    }

    if(g.value==null){
      out.push('Aucune glycémie exploitable n’est disponible pour l’analyse actuelle.');
    } else {
      const trendText=g.trendLabel||g.trend||'tendance non disponible';
      out.push(`Lecture actuelle : ${Math.round(g.value)} mg/dL · ${trendText}. Observation descriptive uniquement.`);

      const ch30=chartChange(data?.chart,30);
      if(ch30 && Math.abs(ch30.delta)>=10){
        const verb=ch30.delta>0?'augmenté':'diminué';
        out.push(`Sur environ ${ch30.minutes} min, la courbe a ${verb} d’environ ${Math.abs(ch30.delta)} mg/dL.`);
      }

      if(g.minutesAgo!=null && g.minutesAgo>10){
        out.push(`La dernière donnée remonte à ${g.minutesAgo} min : vérifie la connexion Dexcom/Loop avant de te fier au dashboard.`);
      } else if(g.minutesAgo!=null){
        out.push(`Flux glucose récent : dernière mesure reçue il y a ${g.minutesAgo} min.`);
      }

      if(g.value<70){
        out.push('La valeur affichée est sous la plage 70–180. Consulte les alertes officielles Dexcom/Loop et le protocole habituel défini avec l’équipe soignante.');
      } else if(g.value>180){
        out.push('La valeur affichée est au-dessus de la plage 70–180. GlucyZen signale le contexte mais ne propose aucune correction ni dose.');
      }
    }

    if(ins.iob!=null){
      out.push(`Insuline active visible : ${Math.round(ins.iob*100)/100} U. Cette donnée est affichée comme contexte et n’est jamais transformée en recommandation de dose.`);
    }

    if(loop.lastLoopMinutes!=null && loop.lastLoopMinutes>10){
      out.push(`Le dernier état Loop reçu date d’environ ${loop.lastLoopMinutes} min : la donnée Loop peut être ancienne.`);
    }

    if(r.sampleCount>0 && r.inRange!=null){
      const parts=[`${r.inRange}% dans la plage`];
      if(r.low!=null)parts.push(`${r.low}% sous la plage`);
      if(r.high!=null)parts.push(`${r.high}% au-dessus`);
      out.push(`${r.label||'Période disponible'} : ${parts.join(' · ')} (${r.sampleCount} mesures).`);
    }

    if(d.pumpBattery!=null && d.pumpBattery<=25){
      out.push(`Rappel matériel : batterie pompe remontée à ${Math.round(d.pumpBattery)}%.`);
    }
    if(d.reservoir!=null && d.reservoir<=10){
      out.push(`Rappel matériel : réservoir remonté à environ ${Math.round(d.reservoir*10)/10} U.`);
    }
    if(d.sensorExpiresAt){
      out.push(`Rappel matériel : fin de capteur estimée ${d.sensorExpiresAt}.`);
    }
    if(d.podExpiresInHours!=null && d.podExpiresInHours<=12){
      out.push(`Rappel matériel : fin nominale du Pod estimée dans environ ${Math.max(0,Math.round(d.podExpiresInHours))} h.`);
    }

    if(out.length<3)out.push('Aucune anomalie de fraîcheur évidente détectée dans les données actuellement disponibles.');
    return out.slice(0,7);
  }

  function renderSmart(data){
    latest=data;
    const el=$('aiSmartAdvice'); if(!el)return;
    const list=smartAdvice(data);
    el.innerHTML=list.map((t,i)=>`<div class="smart-advice"><i>${i+1}</i><span>${esc(t)}</span></div>`).join('');
  }

  async function refreshSmart(){
    try{
      const r=await fetch('/api/live',{cache:'no-store'});
      const d=await r.json();
      renderSmart(d);
    }catch{
      const el=$('aiSmartAdvice');
      if(el)el.innerHTML='<div class="smart-advice"><span>Analyse indisponible : serveur GlucyZen non joignable.</span></div>';
    }
  }

  document.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-lab-action]'); if(!btn)return;
    const action=btn.dataset.labAction;
    if(action==='bolus'){
      const v=Number($('labBolus')?.value);
      if(!Number.isFinite(v)||v<0){toast('Valeur de simulation invalide.');return;}
      if(confirmLab(`Simuler un bolus de ${v} U ?`)) add('Bolus simulé',`${v} U — local uniquement`);
    }
    if(action==='pause') if(confirmLab('Simuler une pause de pompe ?')) add('Pause simulée','État UI local uniquement');
    if(action==='target'){
      const lo=Number($('labTargetLow')?.value), hi=Number($('labTargetHigh')?.value), dur=Number($('labTargetDuration')?.value);
      if(![lo,hi,dur].every(Number.isFinite)||lo<=0||hi<=0||dur<=0||lo>=hi){toast('Paramètres de simulation invalides.');return;}
      if(confirmLab(`Simuler une cible temporaire ${lo}–${hi} mg/dL pendant ${dur} min ?`)) add('Cible temporaire simulée',`${lo}–${hi} mg/dL · ${dur} min — local uniquement`);
    }
    if(action==='reminder'){
      const txt=($('labReminder')?.value||'Rappel test').trim().slice(0,120);
      add('Rappel simulé',txt||'Rappel test');
    }
    if(action==='clear') {localStorage.removeItem(STORE);renderLog();toast('Journal de simulation effacé.');}
    if(action==='analyze') {if(latest)renderSmart(latest);else refreshSmart();toast('Analyse locale actualisée.');}
  });

  window.addEventListener('glucyzen:data',(e)=>renderSmart(e.detail));
  renderLog();
  refreshSmart();
  setInterval(refreshSmart,60000);
})();
