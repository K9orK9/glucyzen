const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const VERSION = '0.10';
const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TIR_LOW = Number(process.env.TIR_LOW || 70);
const TIR_HIGH = Number(process.env.TIR_HIGH || 180);
const HISTORY_DAYS = 7;
const HISTORY_MAX_ENTRIES = 2300;
const API3_PAGE_LIMIT = 1000;
const SENSOR_WEAR_HOURS = Number(process.env.SENSOR_WEAR_HOURS || 240);
const POD_NOMINAL_HOURS = Number(process.env.POD_NOMINAL_HOURS || 72);
const TIMELINE_HOURS = 24;
const TIMELINE_MAX_POINTS = 420;

const mockNow = Date.now();
const mockGlucose = Array.from({ length: 72 }, (_, i) => ({
  t: mockNow - (71 - i) * 20 * 60000,
  value: 120 + Math.round(Math.sin(i / 5) * 22)
}));
const mock = {
  generatedAt: new Date().toISOString(),
  source: 'mock',
  connection: { authStrategy: 'demo', readOnly: true, writesExposed: false },
  glucose: { value: 126, unit: 'mg/dL', trend: '→', trendLabel: 'Stable', minutesAgo: 2, delta: 1 },
  loop: { mode: 'Closed', modeDetail: 'Démo', lastLoopMinutes: 2, status: 'fresh', prediction: null },
  insulin: { iob: 1.8, cob: 12, basal: 0.65, basalSource: 'demo', lastBolus: 1.2, lastBolusTime: '12:14' },
  devices: { podAgeHours: 66, podExpiresInHours: 6, podEstimated: true, sensorAgeHours: 216, sensorExpiresAt: 'demain à 18:20', sensorEstimated: true, dexcom: 'Connecté', reservoir: 32, pumpBattery: 70 },
  range: { inRange: 82, low: 2, high: 16, sampleCount: 2016, coverageHours: 168, label: '7 derniers jours' },
  chart: mockGlucose,
  timeline: {
    glucose: mockGlucose,
    events: [
      {
        id: 'demo-carbs', t: mockNow - 105 * 60000, type: 'carbs', value: 18, unit: 'g', label: '18 g',
        eventType: 'Carb Correction', carbs: 18, insulin: null, absorptionDisplay: '3 h', durationDisplay: null,
        enteredBy: 'loop://iPhone', notes: 'Exemple de démonstration', source: 'Nightscout treatment'
      },
      {
        id: 'demo-bolus', t: mockNow - 100 * 60000, type: 'bolus', value: 1.2, unit: 'U', label: '1.2 U',
        eventType: 'Correction Bolus', carbs: null, insulin: 1.2, absorptionDisplay: null, durationDisplay: null,
        enteredBy: 'loop://iPhone', notes: null, source: 'Nightscout treatment'
      }
    ],
    basal: [
      { t: mockNow - 12 * 3600000, rate: 0.6 },
      { t: mockNow - 2 * 3600000, rate: 0.9 },
      { t: mockNow - 45 * 60000, rate: 0.65 }
    ],
    hours: TIMELINE_HOURS
  },
  systemAlerts: [{ severity: 'info', text: 'Mode démonstration : aucune donnée médicale réelle n’est affichée.' }],
  aiAdvice: ['Mode démonstration : les observations affichées ici sont des exemples.', 'L’assistant reste strictement consultatif et n’a accès à aucune commande thérapeutique.']
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

function cleanText(value, max = 240) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
}

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

function eventTimestamp(t) {
  return dateMs(t?.created_at) ?? dateMs(t?.timestamp) ?? dateMs(t?.date) ?? dateMs(t?.entered_at) ?? dateMs(t?.dateString);
}

function minsAgo(value) {
  const ms = dateMs(value);
  return ms === null ? null : Math.max(0, Math.round((Date.now() - ms) / 60000));
}

