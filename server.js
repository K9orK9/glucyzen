const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const VERSION = '0.5';
const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TIR_LOW = Number(process.env.TIR_LOW || 70);
const TIR_HIGH = Number(process.env.TIR_HIGH || 180);
const HISTORY_DAYS = 7;
const HISTORY_MAX_ENTRIES = 2300; // ~7 days at 5-min cadence + margin
const API3_PAGE_LIMIT = 1000;
const SENSOR_WEAR_HOURS = Number(process.env.SENSOR_WEAR_HOURS || 240); // display estimate only
const POD_NOMINAL_HOURS = Number(process.env.POD_NOMINAL_HOURS || 72);   // display estimate only

const mock = {
  generatedAt: new Date().toISOString(),
  source: 'mock',
  connection: { authStrategy: 'demo', readOnly: true },
  glucose: { value: 126, unit: 'mg/dL', trend: '→', trendLabel: 'Stable', minutesAgo: 2, delta: 1 },
  loop: { mode: 'Closed', modeDetail: 'Démo', lastLoopMinutes: 2, status: 'fresh', prediction: null },
  insulin: { iob: 1.8, cob: 12, basal: 0.65, basalSource: 'demo', lastBolus: 1.2, lastBolusTime: '12:14' },
  devices: {
    podAgeHours: 66, podExpiresInHours: 6, podEstimated: true,
    sensorAgeHours: 216, sensorExpiresAt: 'demain à 18:20', sensorEstimated: true,
    dexcom: 'Connecté', reservoir: 32, pumpBattery: 70
  },
  range: { inRange: 82, low: 2, high: 16, sampleCount: 2016, coverageHours: 168, label: '7 derniers jours' },
  chart: [
    {t: Date.now()-6*3600000, value:104},{t:Date.now()-5.5*3600000,value:98},{t:Date.now()-5*3600000,value:105},
    {t:Date.now()-4.5*3600000,value:111},{t:Date.now()-4*3600000,value:108},{t:Date.now()-3.5*3600000,value:115},
    {t:Date.now()-3*3600000,value:128},{t:Date.now()-2.5*3600000,value:142},{t:Date.now()-2*3600000,value:119},
    {t:Date.now()-1.5*3600000,value:105},{t:Date.now()-1*3600000,value:112},{t:Date.now()-0.5*3600000,value:121},
    {t:Date.now(),value:126}
  ],
  systemAlerts: [{ severity: 'info', text: 'Mode démonstration : aucune donnée médicale réelle n’est affichée.' }],
  aiAdvice: [
    'Mode démonstration : les observations affichées ici sont des exemples.',
    'L’assistant reste strictement consultatif et n’a accès à aucune commande thérapeutique.'
  ]
};

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function numberOrNull(value) {
  if (value === '' || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function dateMs(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordDateMs(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return dateMs(obj.date) ?? dateMs(obj.dateString) ?? dateMs(obj.created_at) ?? dateMs(obj.timestamp) ?? dateMs(obj.clock);
}

function minsAgo(value) {
  const ms = dateMs(value);
  if (ms === null) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 60000));
}

function hoursAgo(value) {
  const ms = dateMs(value);
  if (ms === null) return null;
  return Math.max(0, (Date.now() - ms) / 3600000);
}

function fmtDateFr(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function directionInfo(direction) {
  const map = {
    DoubleUp: ['↑↑', 'Monte très vite'],
    SingleUp: ['↑', 'Monte'],
    FortyFiveUp: ['↗', 'Monte doucement'],
    Flat: ['→', 'Stable'],
    FortyFiveDown: ['↘', 'Descend doucement'],
    SingleDown: ['↓', 'Descend'],
    DoubleDown: ['↓↓', 'Descend très vite'],
    'NOT COMPUTABLE': ['—', 'Tendance indisponible'],
    'RATE OUT OF RANGE': ['—', 'Tendance hors plage']
  };
  return map[direction] || [direction || '—', direction || 'Donnée Nightscout'];
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc !== null && acc !== undefined ? acc[key] : undefined), obj);
}

function firstValueInRecords(records, paths, predicate = v => v !== undefined && v !== null) {
  for (const record of records) {
    for (const p of paths) {
      const value = getPath(record, p);
      if (predicate(value)) return { value, path: p, record };
    }
  }
  return { value: null, path: null, record: null };
}

