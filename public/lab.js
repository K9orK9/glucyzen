(() => {
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

  function smartAdvice(data){
    const out=[]; const g=data?.glucose||{}; const loop=data?.loop||{}; const d=data?.devices||{}; const r=data?.range||{}; const ins=data?.insulin||{};
    if(g.value==null) out.push('Aucune glycémie exploitable n’est disponible pour l’analyse actuelle.');
    else {
      out.push(`Lecture actuelle : ${g.value} mg/dL ${g.trend||''}. Cette observation est descriptive uniquement.`);
      if(g.minutesAgo!=null && g.minutesAgo>10) out.push(`La dernière donnée remonte à ${g.minutesAgo} min : vérifie la connexion des sources avant de te fier au dashboard.`);
      if(g.value<70 || g.value>180) out.push('La valeur actuelle est hors de la plage 70–180 affichée. Vérifie Loop/Dexcom et suis le protocole habituel prévu avec l’équipe soignante.');
    }
    if(ins.iob!=null) out.push(`IOB visible : ${Math.round(ins.iob*100)/100} U. GlucyZen ne convertit jamais cette donnée en recommandation de dose.`);
    if(loop.lastLoopMinutes!=null && loop.lastLoopMinutes>10) out.push(`Le dernier état Loop reçu date d’environ ${loop.lastLoopMinutes} min.`);
    if(r.sampleCount>0 && r.inRange!=null) out.push(`Sur ${r.label||'la période disponible'}, ${r.inRange}% des mesures sont dans la plage affichée (${r.sampleCount} mesures).`);
    if(d.sensorExpiresAt) out.push(`Rappel matériel : fin de capteur estimée ${d.sensorExpiresAt}.`);
    if(d.podExpiresInHours!=null && d.podExpiresInHours<=12) out.push(`Rappel matériel : fin nominale du Pod estimée dans environ ${Math.max(0,Math.round(d.podExpiresInHours))} h.`);
    out.push('Les actions du Mode labo sont des simulations locales : elles ne modifient aucun traitement ni dispositif.');
    return out.slice(0,6);
  }

  function renderSmart(data){
    latest=data;
    const el=$('aiSmartAdvice'); if(!el)return;
    const list=smartAdvice(data);
    el.innerHTML=list.map((t,i)=>`<div class="smart-advice"><i>${i+1}</i><span>${esc(t)}</span></div>`).join('');
  }

  async function refreshSmart(){
    try{const r=await fetch('/api/live',{cache:'no-store'});const d=await r.json();renderSmart(d);}catch{const el=$('aiSmartAdvice');if(el)el.innerHTML='<div class="smart-advice"><span>Analyse indisponible : serveur GlucyZen non joignable.</span></div>';}
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
      if(![lo,hi,dur].every(Number.isFinite)||lo<=0||hi<=0||dur<=0){toast('Paramètres de simulation invalides.');return;}
      if(confirmLab(`Simuler une cible temporaire ${lo}–${hi} mg/dL pendant ${dur} min ?`)) add('Cible temporaire simulée',`${lo}–${hi} mg/dL · ${dur} min — local uniquement`);
    }
    if(action==='reminder'){
      const txt=($('labReminder')?.value||'Rappel test').trim().slice(0,120);
      add('Rappel simulé',txt||'Rappel test');
    }
    if(action==='clear') {localStorage.removeItem(STORE);renderLog();toast('Journal de simulation effacé.');}
    if(action==='analyze') refreshSmart();
  });

  window.addEventListener('glucyzen:data',(e)=>renderSmart(e.detail));
  renderLog();
  refreshSmart();
  setInterval(refreshSmart,60000);
})();