function fmtDateFr(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function directionInfo(direction) {
  const map = {
    DoubleUp: ['↑↑', 'Monte très vite'], SingleUp: ['↑', 'Monte'], FortyFiveUp: ['↗', 'Monte doucement'], Flat: ['→', 'Stable'],
    FortyFiveDown: ['↘', 'Descend doucement'], SingleDown: ['↓', 'Descend'], DoubleDown: ['↓↓', 'Descend très vite'],
    'NOT COMPUTABLE': ['—', 'Tendance indisponible'], 'RATE OUT OF RANGE': ['—', 'Tendance hors plage']
  };
  return map[direction] || [direction || '—', direction || 'Donnée Nightscout'];
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc !== null && acc !== undefined ? acc[key] : undefined), obj);
}

function firstNumberInRecords(records, paths, predicate = () => true) {
  for (const record of records) {
    for (const p of paths) {
      const n = numberOrNull(getPath(record, p));
      if (n !== null && predicate(n)) return { value: n, path: p, record };
    }
  }
  return { value: null, path: null, record: null };
}

function latestRecordWith(records, pathName) {
  return records.find(r => getPath(r, pathName) !== undefined && getPath(r, pathName) !== null) || null;
}

function normalizedText(...values) {
  return values.filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
}

function treatmentEventText(t) {
  return normalizedText(t?.eventType, t?.event_type, t?.reason, t?.notes, t?.type);
}