function firstNumberInRecords(records, paths, predicate = () => true) {
  return firstValueInRecords(records, paths, value => {
    const n = numberOrNull(value);
    return n !== null && predicate(n);
  });
}

function latestRecordWith(records, pathName) {
  return records.find(r => getPath(r, pathName) !== undefined && getPath(r, pathName) !== null) || null;
}

function normalizedText(...values) {
  return values.filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
}

function eventTimestamp(t) {
  return dateMs(t?.created_at) ?? dateMs(t?.timestamp) ?? dateMs(t?.date) ?? dateMs(t?.entered_at);
}

function findLatestTreatment(treatments, matcher) {
  return treatments
    .filter(t => matcher(t))
    .sort((a, b) => (eventTimestamp(b) || 0) - (eventTimestamp(a) || 0))[0] || null;
}

function treatmentEventText(t) {
  return normalizedText(t?.eventType, t?.event_type, t?.reason, t?.notes, t?.type);
}

function findSensorStart(treatments) {
  return findLatestTreatment(treatments, t => {
    const s = treatmentEventText(t);
    return s.includes('sensor start') || s.includes('sensor change') || s.includes('sensor insertion');
  });
}

function findPodStart(treatments) {
  return findLatestTreatment(treatments, t => {
    const s = treatmentEventText(t);
    return s.includes('pod start') || s.includes('pod change') || s.includes('pump site change') || s.includes('cannula change');
  });
}

function findActiveTempBasal(treatments) {
  const now = Date.now();
  const candidates = treatments
    .filter(t => {
      const s = treatmentEventText(t);
      return s.includes('temp basal') || s.includes('temporary basal');
    })
    .sort((a, b) => (eventTimestamp(b) || 0) - (eventTimestamp(a) || 0));

  for (const t of candidates) {
    const started = eventTimestamp(t);
    if (!started) continue;
    const durationMin = numberOrNull(t.duration ?? t.durationInMinutes ?? t.duration_mins);
    const ageMin = (now - started) / 60000;
    const active = durationMin !== null ? ageMin <= durationMin + 2 : ageMin <= 35;
    if (!active) continue;
    const rate = numberOrNull(t.rate ?? t.absolute ?? t.basalRate ?? t.basal_rate);
    if (rate !== null && rate >= 0 && rate <= 30) return { rate, treatment: t };
  }
  return null;
}

function extractPrediction(loop) {
  if (!loop || typeof loop !== 'object') return null;
  const candidates = [
    loop.predicted,
    loop.predictedGlucose,
    loop.prediction,
    loop.recommended?.predicted,
    loop.recommended?.predictedGlucose,
    loop.enacted?.predicted,
    loop.enacted?.predictedGlucose
  ].filter(v => v !== undefined && v !== null);

  function valuesFrom(candidate) {
    let arr = candidate;
    if (!Array.isArray(arr) && arr && typeof arr === 'object') {
      arr = arr.values ?? arr.glucoseValues ?? arr.predictedValues ?? arr.data;
    }
    if (!Array.isArray(arr)) return [];
    return arr.map(v => {
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object') return numberOrNull(v.value ?? v.sgv ?? v.glucose ?? v.quantity);
      return null;
    }).filter(v => v !== null && v >= 20 && v <= 600);
  }

  for (const c of candidates) {
    const values = valuesFrom(c);
    if (values.length >= 2) {
      return {
        points: values.slice(0, 72),
        min: Math.min(...values),
        end: values[values.length - 1]
      };
    }
  }
  return null;
}

async function fetchResponse(url, options = {}) {
  return fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });
}