function findLatestTreatment(treatments, matcher) {
  return treatments.filter(t => matcher(t)).sort((a, b) => (eventTimestamp(b) || 0) - (eventTimestamp(a) || 0))[0] || null;
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

function extractPrediction(loop) {
  if (!loop || typeof loop !== 'object') return null;
  const candidates = [loop.predicted, loop.predictedGlucose, loop.prediction, loop.recommended?.predicted, loop.recommended?.predictedGlucose, loop.enacted?.predicted, loop.enacted?.predictedGlucose].filter(Boolean);
  for (const candidate of candidates) {
    let arr = candidate;
    if (!Array.isArray(arr) && arr && typeof arr === 'object') arr = arr.values ?? arr.glucoseValues ?? arr.predictedValues ?? arr.data;
    if (!Array.isArray(arr)) continue;
    const values = arr.map(v => typeof v === 'number' ? v : numberOrNull(v?.value ?? v?.sgv ?? v?.glucose ?? v?.quantity)).filter(v => v !== null && v >= 20 && v <= 600);
    if (values.length >= 2) return { points: values.slice(0, 72), min: Math.min(...values), end: values[values.length - 1] };
  }
  return null;
}

async function fetchResponse(url, options = {}) {
  return fetch(url, {
    method: 'GET', cache: 'no-store',
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', ...(options.headers || {}) },
    signal: AbortSignal.timeout(12000)
  });
}

async function readJsonOrThrow(response, label) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) {}
  if (!response.ok) {
    const detail = body?.message || body?.error || text?.slice(0, 180) || response.statusText;
    throw new Error(`${label}: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
  }
  return body;
}

async function exchangeSubjectTokenForJwt(base, subjectToken) {
  if (!subjectToken) throw new Error('Aucun token Nightscout READABLE fourni.');
  const authUrl = new URL(`/api/v2/authorization/request/token=${encodeURIComponent(subjectToken)}`, base).toString();
  const body = await readJsonOrThrow(await fetchResponse(authUrl), 'Authentification Nightscout');
  if (!body?.token) throw new Error('Nightscout n’a pas renvoyé de JWT après authentification.');
  return body.token;
}

function buildV3Url(base, collection, params = {}) {
  const u = new URL(`/api/v3/${collection}`, base);
  for (const [key, value] of Object.entries(params)) u.searchParams.set(key, String(value));
  return u.toString();
}

async function fetchV3Collection(base, jwt, collection, params) {
  const body = await readJsonOrThrow(
    await fetchResponse(buildV3Url(base, collection, params), { headers: { Authorization: `Bearer ${jwt}` } }),
    `Nightscout API v3/${collection}`
  );
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.result)) return body.result;
  return body?.result ?? body;
}

async function fetchV3Paged(base, jwt, collection, total, sortField) {
  const out = [];
  let skip = 0;
  while (out.length < total) {
    const limit = Math.min(API3_PAGE_LIMIT, total - out.length);
    const page = await fetchV3Collection(base, jwt, collection, { 'sort$desc': sortField, limit, skip });
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
  return readJsonOrThrow(await fetchResponse(url), `Nightscout API v1 ${new URL(url).pathname}`);
}

async function fetchNightscoutCollections(base, token) {
  try {
    const jwt = await exchangeSubjectTokenForJwt(base, token);
    const [entries, devicestatus, treatments] = await Promise.all([
      fetchV3Paged(base, jwt, 'entries', HISTORY_MAX_ENTRIES, 'date'),
      fetchV3Paged(base, jwt, 'devicestatus', 600, 'created_at'),
      fetchV3Paged(base, jwt, 'treatments', 1800, 'created_at').catch(() => [])
    ]);
    return { entries, devicestatus, treatments, authStrategy: 'v3-jwt' };
  } catch (v3Error) {
    try {
      const entriesUrl = withReadableToken(new URL(`/api/v1/entries/sgv.json?count=${HISTORY_MAX_ENTRIES}`, base).toString(), token);
      const statusUrl = withReadableToken(new URL('/api/v1/devicestatus.json?count=600', base).toString(), token);
      const treatmentsUrl = withReadableToken(new URL('/api/v1/treatments.json?count=1800', base).toString(), token);
      const [entries, devicestatus, treatments] = await Promise.all([
        fetchV1Json(entriesUrl), fetchV1Json(statusUrl), fetchV1Json(treatmentsUrl).catch(() => [])
      ]);
      return { entries, devicestatus, treatments, authStrategy: 'v1-token-query' };
    } catch (v1Error) {
      throw new Error(`Échec auth v3 (${v3Error.message}) ; fallback v1 (${v1Error.message})`);
    }
  }
}

function calculateRange(entries) {
  const cutoff = Date.now() - HISTORY_DAYS * 86400000;
  const valid = entries
    .map(e => ({ t: recordDateMs(e), value: numberOrNull(e?.sgv) }))
    .filter(x => x.t !== null && x.t >= cutoff && x.value !== null && x.value >= 20 && x.value <= 600)
    .sort((a, b) => a.t - b.t);
  if (valid.length < 3) return { inRange: null, low: null, high: null, sampleCount: valid.length, coverageHours: 0, label: 'Pas assez de données' };
  let low = 0, high = 0, inRange = 0;
  valid.forEach(x => { if (x.value < TIR_LOW) low++; else if (x.value > TIR_HIGH) high++; else inRange++; });
  const n = valid.length;
  const coverageHours = Math.max(0, (valid.at(-1).t - valid[0].t) / 3600000);
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

function buildChart(entries, hours = TIMELINE_HOURS) {
  const cutoff = Date.now() - hours * 3600000;
  return entries
    .map(e => ({ t: recordDateMs(e), value: numberOrNull(e?.sgv) }))
    .filter(x => x.t !== null && x.t >= cutoff && x.value !== null && x.value >= 20 && x.value <= 600)
    .sort((a, b) => a.t - b.t)
    .slice(-TIMELINE_MAX_POINTS);
}

function treatmentCarbs(t) {
  return numberOrNull(t?.carbs ?? t?.carbohydrates ?? t?.carbInput ?? t?.carbsInput);
}

function treatmentInsulin(t) {
  return numberOrNull(t?.insulin ?? t?.insulinDelivered ?? t?.bolus ?? t?.amount);
}

function treatmentBasalRate(t) {
  return numberOrNull(t?.rate ?? t?.absolute ?? t?.basalRate ?? t?.basal_rate);
}

function treatmentDuration(t) {
  return numberOrNull(t?.duration ?? t?.durationInMinutes ?? t?.duration_mins);
}

function eventTypeOf(t, fallback) {
  return cleanText(t?.eventType ?? t?.event_type ?? t?.type ?? t?.reason, 100) || fallback;
}

function enteredByOf(t) {
  return cleanText(t?.enteredBy ?? t?.entered_by ?? t?.device ?? t?.source ?? t?.origin, 120);
}

function notesOf(t) {
  return cleanText(t?.notes ?? t?.note ?? t?.reason, 240);
}

function absorptionDisplayOf(t) {
  const raw = numberOrNull(
    t?.absorptionTime ?? t?.absorption_time ?? t?.absorptionTimeHours ??
    t?.absorptionTimeMinutes ?? t?.absorptionTimeInMinutes ?? t?.absorption
  );
  if (raw === null || raw <= 0) return null;
  const hours = raw > 24 ? raw / 60 : raw;
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return `${Math.round(hours * 10) / 10} h`;
}

function durationDisplayOf(t) {
  const minutes = treatmentDuration(t);
  if (minutes === null || minutes <= 0) return null;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} h`;
  return `${Math.round(minutes)} min`;
}

function baseEventMeta(t, at, eventType) {
  return {
    id: cleanText(t?._id ?? t?.identifier ?? t?.id, 80) || `${at}-${eventType}`,
    t: at,
    eventType,
    enteredBy: enteredByOf(t),
    notes: notesOf(t),
    absorptionDisplay: absorptionDisplayOf(t),
    durationDisplay: durationDisplayOf(t),
    createdAt: cleanText(t?.created_at ?? t?.dateString ?? t?.timestamp, 80),
    source: 'Nightscout treatment'
  };
}

function buildTimeline(entries, treatments, devicestatus) {
  const cutoff = Date.now() - TIMELINE_HOURS * 3600000;
  const glucose = buildChart(entries, TIMELINE_HOURS);
  const events = [];

  for (const t of treatments || []) {
    const at = eventTimestamp(t);
    if (!at || at < cutoff) continue;
    const carbs = treatmentCarbs(t);
    const insulin = treatmentInsulin(t);

    if (carbs !== null && carbs > 0 && carbs < 500) {
      const value = Math.round(carbs * 10) / 10;
      events.push({
        ...baseEventMeta(t, at, eventTypeOf(t, 'Carb Correction')),
        type: 'carbs', value, unit: 'g', label: `${value} g`, carbs: value,
        insulin: insulin !== null && insulin > 0 ? Math.round(insulin * 100) / 100 : null
      });
    }

    if (insulin !== null && insulin > 0 && insulin < 50) {
      const value = Math.round(insulin * 100) / 100;
      events.push({
        ...baseEventMeta(t, at, eventTypeOf(t, 'Bolus')),
        type: 'bolus', value, unit: 'U', label: `${value} U`, insulin: value,
        carbs: carbs !== null && carbs > 0 ? Math.round(carbs * 10) / 10 : null,
        programmedInsulin: numberOrNull(t?.programmed ?? t?.programmedInsulin ?? t?.insulinProgrammed),
        deliveredInsulin: numberOrNull(t?.delivered ?? t?.deliveredInsulin ?? t?.insulinDelivered)
      });
    }
  }
  events.sort((a, b) => a.t - b.t);

  const basalCandidates = [];
  for (const r of devicestatus || []) {
    const at = recordDateMs(r);
    if (!at || at < cutoff - 45 * 60000) continue;
    const hit = firstNumberInRecords([r], [
      'pump.basal.rate', 'pump.basal.absolute', 'pump.basal',
      'loop.enacted.tempBasal.rate', 'loop.enacted.rate',
      'loop.recommended.tempBasal.rate', 'loop.recommended.rate',
      'loop.basal.rate', 'basal.rate'
    ], n => n >= 0 && n <= 30);
    if (hit.value !== null) basalCandidates.push({ t: at, rate: Math.round(hit.value * 1000) / 1000, source: 'devicestatus' });
  }

  for (const t of treatments || []) {
    const at = eventTimestamp(t);
    if (!at || at < cutoff - 45 * 60000) continue;
    const text = treatmentEventText(t);
    const rate = treatmentBasalRate(t);
    if ((text.includes('temp basal') || text.includes('temporary basal')) && rate !== null && rate >= 0 && rate <= 30) {
      basalCandidates.push({ t: at, rate: Math.round(rate * 1000) / 1000, durationMin: treatmentDuration(t), source: 'treatment' });
    }
  }

  basalCandidates.sort((a, b) => a.t - b.t);
  const basal = [];
  for (const p of basalCandidates) {
    const prev = basal.at(-1);
    if (!prev || Math.abs(prev.rate - p.rate) > 0.0005 || p.t - prev.t > 45 * 60000) basal.push(p);
    else if (p.t > prev.t) prev.t = p.t;
  }

  return { glucose, events, basal: basal.slice(-320), hours: TIMELINE_HOURS };
}

function extractLoopAndDeviceData(devicestatus, treatments) {
  const records = [...(Array.isArray(devicestatus) ? devicestatus : [])]
    .sort((a, b) => (recordDateMs(b) || 0) - (recordDateMs(a) || 0));
  const loopRecord = latestRecordWith(records, 'loop');
  const loop = loopRecord?.loop || {};
  const loopAge = minsAgo(loop?.timestamp ?? loopRecord?.created_at ?? loopRecord?.date);
  let loopMode = 'Actif', modeDetail = 'Mode Closed/Open non exposé par ce payload';

  for (const p of ['closedLoop', 'isClosedLoop', 'closed', 'settings.closedLoop']) {
    const value = getPath(loop, p);
    if (typeof value === 'boolean') { loopMode = value ? 'Closed' : 'Open'; modeDetail = `Détecté via loop.${p}`; break; }
  }
  if (loopMode === 'Actif') for (const p of ['mode', 'loopMode', 'status']) {
    const value = getPath(loop, p);
    if (typeof value !== 'string') continue;
    const s = value.toLowerCase();
    if (s.includes('closed')) { loopMode = 'Closed'; modeDetail = `Détecté via loop.${p}`; break; }
    if (s.includes('open')) { loopMode = 'Open'; modeDetail = `Détecté via loop.${p}`; break; }
  }

  const iob = firstNumberInRecords(records, ['loop.iob.iob', 'loop.iob', 'loop.recommended.iob', 'loop.enacted.iob', 'pump.iob.iob', 'pump.iob', 'iob.iob', 'iob'], n => n >= -20 && n <= 50);
  const cob = firstNumberInRecords(records, ['loop.cob.cob', 'loop.cob', 'loop.recommended.cob', 'loop.enacted.cob', 'pump.cob.cob', 'pump.cob', 'cob.cob', 'cob'], n => n >= 0 && n <= 1000);
  const battery = firstNumberInRecords(records, ['pump.battery.percent', 'pump.battery.percentRemaining', 'pump.battery.percentage', 'pump.batteryPercent', 'pump.battery', 'battery.percent', 'battery'], n => n >= 0 && n <= 100);
  const reservoir = firstNumberInRecords(records, ['pump.reservoir', 'pump.reservoir.units', 'pump.reservoirRemaining', 'reservoir', 'reservoir.units'], n => n >= 0 && n <= 300);
  const basalHit = firstNumberInRecords(records, ['pump.basal.rate', 'pump.basal.absolute', 'pump.basal', 'loop.enacted.tempBasal.rate', 'loop.enacted.rate', 'loop.recommended.tempBasal.rate', 'loop.recommended.rate', 'loop.basal.rate', 'basal.rate'], n => n >= 0 && n <= 30);
  const activeTemp = findLatestTreatment(treatments || [], t => {
    const at = eventTimestamp(t), duration = treatmentDuration(t), rate = treatmentBasalRate(t), text = treatmentEventText(t);
    if (!at || rate === null || !(text.includes('temp basal') || text.includes('temporary basal'))) return false;
    return duration !== null ? Date.now() <= at + (duration + 2) * 60000 : Date.now() - at <= 35 * 60000;
  });
  const activeRate = activeTemp ? treatmentBasalRate(activeTemp) : null;

  return {
    loop: { mode: loopMode, modeDetail, lastLoopMinutes: loopAge, lastLoopAt: recordDateMs(loopRecord), status: loopAge === null ? 'unknown' : loopAge <= 15 ? 'fresh' : 'stale', prediction: extractPrediction(loop) },
    iob: iob.value, cob: cob.value,
    basal: activeRate ?? basalHit.value,
    basalSource: activeRate !== null ? 'treatment temp basal actif' : basalHit.path ? `devicestatus:${basalHit.path}` : null,
    pumpBattery: battery.value, reservoir: reservoir.value,
    fieldSources: { iob: iob.path, cob: cob.path, basal: activeRate !== null ? 'treatment temp basal actif' : basalHit.path, pumpBattery: battery.path, reservoir: reservoir.path }
  };
}

async function nightscoutSnapshot() {
  const base = process.env.NIGHTSCOUT_URL?.trim();
  const token = process.env.NIGHTSCOUT_TOKEN?.trim();
  if (!base) return null;

  const { entries, devicestatus, treatments, authStrategy } = await fetchNightscoutCollections(base, token);
  if (!Array.isArray(entries) || !entries.length) throw new Error('Nightscout ne renvoie aucune entrée CGM.');

  const sortedEntries = [...entries].sort((a, b) => (recordDateMs(b) || 0) - (recordDateMs(a) || 0));
  const latest = sortedEntries[0], previous = sortedEntries[1];
  const [trend, trendLabel] = directionInfo(latest?.direction);
  const glucose = numberOrNull(latest?.sgv), previousGlucose = numberOrNull(previous?.sgv);
  const delta = glucose !== null && previousGlucose !== null ? glucose - previousGlucose : null;
  const glucoseAge = minsAgo(latest?.date ?? latest?.dateString), stale = glucoseAge !== null && glucoseAge > 12;

  const treatmentList = Array.isArray(treatments) ? treatments : [];
  const deviceData = extractLoopAndDeviceData(devicestatus, treatmentList);
  const lastBolus = findLatestTreatment(treatmentList, t => { const n = treatmentInsulin(t); return n !== null && n > 0; });
  const sensorStart = findSensorStart(treatmentList), sensorStartMs = sensorStart ? eventTimestamp(sensorStart) : null;
  const podStart = findPodStart(treatmentList), podStartMs = podStart ? eventTimestamp(podStart) : null;
  const sensorAgeHours = sensorStartMs ? Math.max(0, (Date.now() - sensorStartMs) / 3600000) : null;
  const podAgeHours = podStartMs ? Math.max(0, (Date.now() - podStartMs) / 3600000) : null;
  const sensorEstimatedEndMs = sensorStartMs ? sensorStartMs + SENSOR_WEAR_HOURS * 3600000 : null;
  const podEstimatedEndMs = podStartMs ? podStartMs + POD_NOMINAL_HOURS * 3600000 : null;
  const podExpiresInHours = podEstimatedEndMs ? (podEstimatedEndMs - Date.now()) / 3600000 : null;
  const range = calculateRange(sortedEntries);
  const chart = buildChart(sortedEntries);
  const timeline = buildTimeline(sortedEntries, treatmentList, devicestatus);

  const systemAlerts = [];
  if (stale) systemAlerts.push({ severity: 'warning', text: `Données CGM anciennes : dernière mesure il y a ${glucoseAge} min.` });
  if (deviceData.loop.lastLoopMinutes !== null && deviceData.loop.lastLoopMinutes > 20) systemAlerts.push({ severity: 'warning', text: `Dernier état Loop reçu il y a ${deviceData.loop.lastLoopMinutes} min.` });
  if (!stale && (deviceData.loop.lastLoopMinutes === null || deviceData.loop.lastLoopMinutes <= 20)) systemAlerts.push({ severity: 'info', text: `Nightscout LIVE chargé en lecture seule (${authStrategy}).` });
  if (range.coverageHours < 144 && range.sampleCount >= 3) systemAlerts.push({ severity: 'info', text: `Le Time in Range est calculé sur ${range.label}, car Nightscout ne contient pas encore 7 jours complets.` });

  const aiAdvice = ['Mode conseil uniquement : aucune commande thérapeutique n’est disponible dans GlucyZen.'];
  if (glucose !== null) {
    if (glucose < TIR_LOW || glucose > TIR_HIGH) aiAdvice.push(`La valeur actuelle (${glucose} mg/dL) est hors de la plage ${TIR_LOW}–${TIR_HIGH} affichée.`);
    else aiAdvice.push(`La valeur actuelle (${glucose} mg/dL) est dans la plage ${TIR_LOW}–${TIR_HIGH} affichée, tendance « ${trendLabel} ».`);
  }
  if (range.inRange !== null && range.sampleCount >= 12) aiAdvice.push(`Sur ${range.label}, ${range.inRange} % des mesures disponibles sont dans la plage affichée.`);

  return {
    generatedAt: new Date().toISOString(),
    source: 'nightscout-live',
    connection: { authStrategy, readOnly: true, writesExposed: false },
    glucose: { value: glucose, unit: 'mg/dL', trend, trendLabel, minutesAgo: glucoseAge, delta },
    loop: deviceData.loop,
    insulin: {
      iob: deviceData.iob, cob: deviceData.cob, basal: deviceData.basal, basalSource: deviceData.basalSource,
      lastBolus: lastBolus ? treatmentInsulin(lastBolus) : null,
      lastBolusTime: lastBolus && eventTimestamp(lastBolus) ? new Date(eventTimestamp(lastBolus)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null
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
    range, chart, timeline,
    diagnostics: {
      fieldSources: deviceData.fieldSources,
      devicestatusCount: Array.isArray(devicestatus) ? devicestatus.length : 0,
      treatmentsCount: treatmentList.length,
      entriesCount: sortedEntries.length,
      timelineEvents: timeline.events.length,
      timelineBasalPoints: timeline.basal.length
    },
    systemAlerts, aiAdvice
  };
}

function unavailablePayload(error) {
  return {
    generatedAt: new Date().toISOString(), source: 'nightscout-error', error: error.message,
    connection: { readOnly: true, writesExposed: false },
    glucose: { value: null, unit: 'mg/dL', trend: '—', trendLabel: 'Indisponible', minutesAgo: null, delta: null },
    loop: { mode: '—', modeDetail: null, lastLoopMinutes: null, status: 'error', prediction: null },
    insulin: { iob: null, cob: null, basal: null, basalSource: null, lastBolus: null, lastBolusTime: null },
    devices: { podAgeHours: null, podExpiresInHours: null, sensorAgeHours: null, sensorExpiresAt: null, dexcom: 'Connexion Nightscout impossible', reservoir: null, pumpBattery: null },
    range: { inRange: null, low: null, high: null, sampleCount: 0, coverageHours: 0, label: 'Indisponible' },
    chart: [], timeline: { glucose: [], events: [], basal: [], hours: TIMELINE_HOURS },
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
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/') && req.method !== 'GET') return json(res, 405, { error: 'Read-only API: writes are disabled by design.' });

  if (url.pathname === '/api/live') {
    if (!process.env.NIGHTSCOUT_URL?.trim()) return json(res, 200, { ...mock, generatedAt: new Date().toISOString() });
    try { return json(res, 200, await nightscoutSnapshot()); }
    catch (error) {
      console.error('[Nightscout]', error.message);
      return json(res, 503, unavailablePayload(error));
    }
  }

  if (url.pathname === '/api/health') return json(res, 200, {
    ok: true,
    version: VERSION,
    mode: process.env.NIGHTSCOUT_URL ? 'live' : 'demo',
    nightscoutConfigured: Boolean(process.env.NIGHTSCOUT_URL),
    tokenConfigured: Boolean(process.env.NIGHTSCOUT_TOKEN),
    authStrategy: 'Nightscout subject token → temporary JWT (API v3), with v1 fallback',
    historyTargetDays: HISTORY_DAYS,
    timelineHours: TIMELINE_HOURS,
    richEvents: true,
    readOnly: true,
    writesExposed: false
  });

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`GlucyZen MVP v${VERSION} running on http://localhost:${PORT}`);
  if (process.env.NIGHTSCOUT_URL) {
    console.log('LIVE MODE: Nightscout bridge enabled (read-only).');
    console.log(process.env.NIGHTSCOUT_TOKEN ? 'Readable access token configured.' : 'No token configured.');
    console.log('v0.10: rich Nightscout treatment events + detailed tooltips.');
    console.log('Demo fallback is DISABLED in live mode.');
  } else console.log('DEMO MODE: no NIGHTSCOUT_URL configured.');
});