async function readJsonOrThrow(response, label) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
  if (!response.ok) {
    const detail = body?.message || body?.error || text?.slice(0, 180) || response.statusText;
    throw new Error(`${label}: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
  }
  return body;
}

async function exchangeSubjectTokenForJwt(base, subjectToken) {
  if (!subjectToken) throw new Error('Aucun token Nightscout READABLE fourni.');
  const authUrl = new URL(`/api/v2/authorization/request/token=${encodeURIComponent(subjectToken)}`, base).toString();
  const response = await fetchResponse(authUrl);
  const body = await readJsonOrThrow(response, 'Authentification Nightscout');
  if (!body?.token) throw new Error('Nightscout n’a pas renvoyé de JWT après authentification.');
  return body.token;
}

function buildV3Url(base, collection, params = {}) {
  const u = new URL(`/api/v3/${collection}`, base);
  for (const [key, value] of Object.entries(params)) u.searchParams.set(key, String(value));
  return u.toString();
}

async function fetchV3Collection(base, jwt, collection, params) {
  const response = await fetchResponse(buildV3Url(base, collection, params), {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  const body = await readJsonOrThrow(response, `Nightscout API v3/${collection}`);
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.result)) return body.result;
  return body?.result ?? body;
}

async function fetchV3Paged(base, jwt, collection, total, sortField) {
  const out = [];
  let skip = 0;
  while (out.length < total) {
    const limit = Math.min(API3_PAGE_LIMIT, total - out.length);
    const page = await fetchV3Collection(base, jwt, collection, {
      'sort$desc': sortField,
      limit,
      skip
    });
    const arr = Array.isArray(page) ? page : [];
    out.push(...arr);
    if (arr.length < limit) break;
    skip += arr.length;
  }
  return out;
}

function withReadableToken(rawUrl, token) {
  const u = new URL(rawUrl);
  if (token) u.searchParams.set('token', token);
  return u.toString();
}

async function fetchV1Json(url) {
  const response = await fetchResponse(url);
  return readJsonOrThrow(response, `Nightscout API v1 ${new URL(url).pathname}`);
}

async function fetchNightscoutCollections(base, token) {
  try {
    const jwt = await exchangeSubjectTokenForJwt(base, token);
    const [entries, devicestatus, treatments] = await Promise.all([
      fetchV3Paged(base, jwt, 'entries', HISTORY_MAX_ENTRIES, 'date'),
      fetchV3Paged(base, jwt, 'devicestatus', 160, 'created_at'),
      fetchV3Paged(base, jwt, 'treatments', 700, 'created_at').catch(() => [])
    ]);
    return { entries, devicestatus, treatments, authStrategy: 'v3-jwt' };
  } catch (v3Error) {
    try {
      const entriesBase = new URL(`/api/v1/entries/sgv.json?count=${HISTORY_MAX_ENTRIES}`, base).toString();
      const statusBase = new URL('/api/v1/devicestatus.json?count=160', base).toString();
      const treatmentsBase = new URL('/api/v1/treatments.json?count=700', base).toString();
      const [entries, devicestatus, treatments] = await Promise.all([
        fetchV1Json(withReadableToken(entriesBase, token)),
        fetchV1Json(withReadableToken(statusBase, token)),
        fetchV1Json(withReadableToken(treatmentsBase, token)).catch(() => [])
      ]);
      return { entries, devicestatus, treatments, authStrategy: 'v1-token-query' };
    } catch (v1Error) {
      throw new Error(`Échec auth v3 (${v3Error.message}) ; fallback v1 (${v1Error.message})`);
    }
  }
}

function calculateRange(entries) {
  const now = Date.now();
  const cutoff = now - HISTORY_DAYS * 86400000;
  const valid = entries
    .map(e => ({ t: recordDateMs(e), value: numberOrNull(e?.sgv) }))
    .filter(x => x.t !== null && x.t >= cutoff && x.value !== null && x.value >= 20 && x.value <= 600)
    .sort((a, b) => a.t - b.t);

  if (valid.length < 3) {
    return { inRange: null, low: null, high: null, sampleCount: valid.length, coverageHours: 0, label: 'Pas assez de données' };
  }

  let low = 0, high = 0, inRange = 0;
  for (const x of valid) {
    if (x.value < TIR_LOW) low++;
    else if (x.value > TIR_HIGH) high++;
    else inRange++;
  }
  const n = valid.length;
  const coverageHours = Math.max(0, (valid[valid.length - 1].t - valid[0].t) / 3600000);
  const label = coverageHours >= 144 ? '7 derniers jours' : coverageHours >= 24 ? `${Math.round(coverageHours / 24)} j de données` : `${Math.max(1, Math.round(coverageHours))} h de données`;
  return {
    inRange: Math.round(inRange * 1000 / n) / 10,
    low: Math.round(low * 1000 / n) / 10,
    high: Math.round(high * 1000 / n) / 10,
    sampleCount: n,
    coverageHours: Math.round(coverageHours * 10) / 10,
    label
  };
}

function buildChart(entries) {
  const cutoff = Date.now() - 6 * 3600000;
  return entries
    .map(e => ({ t: recordDateMs(e), value: numberOrNull(e?.sgv) }))
    .filter(x => x.t !== null && x.t >= cutoff && x.value !== null && x.value >= 20 && x.value <= 600)
    .sort((a, b) => a.t - b.t)
    .slice(-80);
}

function extractLoopAndDeviceData(devicestatus, treatments) {
  const records = [...(Array.isArray(devicestatus) ? devicestatus : [])]
    .sort((a, b) => (recordDateMs(b) || 0) - (recordDateMs(a) || 0));

  const loopRecord = latestRecordWith(records, 'loop');
  const loop = loopRecord?.loop || {};
  const loopAge = minsAgo(loop?.timestamp ?? loopRecord?.created_at ?? loopRecord?.date);

  let loopMode = 'Actif';
  let modeDetail = 'Mode Closed/Open non exposé par ce payload';
  const boolPaths = ['closedLoop', 'isClosedLoop', 'closed', 'settings.closedLoop'];
  for (const p of boolPaths) {
    const value = getPath(loop, p);
    if (typeof value === 'boolean') {
      loopMode = value ? 'Closed' : 'Open';
      modeDetail = `Détecté via loop.${p}`;
      break;
    }
  }
  if (loopMode === 'Actif') {
    const stringPaths = ['mode', 'loopMode', 'status'];
    for (const p of stringPaths) {
      const value = getPath(loop, p);
      if (typeof value !== 'string') continue;
      const s = value.toLowerCase();
      if (s.includes('closed')) { loopMode = 'Closed'; modeDetail = `Détecté via loop.${p}`; break; }
      if (s.includes('open')) { loopMode = 'Open'; modeDetail = `Détecté via loop.${p}`; break; }
    }
  }

  const iobHit = firstNumberInRecords(records, [
    'loop.iob.iob', 'loop.iob', 'loop.recommended.iob', 'loop.enacted.iob',
    'pump.iob.iob', 'pump.iob', 'iob.iob', 'iob'
  ], n => n >= -20 && n <= 50);

  const cobHit = firstNumberInRecords(records, [
    'loop.cob.cob', 'loop.cob', 'loop.recommended.cob', 'loop.enacted.cob',
    'pump.cob.cob', 'pump.cob', 'cob.cob', 'cob'
  ], n => n >= 0 && n <= 1000);

  const batteryHit = firstNumberInRecords(records, [
    'pump.battery.percent', 'pump.battery.percentRemaining', 'pump.battery.percentage',
    'pump.batteryPercent', 'pump.battery', 'battery.percent', 'battery'
  ], n => n >= 0 && n <= 100);

  const reservoirHit = firstNumberInRecords(records, [
    'pump.reservoir', 'pump.reservoir.units', 'pump.reservoirRemaining',
    'reservoir', 'reservoir.units'
  ], n => n >= 0 && n <= 300);

  const activeTemp = findActiveTempBasal(treatments);
  const basalHit = firstNumberInRecords(records, [
    'pump.basal.rate', 'pump.basal.absolute', 'pump.basal',
    'loop.enacted.tempBasal.rate', 'loop.enacted.rate',
    'loop.recommended.tempBasal.rate', 'loop.recommended.rate',
    'loop.basal.rate', 'basal.rate'
  ], n => n >= 0 && n <= 30);

  const basal = activeTemp?.rate ?? (basalHit.value !== null ? numberOrNull(basalHit.value) : null);
  const basalSource = activeTemp ? 'treatment temp basal actif' : basalHit.path ? `devicestatus:${basalHit.path}` : null;

  return {
    loop: {
      mode: loopMode,
      modeDetail,
      lastLoopMinutes: loopAge,
      lastLoopAt: recordDateMs(loopRecord),
      status: loopAge === null ? 'unknown' : loopAge <= 15 ? 'fresh' : 'stale',
      prediction: extractPrediction(loop)
    },
    iob: iobHit.value !== null ? numberOrNull(iobHit.value) : null,
    cob: cobHit.value !== null ? numberOrNull(cobHit.value) : null,
    basal,
    basalSource,
    pumpBattery: batteryHit.value !== null ? numberOrNull(batteryHit.value) : null,
    reservoir: reservoirHit.value !== null ? numberOrNull(reservoirHit.value) : null,
    fieldSources: {
      iob: iobHit.path,
      cob: cobHit.path,
      basal: basalSource,
      pumpBattery: batteryHit.path,
      reservoir: reservoirHit.path
    }
  };
}

async function nightscoutSnapshot() {
  const base = process.env.NIGHTSCOUT_URL?.trim();
  const token = process.env.NIGHTSCOUT_TOKEN?.trim();
  if (!base) return null;

  const { entries, devicestatus, treatments, authStrategy } = await fetchNightscoutCollections(base, token);
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('Nightscout ne renvoie aucune entrée CGM.');

  const sortedEntries = [...entries].sort((a, b) => (recordDateMs(b) || 0) - (recordDateMs(a) || 0));
  const latest = sortedEntries[0];
  const previous = sortedEntries[1];
  const [trend, trendLabel] = directionInfo(latest?.direction);
  const glucose = numberOrNull(latest?.sgv);
  const previousGlucose = numberOrNull(previous?.sgv);
  const delta = glucose !== null && previousGlucose !== null ? glucose - previousGlucose : null;
  const glucoseAge = minsAgo(latest?.date ?? latest?.dateString);
  const stale = glucoseAge !== null && glucoseAge > 12;

  const treatmentList = Array.isArray(treatments) ? treatments : [];
  const deviceData = extractLoopAndDeviceData(devicestatus, treatmentList);
  const lastBolus = findLatestTreatment(treatmentList, t => numberOrNull(t?.insulin) > 0);

  const sensorStart = findSensorStart(treatmentList);
  const sensorStartMs = sensorStart ? eventTimestamp(sensorStart) : null;
  const sensorAgeHours = sensorStartMs ? Math.max(0, (Date.now() - sensorStartMs) / 3600000) : null;
  const sensorEstimatedEndMs = sensorStartMs ? sensorStartMs + SENSOR_WEAR_HOURS * 3600000 : null;

  const podStart = findPodStart(treatmentList);
  const podStartMs = podStart ? eventTimestamp(podStart) : null;
  const podAgeHours = podStartMs ? Math.max(0, (Date.now() - podStartMs) / 3600000) : null;
  const podEstimatedEndMs = podStartMs ? podStartMs + POD_NOMINAL_HOURS * 3600000 : null;
  const podExpiresInHours = podEstimatedEndMs ? (podEstimatedEndMs - Date.now()) / 3600000 : null;

  const range = calculateRange(sortedEntries);
  const chart = buildChart(sortedEntries);

  const systemAlerts = [];
  if (stale) {
    systemAlerts.push({ severity: 'warning', text: `Données CGM anciennes : dernière mesure il y a ${glucoseAge} min.` });
  }
  if (deviceData.loop.lastLoopMinutes !== null && deviceData.loop.lastLoopMinutes > 20) {
    systemAlerts.push({ severity: 'warning', text: `Dernier état Loop reçu il y a ${deviceData.loop.lastLoopMinutes} min.` });
  }
  if (!stale && (deviceData.loop.lastLoopMinutes === null || deviceData.loop.lastLoopMinutes <= 20)) {
    systemAlerts.push({ severity: 'info', text: `Nightscout LIVE chargé en lecture seule (${authStrategy}). Aucune route d’écriture n’est exposée.` });
  }
  if (range.coverageHours < 144 && range.sampleCount >= 3) {
    systemAlerts.push({ severity: 'info', text: `Le Time in Range est calculé sur ${range.label}, car Nightscout ne contient pas encore 7 jours complets.` });
  }

  const aiAdvice = [
    'Mode conseil uniquement : aucune commande thérapeutique n’est disponible dans GlucyZen.'
  ];
  if (glucose !== null) {
    if (glucose < TIR_LOW || glucose > TIR_HIGH) {
      aiAdvice.push(`La valeur actuelle (${glucose} mg/dL) est hors de la plage ${TIR_LOW}–${TIR_HIGH} affichée. Vérifie Loop/Dexcom et suis le protocole habituel.`);
    } else {
      aiAdvice.push(`La valeur actuelle (${glucose} mg/dL) est dans la plage ${TIR_LOW}–${TIR_HIGH} affichée, avec une tendance « ${trendLabel} ».`);
    }
  }
  if (range.inRange !== null && range.sampleCount >= 12) {
    aiAdvice.push(`Sur ${range.label}, ${range.inRange} % des mesures disponibles sont dans la plage affichée.`);
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'nightscout-live',
    connection: { authStrategy, readOnly: true, writesExposed: false },
    glucose: {
      value: glucose,
      unit: 'mg/dL',
      trend,
      trendLabel,
      minutesAgo: glucoseAge,
      delta
    },
    loop: deviceData.loop,
    insulin: {
      iob: deviceData.iob,
      cob: deviceData.cob,
      basal: deviceData.basal,
      basalSource: deviceData.basalSource,
      lastBolus: lastBolus ? numberOrNull(lastBolus.insulin) : null,
      lastBolusTime: lastBolus && eventTimestamp(lastBolus)
        ? new Date(eventTimestamp(lastBolus)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : null
    },
    devices: {
      podAgeHours: podAgeHours !== null ? Math.round(podAgeHours * 10) / 10 : null,
      podExpiresInHours: podExpiresInHours !== null ? Math.round(podExpiresInHours * 10) / 10 : null,
      podEstimated: Boolean(podStartMs),
      sensorAgeHours: sensorAgeHours !== null ? Math.round(sensorAgeHours * 10) / 10 : null,
      sensorExpiresAt: sensorEstimatedEndMs ? fmtDateFr(sensorEstimatedEndMs) : null,
      sensorEstimated: Boolean(sensorStartMs),
      dexcom: stale ? 'Données possiblement obsolètes' : 'Données reçues via Nightscout',
      reservoir: deviceData.reservoir,
      pumpBattery: deviceData.pumpBattery
    },
    range,
    chart,
    diagnostics: {
      fieldSources: deviceData.fieldSources,
      devicestatusCount: Array.isArray(devicestatus) ? devicestatus.length : 0,
      treatmentsCount: treatmentList.length,
      entriesCount: sortedEntries.length
    },
    systemAlerts,
    aiAdvice
  };
}

function unavailablePayload(error) {
  return {
    generatedAt: new Date().toISOString(),
    source: 'nightscout-error',
    error: error.message,
    connection: { readOnly: true, writesExposed: false },
    glucose: { value: null, unit: 'mg/dL', trend: '—', trendLabel: 'Indisponible', minutesAgo: null, delta: null },
    loop: { mode: '—', modeDetail: null, lastLoopMinutes: null, status: 'error', prediction: null },
    insulin: { iob: null, cob: null, basal: null, basalSource: null, lastBolus: null, lastBolusTime: null },
    devices: { podAgeHours: null, podExpiresInHours: null, sensorAgeHours: null, sensorExpiresAt: null, dexcom: 'Connexion Nightscout impossible', reservoir: null, pumpBattery: null },
    range: { inRange: null, low: null, high: null, sampleCount: 0, coverageHours: 0, label: 'Indisponible' },
    chart: [],
    systemAlerts: [{ severity: 'warning', text: `MODE LIVE : données indisponibles — ${error.message}` }],
    aiAdvice: ['Aucune analyse n’est produite tant que les données réelles ne sont pas disponibles.']
  };
}

function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Hard guardrail: the local app exposes no write API at all.
  if (url.pathname.startsWith('/api/') && req.method !== 'GET') {
    return json(res, 405, { error: 'Read-only API: writes are disabled by design.' });
  }

  if (url.pathname === '/api/live') {
    const liveConfigured = Boolean(process.env.NIGHTSCOUT_URL?.trim());
    if (!liveConfigured) return json(res, 200, { ...mock, generatedAt: new Date().toISOString() });
    try {
      return json(res, 200, await nightscoutSnapshot());
    } catch (error) {
      console.error('[Nightscout]', error.message);
      return json(res, 503, unavailablePayload(error));
    }
  }

  if (url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      version: VERSION,
      mode: process.env.NIGHTSCOUT_URL ? 'live' : 'demo',
      nightscoutConfigured: Boolean(process.env.NIGHTSCOUT_URL),
      tokenConfigured: Boolean(process.env.NIGHTSCOUT_TOKEN),
      authStrategy: 'Nightscout subject token → temporary JWT (API v3), with v1 fallback',
      historyTargetDays: HISTORY_DAYS,
      readOnly: true,
      writesExposed: false
    });
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`GlucyZen MVP v${VERSION} running on http://localhost:${PORT}`);
  if (process.env.NIGHTSCOUT_URL) {
    console.log('LIVE MODE: Nightscout bridge enabled (read-only).');
    console.log(process.env.NIGHTSCOUT_TOKEN ? 'Readable access token configured.' : 'No token configured.');
    console.log('Auth: subject token -> temporary JWT -> Nightscout API v3 (v1 fallback).');
    console.log('v0.5: one-click encrypted local config + update-ready architecture.');
    console.log('Demo fallback is DISABLED in live mode.');
  } else {
    console.log('DEMO MODE: no NIGHTSCOUT_URL configured.');
  }
});
