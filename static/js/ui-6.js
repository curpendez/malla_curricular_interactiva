
/* Ruta Académica — lógica principal */
(() => {
  'use strict';

  const UAM_CATALOG = Object.freeze(JSON.parse(document.getElementById('uam-catalog-offline').textContent));
  const catalogById = (id) => UAM_CATALOG.find(p => p.id === id);
  const catalogForCareer = (c) => c && UAM_CATALOG.find(p => { const file = String(c.fileName || '').trim().toLowerCase().replace(/\(1\)(?=\.pdf$)/,''); const sourceFile = p.filename.toLowerCase().replace(/\(1\)(?=\.pdf$)/,''); return p.id === c.sourceCatalogId || (c.planCode && p.planCode === c.planCode) || (file && file === sourceFile); });
  const INDUSTRIAL_PLAN = '25-LTEC01';
  const industrialCatalog = UAM_CATALOG.find(plan => plan.planCode === INDUSTRIAL_PLAN);

  function industrialPlan(career) {
    if (!career || !industrialCatalog) return false;
    const code = String(career.planCode || '').trim().toUpperCase();
    return code ? code === INDUSTRIAL_PLAN : catalogForCareer(career)?.id === industrialCatalog.id;
  }

  function repairIndustrialRequirements(career) {
    if (!industrialPlan(career)) return;
    for (const course of career.courses || []) {
      const original = industrialCatalog.courses.find(row => row.key === course.key);
      if (!original || !original.prereqs.length) continue;
      const name = normalizeSharedCourseName(course.name);
      const withReqs = normalizeSharedCourseName([original.name, ...original.prereqs].join(' '));
      if (name !== withReqs) continue;
      course.name = original.name;
      course.prereqs = [...new Set([...(course.prereqs || []), ...original.prereqs])];
    }
  }

  function electiveOptionsFor(course, career) {
    if (!course) return [];
    if (Array.isArray(course.electiveOptions)) return course.electiveOptions;
    if (!industrialPlan(career)) return [];
    return industrialCatalog.courses.find(x=>x.key===course.key)?.electiveOptions || [];
  }

  function electiveChoiceFor(course, career) {
    return electiveOptionsFor(course,career).find(option=>option.code===course.electiveChoice);
  }

  function displayCourseName(course, career) {
    return electiveChoiceFor(course,career)?.name || course.name;
  }

  function electiveControl(course, career, ci) {
    const options = electiveOptionsFor(course,career);
    if (!options.length) return '';
    const chosen = electiveChoiceFor(course,career);
    return `<label class="course-elective-option">
      <span>${chosen ? 'Electiva seleccionada' : 'Elige una asignatura'}</span>
      <select data-elective-key="${esc(course.key)}" data-c="${ci}" aria-label="Asignatura para ${esc(course.name)}">
        <option value="">Sin selección</option>
        ${options.map(option=>`<option value="${esc(option.code)}" ${chosen?.code===option.code?'selected':''}>${esc(option.name)} · ${esc(option.code)}</option>`).join('')}
      </select>
    </label>`;
  }

  function chooseElective(ci, key, code) {
    const career = state.careers[ci];
    const course = career?.courses.find(x=>x.key===key);
    const options = electiveOptionsFor(course,career);
    const previous = electiveChoiceFor(course,career);
    if (!options.length || (code && !options.some(option=>option.code===code))) return false;
    if ((previous?.code || '') === code) return true;

    if (previous) {
      const record = careerRecord(ci);
      const hasProgress = record.taken[key] || record.history[key] ||
        record.grades[key]?.some(note=>note != null && note !== '') ||
        rawCurrentCourseKeys(ci).includes(key);
      if (hasProgress && !confirm('¿Cambiar la asignatura elegida? Las notas y el avance registrados seguirán asociados a este espacio de la malla.')) return false;
    }
    if (code) course.electiveChoice = code;
    else delete course.electiveChoice;
    save();
    return true;
  }

  async function readBundledIndustrial(file) {
    if (!industrialCatalog?.pdf) return null;
    const encoded = industrialCatalog.pdf;
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    if (file.size !== encoded.length * 3 / 4 - padding) return null;
    const source = atob(encoded);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== source.length || !bytes.every((byte,i)=>byte===source.charCodeAt(i))) return null;
    return {
      title:industrialCatalog.name, planCode:industrialCatalog.planCode,
      courses:industrialCatalog.courses, strict:true, warnings:[],
      format:'uam-table-strict-offline'
    };
  }

  const STORE = 'rutaAcademica.v3.local';
  /* Migración automática desde la versión con login para no perder progreso. */
  try {
    if (!localStorage.getItem(STORE)) {
      let cif = String(sessionStorage.getItem('rutaAcademica.session.cif') || '').trim().toUpperCase();
      if (!cif) {
        try { const users = JSON.parse(localStorage.getItem('rutaAcademica.auth.v1') || '{}') || {}; const keys = Object.keys(users); if (keys.length === 1) cif = String(keys[0]).trim().toUpperCase(); } catch {}
      }
      const sources = [];
      if (cif) sources.push('rutaAcademica.v3.' + encodeURIComponent(cif));
      sources.push('rutaAcademica.guest', 'rutaAcademica.v2', 'rutaAcademica.v1');
      for (const key of sources) { const legacy = localStorage.getItem(key); if (legacy) { localStorage.setItem(STORE, legacy); break; } }
    }
  } catch {}
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const keyOf = code => String(code).toUpperCase().replace(/[\s\-._]/g, '');
  const fmtCode = k => k.replace(/^([A-Z]+)(\d)/, '$1-$2');

  /* ---------------- Íconos ---------------- */
  const P = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    factory: '<path d="M3 21V9l6 4V9l6 4V7h5l1 14H3Zm4-4h1m4 0h1m4 0h1M16 7V3h3l1 4"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 1h4"/>',
    briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13h18m-9 0v2"/>',
    calculator: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8.5 7h7m-7 5h1m5 0h1m-7 4h1m5 0h1"/>',
    trend: '<path d="M3 4v16h18M6 15l5-5 4 3 5-6m-5 0h5v5"/>',
    cargo: '<path d="m3 14 2 5h13l3-5H3Zm3 0V7h12v7m-8-7v7m4-7v7m-7-7V4h10v3"/>',
    bridge: '<path d="M3 17h18M5 21V5m14 16V5M5 8c4 7 10 7 14 0M9 12v5m6-5v5"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    book: '<path d="M12 6c-2.8-2-5.8-2.3-9-1v13c3.2-1.3 6.2-1 9 1 2.8-2 5.8-2.3 9-1V5c-3.2-1.3-6.2-1-9 1v13"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    'arrow-right': '<path d="m9 6 6 6-6 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.2"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    grade: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    sheet: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M11 10v10"/>',
    notebook: '<path d="M4 3h15a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v18M11 8h7M11 12h7M11 16h5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    alert: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'
  };
  const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

  /* ---------------- Estado ---------------- */
  const defaults = () => ({
    careers: [null, null],
    taken: {},
    grades: {}, // campo compatible con respaldos anteriores
    careerRecords: [null, null], // libretas y aprobaciones independientes por plan
    events: [], // [{ id, career, planId, semester, key, title, day, start, end, room, color }]
    scheduleCareer: null,
    currentCoursesByPlan: {},
    active: 0,
    view: 'inicio',
    filter: 'all',
    reqScope: 'pending',
    passGrade: 70,
    autoApprove: true,
    honorScale: 'official2023',
    includeCnvCra: false,
    tasks: [],
    studyLog: [],
    studyDailyGoal: 60,
    studyFocusNote: '',
    studySelection: { career: '', semester: '', course: '' },
    academicExtras: { exams: [], notes: [], goals: [] }
  });

  const load = () => {
    try {
      const own = localStorage.getItem(STORE);
      return own ? (JSON.parse(own) || {}) : {};
    } catch { return {}; }
  };

  let state = Object.assign(defaults(), load());
  if (!Array.isArray(state.careers) || state.careers.length !== 2) state.careers = [null, null];
  if (!state.grades || typeof state.grades !== 'object') state.grades = {};
  if (!state.taken || typeof state.taken !== 'object') state.taken = {};
  const legacyGradesAtLoad = state.grades;
  const legacyTakenAtLoad = state.taken;
  const needLegacyMigration = !Array.isArray(state.careerRecords) || state.careerRecords.length !== 2 || !state.careerRecords.some(Boolean);
  if (!Array.isArray(state.careerRecords) || state.careerRecords.length !== 2) state.careerRecords = [null, null];
  if (!Array.isArray(state.events)) state.events = [];
  if(!state.currentCoursesByPlan || typeof state.currentCoursesByPlan!=='object' || Array.isArray(state.currentCoursesByPlan)) state.currentCoursesByPlan={};
  if(![0,1].includes(Number(state.scheduleCareer)) || state.scheduleCareer===null) state.scheduleCareer=null; else state.scheduleCareer=Number(state.scheduleCareer);
  if (!Array.isArray(state.tasks)) state.tasks = [];
  if (!Array.isArray(state.studyLog)) state.studyLog = [];
  state.studyDailyGoal = Math.max(15, Number(state.studyDailyGoal) || 60);
  if (!state.studySelection || typeof state.studySelection !== 'object') state.studySelection = { career: '', semester: '', course: '' };
  for (const field of ['career','semester','course']) state.studySelection[field] = String(state.studySelection[field] ?? '');
  if (!state.academicExtras || typeof state.academicExtras !== 'object') state.academicExtras = { exams: [], notes: [], goals: [] };
  for (const kind of ['exams','notes','goals']) if (!Array.isArray(state.academicExtras[kind])) state.academicExtras[kind]=[];
  // Política académica fija: 70+ aprobado, 60-69 convocatoria, 0-59 reprobado.
  state.passGrade = 70;
   if (!['official2023','alternative'].includes(state.honorScale)) state.honorScale = 'official2023';
   state.includeCnvCra = state.includeCnvCra === true;
  if (!['inicio','plan','notas','horario','recom','req','shared','prog','estudio','mapa','graduacion','riesgos','perfil'].includes(state.view)) state.view = state.careers.some(Boolean) ? 'plan' : 'inicio';

  const collapsedKey='rutaAcademica.sidebar.collapsed.v1';
  try { if (localStorage.getItem(collapsedKey)==='1') document.body.classList.add('sidebar-collapsed'); } catch {}
  const ui = {
    scheduleDay: ((new Date().getDay()+6)%7 < 6 ? (new Date().getDay()+6)%7 : 0),
    search: '',
    gradeSearch: '',
    sharedSearch: '',
    sharedFilter: 'all',
    riskFilter: '',
    gradeSem: 'all',
    editMode: false,
    loading: [false, false],
    pendingNames: ['', ''],
    taskFilter: 'pending',
    recentUnlocks: [],
    unlockSource: null,
    reqMapSelected: null,
    notebookQuery: '',
    goalFilter: 'all',
    recommendationParity: null,
    recommendationCareer: null,
    historyImport: null,
    evManageSem: ''
  };

  const studyTimer = { total: 25 * 60, left: 25 * 60, running: false, course: state.studySelection.course || '', context: null, endsAt: 0 };
  let studyTimerInterval = null;

  function save() {
    const { careers, taken, grades, careerRecords, events, scheduleCareer, currentCoursesByPlan, active, view, filter, reqScope, passGrade, autoApprove, honorScale, includeCnvCra, tasks, studyLog, studyDailyGoal, studySelection, academicExtras } = state;
    try {
      localStorage.setItem(STORE, JSON.stringify({ careers, taken, grades, careerRecords, events, scheduleCareer, currentCoursesByPlan, active, view, filter, reqScope, passGrade, autoApprove, honorScale, includeCnvCra, tasks, studyLog, studyDailyGoal, studySelection, academicExtras }));
      window.RutaBackend?.sync({ careers, taken, grades, careerRecords, events, scheduleCareer, currentCoursesByPlan, active, view, filter, reqScope, passGrade, autoApprove, honorScale, includeCnvCra, tasks, studyLog, studyDailyGoal, studySelection, academicExtras });
      return true;
    } catch { return false; }
  }

  /* ---------------- Utilidades de dominio ---------------- */
  const list = () => state.careers.map((c, i) => c && { c, i }).filter(Boolean);
  const activeIdx = () => state.careers[state.active] ? state.active : Math.max(0, state.careers.findIndex(Boolean));
  const cur = () => state.careers[activeIdx()];
  // Cada espacio conserva su propia libreta. El identificador evita que un plan
  // nuevo herede por accidente las notas de otro plan reemplazado.
  const planIdentity = (c, ci) => c ? String(c.recordIdentity || c.sourceCatalogId || c.planCode || c.fileName || ('personal-'+ci)) : '';
  function careerRecord(ci = activeIdx()) {
    const i = ci === 1 ? 1 : 0;
    const id = planIdentity(state.careers[i], i);
    let record = state.careerRecords[i];
    if (!record || record.identity !== id) {
      record = { identity: id, grades: {}, taken: {}, history: {}, unmappedHistory: [] };
      state.careerRecords[i] = record;
    }
    if (!record.history || typeof record.history !== 'object') record.history = {};
    return record;
  }
  function syncCareerData() {
    const record = careerRecord(activeIdx());
    state.grades = record.grades;
    state.taken = record.taken;
  }
  // Los respaldos antiguos guardaban una sola libreta. Se conserva íntegra en
  // la carrera que estaba seleccionada, sin copiar sus notas a la otra.
  if (needLegacyMigration) {
    const record = careerRecord(activeIdx());
    record.grades = legacyGradesAtLoad;
    record.taken = legacyTakenAtLoad;
  }
  syncCareerData();

  const mapOf = c => new Map(c.courses.map(x => [x.key, x]));
  const normalizeSharedCourseName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  state.careers.forEach(repairIndustrialRequirements);

  function equivalentCourseRefs(key, ci = activeIdx(), { uniqueName = false } = {}) {
    let sourceCi = Number(ci), source = state.careers[sourceCi]?.courses?.find(x => x.key === key);
    if (!source) {
      sourceCi = state.careers.findIndex(c => c?.courses?.some(x => x.key === key));
      source = sourceCi >= 0 ? state.careers[sourceCi].courses.find(x => x.key === key) : null;
    }
    if (!source) return [];
    const refs = [{ ci: sourceCi, course: source }];
    const normalized = normalizeSharedCourseName(source.name);
    for (let otherCi = 0; otherCi < state.careers.length; otherCi++) {
      if (otherCi === sourceCi) continue;
      const courses = state.careers[otherCi]?.courses || [];
      const sourcePlan = state.careers[sourceCi], otherPlan = state.careers[otherCi];
      if (electiveOptionsFor(source,sourcePlan).length) continue;
      const comparable = courses.filter(x => !electiveOptionsFor(x,otherPlan).length);
      const byCode = comparable.find(x => x.key === source.key);
      const byName = normalized ? comparable.filter(x => normalizeSharedCourseName(x.name) === normalized) : [];
      const byPreferredName = uniqueName ? (byName.length === 1 ? byName[0] : null)
        : byName.find(x => Number(x.semester) === Number(source.semester)) || byName[0];
      const match = byCode || byPreferredName;
      if (match) refs.push({ ci: otherCi, course: match });
    }
    return refs;
  }
  function isTaken(k, ci = activeIdx()) {
    if (careerRecord(ci).taken[k]) return true;
    return equivalentCourseRefs(k, ci).some(ref => ref.ci !== ci && !!careerRecord(ref.ci).taken[ref.course.key]);
  }
  function setTakenAcrossPlans(key, value, ci = activeIdx()) {
    const refs = equivalentCourseRefs(key, ci);
    const targets = refs.length ? refs : [{ ci, course: { key } }];
    targets.forEach(ref => {
      const taken = careerRecord(ref.ci).taken;
      if (value) {
        taken[ref.course.key] = true;
        const planId = planIdentity(state.careers[ref.ci], ref.ci) + '::' + ref.ci;
        const current = state.currentCoursesByPlan?.[planId];
        if (Array.isArray(current)) state.currentCoursesByPlan[planId] = current.filter(k => k !== ref.course.key);
      } else delete taken[ref.course.key];
    });
  }
  // Python calcula la disponibilidad y el servidor devuelve una proyección cacheada.
  // Se conserva una evaluación de respaldo durante la carga inicial o sin conexión.
  const statusOf = (x, ci = activeIdx()) => {
    const cached = window.RutaBackend?.status(ci, x.key);
    return cached || (isTaken(x.key, ci) ? 'taken' : ((x.prereqs || []).every(k => isTaken(k, ci)) ? 'available' : 'blocked'));
  };
  const semCount = c => Number(c?.semesterCount) > 0 ? Number(c.semesterCount) : Math.max(10, ...c.courses.map(x => x.semester || 1));
  const unlocks = (key, c) => c.courses.filter(x => x.prereqs.includes(key));
  const cr = x => Number(x.credits) || 0;

  function availableSet(c) {
    return new Set((c?.courses || []).filter(x => statusOf(x, Math.max(0,state.careers.indexOf(c))) === 'available').map(x => x.key));
  }

  function newlyUnlocked(c, beforeAvailable, sourceKeys = []) {
    const sources = new Set(sourceKeys);
    return (c?.courses || []).filter(x =>
      x.prereqs.length &&
      !beforeAvailable.has(x.key) &&
      statusOf(x, Math.max(0,state.careers.indexOf(c))) === 'available' &&
      (!sources.size || x.prereqs.some(k => sources.has(k)))
    );
  }

  function findCourse(key, prefer) {
    if (!key) return null;
    if (prefer) { const x = prefer.courses.find(y => y.key === key); if (x) return x; }
    for (const c of state.careers) if (c) { const x = c.courses.find(y => y.key === key); if (x) return x; }
    return null;
  }
  const codeOf = key => (findCourse(key) || {}).code || fmtCode(key);
  const nameOf = key => (findCourse(key) || {}).name || 'Fuera del plan';

  function sharedCoursePairs() {
    const [a, b] = state.careers;
    if (!a || !b) return [];
    return a.courses.flatMap(x => {
      const match = equivalentCourseRefs(x.key, 0).find(ref => ref.ci === 1);
      return match ? [[x, match.course]] : [];
    });
  }

  function sharedKeys() {
    return new Set(sharedCoursePairs().flatMap(pair => pair.map(course => course.key)));
  }

  /** Cadena de requisitos pendientes */
  function chain(x, c) {
    const map = mapOf(c);
    const seen = new Set(), all = [], roots = [];
    const visit = k => {
      if (seen.has(k) || isTaken(k, Math.max(0,state.careers.indexOf(c)))) return;
      seen.add(k);
      const y = map.get(k) || findCourse(k) || { key: k, code: fmtCode(k), name: 'Fuera del plan', semester: 0, prereqs: [] };
      all.push(y);
      const pend = y.prereqs.filter(p => !isTaken(p, Math.max(0,state.careers.indexOf(c))));
      if (!pend.length) roots.push(y);
      pend.forEach(visit);
    };
    x.prereqs.forEach(visit);
    const bySem = (a, b) => (a.semester || 0) - (b.semester || 0);
    return { all: all.sort(bySem), roots: roots.sort(bySem) };
  }

  function stats(c) {
    const s = { total: c.courses.length, taken: 0, available: 0, blocked: 0, credits: 0, creditsTaken: 0 };
    const ci = Math.max(0, state.careers.indexOf(c));
    c.courses.forEach(x => { s[statusOf(x, ci)]++; s.credits += cr(x); if (isTaken(x.key, ci)) s.creditsTaken += cr(x); });
    s.pct = s.total ? s.taken / s.total : 0;
    return s;
  }

  /* ---------------- Lógica de Notas (Promedio 100/3) ---------------- */
  const PASS_GRADE = 70;
  const CONVOCATORIA_MIN = 60;
  function getGradeInfo(key, ci = activeIdx()) {
    const serverGrade = window.RutaBackend?.grade(ci, key);
    if (serverGrade) return serverGrade;
    const raw = careerRecord(ci).grades[key] || [null, null, null];
    const p = [
      raw[0] !== null && raw[0] !== undefined && raw[0] !== '' ? Number(raw[0]) : null,
      raw[1] !== null && raw[1] !== undefined && raw[1] !== '' ? Number(raw[1]) : null,
      raw[2] !== null && raw[2] !== undefined && raw[2] !== '' ? Number(raw[2]) : null
    ];
    const filled = p.filter(n => n !== null);
    const count = filled.length;
    const sum = filled.reduce((a, b) => a + b, 0);
    const pass = PASS_GRADE;
    const convocatoriaMin = CONVOCATORIA_MIN;

    // Promedio oficial: (P1 + P2 + P3) / 3
    // 70-100: aprobada · 60-69.9: convocatoria · 0-59.9: reprobada.
    let avg = null;
    let status = 'none'; // 'passed', 'convocatoria', 'failed', 'progress', 'none'
    let needed = null;
    let neededConvocatoria = null;

    if (count === 3) {
      avg = Math.round((sum / 3) * 10) / 10;
      status = avg >= pass ? 'passed' : (avg >= convocatoriaMin ? 'convocatoria' : 'failed');
    } else if (count > 0) {
      avg = Math.round((sum / 3) * 10) / 10;
      const remaining = 3 - count;
      needed = Math.max(0, Math.ceil(((pass * 3) - sum) / remaining));
      neededConvocatoria = Math.max(0, Math.ceil(((convocatoriaMin * 3) - sum) / remaining));
      status = 'progress';
    }

    const historical = careerRecord(ci).history[key] || null;
    const useHistorical = count < 3 && historical && Number.isFinite(Number(historical.grade)) && historical.grade !== null;
    if (useHistorical) {
      avg = Number(historical.grade);
      status = avg >= pass ? 'passed' : (avg >= convocatoriaMin ? 'convocatoria' : 'failed');
    }
    return { p, count, sum, avg, status, needed, neededConvocatoria, pass, convocatoriaMin,
      isFinal: count === 3 || !!useHistorical, fromHistory: !!useHistorical, history: historical };

  }

  const roundGrade = value => Math.round(value * 10) / 10;
  const gradeNumber = new Intl.NumberFormat('es-NI', {maximumFractionDigits:1});

  function projectedFinal(grade, assumed = grade.sum / grade.count) {
    return roundGrade((grade.sum + assumed * (3 - grade.count)) / 3);
  }

  function historicalGradeBaseline(ci) {
    const record = careerRecord(ci);
    const entries = [...Object.values(record.history), ...(record.unmappedHistory || [])];
    let credits = 0;
    let weighted = 0;
    for (const entry of entries) {
      const units = Number(entry.credits), grade = Number(entry.grade);
      if (entry.grade == null || entry.grade === '' || !Number.isFinite(grade) || grade < 0 || grade > 100 ||
          !Number.isFinite(units) || units <= 0) continue;
      credits += units;
      weighted += grade * units;
    }
    return credits ? roundGrade(weighted / credits) : null;
  }

  function usesHistoricalEstimate(grade) {
    return !grade.isFinal && !grade.count && ['CA', 'COG'].includes(grade.history?.condition);
  }

  function gradeResultMarkup(grade, ci = activeIdx(), baseline = undefined) {
    if (grade.isFinal) {
      return `<div class="avg-box ${grade.status}"><b>${gradeNumber.format(grade.avg)}%</b><small>${grade.fromHistory ? 'Nota final · PDF' : 'Nota final'}</small></div>`;
    }
    if (grade.count) {
      return `<div class="avg-box progress"><b>≈ ${gradeNumber.format(projectedFinal(grade))}%</b><small>Estimación · ${grade.count}/3 parciales</small></div>`;
    }
    if (usesHistoricalEstimate(grade)) {
      const reference = baseline === undefined ? historicalGradeBaseline(ci) : baseline;
      if (reference !== null) {
        return `<div class="avg-box progress"><b>≈ ${gradeNumber.format(reference)}%</b><small>Estimación · historial PDF</small></div>`;
      }
    }
    return '<span class="none">—</span>';
  }

  function gradeStatusMarkup(grade) {
    const finalLabels = {
      passed: ['st-taken', 'check', 'Aprobada'],
      convocatoria: ['st-convocatoria', 'clock', 'Convocatoria'],
      failed: ['st-blocked', 'x', 'Reprobada']
    };
    if (grade.isFinal) {
      const [style, icon, label] = finalLabels[grade.status];
      return `<span class="badge ${style}">${ic(grade.fromHistory ? 'file' : icon)}${grade.history?.condition === 'CNV' && grade.fromHistory ? 'CNV · ' : ''}${label}${grade.fromHistory ? ' · PDF' : ''}</span>`;
    }
    if (grade.count) {
      const text = grade.needed > 100 ? 'No alcanza para 70' : grade.needed === 0 ? '70 puntos asegurados' :
        grade.count === 2 ? `Necesitas ${grade.needed} en el parcial pendiente` : `Necesitas promediar ${grade.needed} en los pendientes`;
      return `<span class="grade-estimate-target">${text}</span>`;
    }
    return grade.history ? `<span class="badge st-available">${ic('file')}${esc(grade.history.condition)} · sin nota</span>` :
      '<span class="none">Sin notas registradas</span>';
  }

  function setGrade(key, index, value, ci = activeIdx()) {
    const grades = careerRecord(ci).grades;
    if (!grades[key]) grades[key] = [null, null, null];
    const val = value.trim() === '' ? null : Math.min(100, Math.max(0, Number(value)));
    grades[key][index] = val;

    const info = getGradeInfo(key, ci);
    if (state.autoApprove && info.count === 3) {
      setTakenAcrossPlans(key, info.status === 'passed', ci);
    }
    save();
    renderShell();
    // Actualiza el CRA visible sin reemplazar los campos de parciales activos.
    if (state.view === 'notas' && cur()) {
      const panel = document.querySelector('#view .honors-panel');
      if (panel) panel.outerHTML = honorsPanel(cur());
    }
    return info;
  }

  function recheckAllGrades() {
    if (!state.autoApprove) return;
    Object.keys(state.grades).forEach(key => {
      const info = getGradeInfo(key);
      if (info.count === 3) {
        setTakenAcrossPlans(key, info.status === 'passed', activeIdx());
      }
    });
    save();
  }

  /* ---------------- Toasts & modal ---------------- */
  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `${ic(type === 'err' ? 'info' : 'check')}<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, 3200);
  }
  function openModal(html, wide = false) {
    $('#modalCard').className = 'modal-card' + (wide ? ' wide' : '');
    $('#modalCard').innerHTML = html;
    $('#modal').classList.remove('hidden');
    requestAnimationFrame(() => $('#modal').classList.add('in'));
  }
  function closeModal() {
    $('#modal').classList.remove('in');
    setTimeout(() => $('#modal').classList.add('hidden'), 180);
  }
  const modalHead = (title, sub = '') => `<div class="m-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="icon-btn" data-action="close" aria-label="Cerrar">${ic('x')}</button></div>`;

  /* ---------------- Componentes ---------------- */
  const statusLabel = { taken: 'Aprobada', available: 'Disponible', blocked: 'Bloqueada' };
  const badge = st => `<span class="badge st-${st}">${ic(st === 'taken' ? 'check' : st === 'blocked' ? 'lock' : 'unlock')}${statusLabel[st]}</span>`;

  function chip(key, opts = {}) {
    const ci=Number.isInteger(opts.ci)?opts.ci:activeIdx(),course=findCourse(key,state.careers[ci]),taken=isTaken(key,ci);
    const name=course?.name||`Requisito no identificado (${codeOf(key)})`;
    const cls=`chip ${taken?'ok':'pend'} ${opts.strong?'strong':''}`;
    if(!course)return `<span class="${cls} unresolved" title="Este requisito no está identificado en los planes cargados">${esc(name)}</span>`;
    return `<button type="button" class="${cls}" data-action="open" data-key="${esc(key)}" data-c="${ci}" title="${esc(course.code||'')} · ${esc(name)}" aria-label="Abrir materia: ${esc(name)}">${taken?ic('check'):''}<span class="chip-name">${esc(name)}</span></button>`;
  }

  function pendingRequirementRoutes(target, c, limit=12) {
    const ci=Math.max(0,state.careers.indexOf(c)),byKey=mapOf(c),routes=[];
    const walk=(course,tail,seen)=>{
      if(routes.length>=limit||seen.has(course.key))return;
      const nextSeen=new Set(seen);nextSeen.add(course.key);
      const pending=[...new Set(course.prereqs||[])].filter(k=>!isTaken(k,ci));
      if(!pending.length){if(tail.length)routes.push([course,...tail]);return;}
      pending.forEach(k=>{
        const prior=byKey.get(k)||findCourse(k,c)||{key:k,name:`Requisito no identificado (${codeOf(k)})`,prereqs:[]};
        walk(prior,[course,...tail],nextSeen);
      });
    };
    walk(target,[],new Set());return routes;
  }

  const careerIcons = {
    '23-LPOL01': 'globe', '25-LTEC01': 'factory', '25-LTEC03': 'database',
    '26-LTEC05': 'terminal', '24-LECO01': 'briefcase', '24-LECO11': 'calculator',
    '24-LECO10': 'trend', '24-LECO15': 'cargo', '26-LEC015': 'cargo',
    '26-LTEC15': 'bridge', 'CIVIL-ANTERIOR': 'bridge'
  };
  const careerFields = [
    [/diplomacia|relaciones internacionales/, 'globe'], [/industrial/, 'factory'],
    [/sistemas de informacion/, 'database'], [/sistemas|software|informatica|computacion/, 'terminal'],
    [/administracion|gestion empresarial/, 'briefcase'], [/contabilidad|finanzas/, 'calculator'],
    [/economia/, 'trend'], [/comercio|negocios internacionales/, 'cargo'],
    [/civil|construccion|arquitectura/, 'bridge'], [/derecho/, 'grade'], [/medicina|enfermeria|salud/, 'plus'],
    [/educacion|docencia|letras/, 'notebook']
  ];
  function careerIcon(c) {
    const code = (catalogForCareer(c)?.planCode || c.planCode || '').toUpperCase();
    const name = String(c.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const symbol = (Object.prototype.hasOwnProperty.call(careerIcons, code) && careerIcons[code]) || careerFields.find(([pattern]) => pattern.test(name))?.[1] || 'cap';
    return '<span class="route-career-icon" data-symbol="' + symbol + '" aria-hidden="true">' + ic(symbol) + '</span>';
  }

  function careerSwitch() {
    const cs = list();
    if (cs.length < 2) return cs.length ? `<div class="career-pill route-career-line">${careerIcon(cs[0].c)}<span>${esc(cs[0].c.name)}</span></div>` : '';
    const a = activeIdx();
    return `<div class="seg route-careers" role="group" aria-label="Carrera activa">${cs.map(({ c, i }) => `<button class="route-career-line ${i === a ? 'on' : ''}" type="button" data-action="career" data-i="${i}" aria-pressed="${i === a}">${careerIcon(c)}<span>${esc(c.name)}</span></button>`).join('')}</div>`;
  }

  function ring(p, size = 132, stroke = 12) {
    const r = (size - stroke) / 2, C = 2 * Math.PI * r;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(p * 100)}% completado">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" opacity="${p > 0 ? 1 : 0}" stroke-width="${stroke}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="50%" dy=".36em" text-anchor="middle">${Math.round(p * 100)}%</text></svg>`;
  }

  function emptyState(title, text, btn = true) {
    return `<div class="empty">
      <div class="empty-ic">${ic('layers')}</div>
      <h3>${title}</h3><p>${text}</p>
      ${btn ? `<div class="row-gap"><button class="btn primary" data-action="nav" data-view="inicio">${ic('upload')}Cargar plan académico</button>
      <button class="btn ghost" data-action="demo">Probar con ejemplo</button></div>` : ''}
    </div>`;
  }

  /* ---------------- Inteligencia académica ---------------- */
  function graduationReport(c, ci) {
    const byKey = mapOf(c);
    const inProgress = new Set(currentCourseKeys(ci));
    const approved = new Map();
    const isApproved = key => {
      if (!approved.has(key)) approved.set(key, isTaken(key, ci));
      return approved.get(key);
    };
    const terms = new Map(), blockers = new Map(), statusByKey = new Map();
    const groups = { taken:[], current:[], available:[], blocked:[] };
    const knownCredits = { pending:0, missing:0 };

    function requirements(course) {
      const result = new Map();
      const add = (key, kind) => {
        if (isApproved(key)) return;
        const existing = result.get(key);
        if (!existing || kind === 'prereq') result.set(key, kind);
      };
      for (const key of course.prereqs || []) add(key, 'prereq');
      const seen = new Set([course.key]), queue = [...(course.coreqs || [])], concurrent = new Set();
      for (let i = 0; i < queue.length; i++) {
        const key = queue[i];
        if (seen.has(key) || isApproved(key)) continue;
        seen.add(key);
        const required = byKey.get(key);
        if (!required) {
          add(key, 'coreq');
          continue;
        }
        concurrent.add(key);
        for (const prereq of required.prereqs || []) add(prereq, 'via-coreq');
        queue.push(...(required.coreqs || []));
      }
      return { blocking:[...result].map(([key,kind])=>({key,kind})), concurrent:[...concurrent] };
    }

    for (const course of c.courses) {
      const sem = Math.max(1, Number(course.semester) || 1);
      if (!terms.has(sem)) terms.set(sem, { taken:0, current:0, available:0, blocked:0 });
      let status = 'taken', requirementsInfo = { blocking:[], concurrent:[] };
      if (!isApproved(course.key)) {
        const credit = Number(course.credits);
        if (credit > 0) knownCredits.pending += credit;
        else knownCredits.missing++;
        requirementsInfo = requirements(course);
        status = inProgress.has(course.key) ? 'current' : requirementsInfo.blocking.length ? 'blocked' : 'available';
      }
      const item = { course, ...requirementsInfo };
      groups[status].push(item);
      statusByKey.set(course.key, status);
      terms.get(sem)[status]++;
      if (status === 'blocked') {
        for (const {key} of item.blocking) {
          if (!blockers.has(key)) blockers.set(key, {key,count:0});
          blockers.get(key).count++;
        }
      }
    }
    return {
      byKey, groups, knownCredits, statusByKey, inProgress,
      terms: [...terms].sort(([a],[b]) => a - b),
      blockers: [...blockers.values()].sort((a,b) => b.count-a.count || a.key.localeCompare(b.key, 'es'))
    };
  }

  function viewGraduation() {
    const c = cur(), ci = activeIdx();
    if (!c?.courses.length) return emptyState('Aún no hay una malla cargada', 'Carga tu plan para consultar las materias pendientes y sus requisitos.');
    const { byKey, groups, terms, blockers, knownCredits, statusByKey, inProgress } = graduationReport(c, ci);
    const status = [
      ['taken','Aprobadas'],
      ['current','Cursando'],
      ['available','Disponibles'],
      ['blocked','Bloqueadas']
    ];
    const total = c.courses.length;
    const pending = total - groups.taken.length;
    const pct = Math.round(100 * groups.taken.length / total);
    const classCount = n => n + (n === 1 ? ' materia' : ' materias');
    const formatNumber = new Intl.NumberFormat('es', {maximumFractionDigits:2});
    const creditCount = formatNumber.format(knownCredits.pending);
    const creditsLabel = knownCredits.missing ? 'Créditos pendientes registrados' : 'Créditos pendientes';
    const creditValue = knownCredits.missing ? (knownCredits.pending ? creditCount + '+' : '—') : creditCount;
    const creditsNote = knownCredits.missing ? classCount(knownCredits.missing) + ' sin créditos registrados' : '';
    const legend = status.map(([key,label])=>`<li><i class="grad-swatch is-${key}" aria-hidden="true"></i><span>${label}</span><b>${groups[key].length}</b></li>`).join('');
    const chartLabel = (counts) => status.map(([key,label])=>`${label}: ${counts[key]}`).join(', ');
    let offset = 0;
    const segments = status.map(([key]) => {
      const share = 100 * groups[key].length / total;
      const start = offset;
      offset += share;
      return share > 0 ? `<circle r="49" cx="60" cy="60" pathLength="100" class="grad-slice is-${key}" stroke-dasharray="${share} ${100-share}" stroke-dashoffset="${-start}"/>` : '';
    }).join('');
    const counts = Object.fromEntries(status.map(([key])=>[key,groups[key].length]));
    const doughnut = `<div class="grad-donut" role="img" aria-label="${esc(chartLabel(counts))}">
      <svg viewBox="0 0 120 120" aria-hidden="true"><g transform="rotate(-90 60 60)">${segments}</g></svg>
      <div aria-hidden="true"><strong>${pct}%</strong><span>aprobado</span></div>
    </div>`;
    const maxTerm = Math.max(...terms.map(([,term]) => Object.values(term).reduce((a,b)=>a+b,0)));
    const bars = terms.map(([sem,term])=>{
      const remaining = term.current + term.available + term.blocked;
      const segments = status.filter(([key])=>term[key]).map(([key])=>`<i class="grad-bar-fill is-${key}" style="width:${100*term[key]/maxTerm}%"></i>`).join('');
      return `<li class="grad-sem-row"><b>Sem. ${sem}</b><div class="grad-chart-track" role="img" aria-label="${esc(chartLabel(term))}">${segments}</div><span>${remaining} de ${term.taken+remaining}</span></li>`;
    }).join('');
    const detailsTitle = (key, kind) => {
      const course = byKey.get(key);
      if (!course) return `${codeOf(key)} · Fuera de esta malla`;
      const context = inProgress.has(key) ? 'En curso' : kind === 'via-coreq' ? 'Prerrequisito de un correquisito' : '';
      return context ? `${course.name} · ${context}` : course.name;
    };
    const blockerRows = blockers.map(({key,count}) => {
      const course = byKey.get(key);
      const name = course?.name || codeOf(key);
      const blockerStatus = {current:'En curso', available:'Disponible', blocked:'También tiene requisitos pendientes'};
      const meta = [course?.code, course ? blockerStatus[statusByKey.get(key)] : 'Fuera de esta malla'].filter(Boolean).join(' · ');
      const info = `<span><b>${esc(name)}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span><strong>${classCount(count)}</strong>`;
      return `<li>${course ? `<button type="button" data-action="open" data-key="${esc(key)}" data-c="${ci}">${info}</button>` : `<div>${info}</div>`}</li>`;
    }).join('');
    function courseList(key, label, empty) {
      const items = groups[key];
      if (!items.length) return `<p class="grad-empty-note">${empty}</p>`;
      return `<details class="grad-detail"><summary><span>${label}</span><b>${items.length}</b>${ic('arrow-right')}</summary><ul>${items.map(({course,blocking,concurrent})=>{
        const notes = key === 'blocked'
          ? blocking.map(({key,kind}) => detailsTitle(key,kind))
          : concurrent.map(k=>`Cursa junto con ${byKey.get(k).name}`);
        return `<li><button type="button" data-action="open" data-key="${esc(course.key)}" data-c="${ci}"><span><b>${esc(displayCourseName(course,c))}</b><small>${esc(course.code || course.key)} · Sem. ${Number(course.semester)||1}</small></span>${ic('arrow-right')}</button>
        ${notes.length ? `<ul class="grad-course-conditions">${notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>` : ''}</li>`;
      }).join('')}</ul></details>`;
    }

    return `<div class="grad-dashboard">
      <div class="grad-dashboard-plan" aria-label="Plan de estudios">${careerSwitch()}</div>
      <section class="grad-dashboard-overview" aria-labelledby="gradOverviewTitle">
        <div class="grad-dashboard-total">
          <h2 id="gradOverviewTitle">Materias que te faltan</h2>
          <strong>${pending}</strong><p>${groups.taken.length} de ${total} materias aprobadas</p>
          <div class="grad-dashboard-credits"><b>${creditValue}</b><span>${creditsLabel}</span>${creditsNote ? `<small>${creditsNote}</small>` : ''}</div>
        </div>
        <figure class="grad-dashboard-distribution">${doughnut}<figcaption><h3>Estado de la malla</h3><ul>${legend}</ul></figcaption></figure>
      </section>
      <div class="grad-dashboard-columns">
        <section class="grad-card" aria-labelledby="gradSemesterTitle">
          <div class="grad-card-head"><h3 id="gradSemesterTitle">Avance por semestre</h3><span>Pendientes / total</span></div>
          <ol class="grad-sem-bars">${bars}</ol>
        </section>
        <section class="grad-card" aria-labelledby="gradBlockersTitle">
          <div class="grad-card-head"><h3 id="gradBlockersTitle">Qué te está deteniendo</h3>${blockers.length ? `<span>${classCount(groups.blocked.length)} bloqueada${groups.blocked.length === 1 ? '' : 's'}</span>` : ''}</div>
          ${blockers.length ? `<p>Requisitos pendientes, ordenados por cuántas materias bloquean.</p>
            <ol class="grad-blockers">${blockerRows}</ol>` : '<p>No tienes bloqueos por requisitos en esta malla.</p>'}
        </section>
      </div>
      <section class="grad-card grad-dashboard-requirements" aria-labelledby="gradRequirementsTitle">
        <div class="grad-card-head"><h3 id="gradRequirementsTitle">Qué necesitas completar</h3></div>
        ${pending ? courseList('available','Materias que puedes cursar','Por ahora no hay materias disponibles.') +
          (groups.current.length ? courseList('current','Materias en curso','') : '') +
          (groups.blocked.length ? courseList('blocked','Materias bloqueadas y sus requisitos','') : '') :
          '<p>Ya aprobaste todas las materias registradas en esta malla.</p>'}
      </section>
      <p class="grad-dashboard-scope">Datos de la malla cargada. Consulta con Registro Académico los requisitos de egreso que puedan aplicar fuera del plan.</p>
    </div>`;
  }

  function requirementRelations(c, selectedKey) {
    const byKey=new Map(c.courses.map(x=>[x.key,x])),children=new Map(c.courses.map(x=>[x.key,[]]));
    c.courses.forEach(x=>(x.prereqs||[]).forEach(pk=>{if(byKey.has(pk)&&pk!==x.key&&!children.get(pk).includes(x.key))children.get(pk).push(x.key)}));
    const ancestors=new Set(),descendants=new Set(),upSeen=new Set([selectedKey]),downSeen=new Set([selectedKey]);
    const up=k=>(byKey.get(k)?.prereqs||[]).forEach(pk=>{if(byKey.has(pk)&&!upSeen.has(pk)){upSeen.add(pk);ancestors.add(pk);up(pk)}});
    const down=k=>(children.get(k)||[]).forEach(ch=>{if(!downSeen.has(ch)){downSeen.add(ch);descendants.add(ch);down(ch)}});
    if(selectedKey&&byKey.has(selectedKey)){up(selectedKey);down(selectedKey)}
    return {byKey,children,ancestors,descendants};
  }
  function requirementMapEdges(c, selected, scope='all') {
    const known=new Set(c.courses.map(x=>x.key)),seen=new Set(),edges=[];
    c.courses.forEach(x=>(x.prereqs||[]).forEach(source=>{
      const id=source+'>'+x.key;
      if(!known.has(source)||source===x.key||seen.has(id))return;
      if(scope==='focus'&&source!==selected&&x.key!==selected)return;
      seen.add(id);edges.push({source,target:x.key});
    }));
    return edges;
  }
  function viewRequirementMap() {
    const c = cur(), ci=activeIdx();
    if (!c?.courses.length) return emptyState('Sin plan cargado', 'Carga tu plan para construir el mapa de requisitos.');
    const semesters = [...new Set(c.courses.map(x => x.semester || 1))].sort((a,b)=>a-b);
    const links = requirementMapEdges(c).length;
    const selected = c.courses.some(x=>x.key===ui.reqMapSelected) ? ui.reqMapSelected : null;
    if (ui.reqMapSelected && !selected) ui.reqMapSelected = null;
    const rel=requirementRelations(c,selected), sx=selected?rel.byKey.get(selected):null;
    const routeSet=new Set(selected?[selected,...rel.ancestors,...rel.descendants]:[]);
    const node = x => {
      const st=statusOf(x,ci), prereqs=[...new Set(x.prereqs||[])].filter(k=>k!==x.key), external=prereqs.filter(k=>!rel.byKey.has(k));
      const relationClass=!selected?'':x.key===selected?' map-selected':rel.ancestors.has(x.key)?' map-upstream':rel.descendants.has(x.key)?' map-downstream':' map-dimmed';
      const reqOk=prereqs.filter(k=>isTaken(k,ci)).length;
      return `<button class="req-node ${st}${relationClass}" data-req-node="${esc(x.key)}" data-action="req-map-select" data-key="${esc(x.key)}" aria-pressed="${x.key===selected?'true':'false'}"><span class="req-node-top"><span class="code">Semestre ${x.semester||1}</span><span class="req-node-status">${st==='taken'?'✓ Aprobada':st==='available'?'● Disponible':'○ Bloqueada'}</span></span><b>${esc(x.name)}</b><small>${cr(x)?cr(x)+' créditos':'Créditos sin especificar'}</small>${prereqs.length?`<div class="req-node-req">${reqOk}/${prereqs.length} requisito${prereqs.length===1?'':'s'} cumplido${reqOk===1?'':'s'}${external.length?` · ${external.length} externo${external.length===1?'':'s'}`:''}</div>`:'<div class="req-node-req no-req">Sin requisito previo</div>'}</button>`;
    };
    const reqButtons = sx ? [...new Set(sx.prereqs||[])].filter(k=>k!==sx.key).map(k=>{const p=rel.byKey.get(k);return p?`<button class="req-route-chip ${isTaken(k,ci)?'ok':'pending'}" data-action="req-map-select" data-key="${esc(k)}"><span>${isTaken(k,ci)?'✓':'!'}</span>${esc(p.name)}</button>`:`<span class="req-route-chip external"><span>↗</span>${esc(codeOf(k))} · externo</span>`;}).join('') : '';
    const childKeys = selected ? (rel.children.get(selected)||[]) : [];
    const childButtons = sx ? childKeys.map(k=>{const p=rel.byKey.get(k);return `<button class="req-route-chip next" data-action="req-map-select" data-key="${esc(k)}"><span>→</span>${esc(p?.name||nameOf(k))}</button>`;}).join('') : '';
    const focusPanel=sx?`<div class="req-focus-card"><div class="req-focus-main"><div class="req-focus-kicker">MATERIA SELECCIONADA</div><h3>${esc(sx.name)}</h3><p>${sx.semester||1}° semestre · ${statusOf(sx,ci)==='taken'?'Aprobada':statusOf(sx,ci)==='available'?'Disponible ahora':'Bloqueada por requisito'}</p></div><div class="req-focus-actions"><button class="btn ghost" data-action="req-map-clear">Ver mapa completo</button><button class="btn primary" data-action="open" data-key="${esc(sx.key)}" data-c="${ci}">Abrir materia</button></div><div class="req-focus-columns"><div><span class="req-focus-label">Necesita antes</span><div class="req-route-list">${reqButtons||'<span class="req-route-empty">No tiene prerrequisitos en esta malla.</span>'}</div></div><div><span class="req-focus-label">Desbloquea directamente</span><div class="req-route-list">${childButtons||'<span class="req-route-empty">No desbloquea otra materia directamente.</span>'}</div></div></div></div>`:`<div class="req-map-help"><div class="req-map-help-icon">${ic('route')}</div><div><b>Toca una materia para explorar su ruta</b><span>El mapa resaltará lo que debes aprobar antes y las materias que desbloquea después.</span></div></div>`;
    return `<div class="req-map-toolbar"><div class="req-map-careers">${careerSwitch()}</div><div class="req-map-toolbar-controls"><label class="req-map-picker"><span>Ir a una materia</span><select id="reqMapPicker"><option value="">Selecciona una materia…</option>${c.courses.map(x=>`<option value="${esc(x.key)}" ${x.key===selected?'selected':''}>${x.semester||1}° · ${esc(x.name)}</option>`).join('')}</select></label><div class="req-map-legend"><span><i class="req-map-dot taken"></i>Aprobada</span><span><i class="req-map-dot available"></i>Disponible</span><span><i class="req-map-dot blocked"></i>Bloqueada</span></div></div></div>${focusPanel}<div class="panel req-map-panel"><div class="panel-head"><div><h3>${ic('route')}Mapa por semestres</h3><p>${c.courses.length} materias · ${links} conexiones de tu plan. Desliza para recorrer los semestres.</p></div><div class="req-map-navigation"><button class="icon-btn" data-action="req-map-pan" data-direction="-1" aria-label="Ver semestres anteriores">‹</button><button class="icon-btn" data-action="req-map-pan" data-direction="1" aria-label="Ver semestres siguientes">›</button></div></div><div class="req-map-scroll" tabindex="0" role="region" aria-label="Malla de requisitos por semestres"><div class="req-map-canvas" id="reqMapCanvas"><svg class="req-map-svg" id="reqMapSvg" aria-hidden="true"></svg>${semesters.map(sem=>`<section class="req-map-sem"><div class="req-map-sem-head"><span>${sem}° semestre</span><small>${c.courses.filter(x=>(x.semester||1)===sem).length} materias</small></div>${c.courses.filter(x=>(x.semester||1)===sem).map(node).join('')}</section>`).join('')}</div></div><div class="note req-map-note">${ic('info')}<span>Toca cualquier materia para resaltar su ruta. Usa las flechas superiores o desliza el mapa para ver los demás semestres.</span></div></div>`;
  }

  function drawRequirementMap() {
    if(state.view!=='mapa')return;
    const canvas=$('#reqMapCanvas'),svg=$('#reqMapSvg'),c=cur(),ci=activeIdx();
    if(!canvas||!svg||!c)return;
    const nodes=new Map([...canvas.querySelectorAll('[data-req-node]')].map(el=>[el.dataset.reqNode,el]));
    const selected=nodes.has(ui.reqMapSelected)?ui.reqMapSelected:null,rel=requirementRelations(c,selected);
    const rect=canvas.getBoundingClientRect(),w=canvas.scrollWidth,h=canvas.scrollHeight;
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('width',w);svg.setAttribute('height',h);
    let paths=`<defs><marker id="reqArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z"></path></marker></defs>`;
    requirementMapEdges(c).forEach(({source,target})=>{
      const a=nodes.get(source),b=nodes.get(target);if(!a||!b)return;
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      const x1=ar.right-rect.left,y1=ar.top-rect.top+ar.height/2,x2=br.left-rect.left,y2=br.top-rect.top+br.height/2,bend=Math.max(28,Math.abs(x2-x1)*.45);
      const upstream=selected&&(target===selected||rel.ancestors.has(target))&&(source===selected||rel.ancestors.has(source));
      const downstream=selected&&(source===selected||rel.descendants.has(source))&&(target===selected||rel.descendants.has(target));
      const active=upstream||downstream,cls=selected?(active?'active':'muted'):'normal';
      paths+=`<path class="req-edge ${cls} ${upstream?'upstream':downstream?'downstream':''} ${isTaken(source,ci)?'done':''}" marker-end="url(#reqArrow)" d="M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2-6} ${y2}"></path>`;
    });
    svg.innerHTML=paths;
    if(selected){const el=nodes.get(selected),sc=canvas.closest('.req-map-scroll');if(el&&sc)sc.scrollTo({left:Math.max(0,el.getBoundingClientRect().left-rect.left-sc.clientWidth*.35),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
  }

  function openGradeSimulator(key = '', ci = activeIdx()) {
    const c = state.careers[ci];
    if (!c?.courses.length) return toast('Carga un plan con asignaturas primero','err');
    const selected = c.courses.find(x => x.key === key) ||
      c.courses.find(x => { const grade = getGradeInfo(x.key, ci); return grade.count && !grade.isFinal; }) ||
      c.courses.find(x => usesHistoricalEstimate(getGradeInfo(x.key, ci))) || c.courses[0];
    const options = [...c.courses].sort((a,b) => a.semester - b.semester || a.name.localeCompare(b.name,'es'))
      .map(x => `<option value="${esc(x.key)}"${x === selected ? ' selected' : ''}>${x.semester || 1}° · ${esc(displayCourseName(x,c))}</option>`).join('');
    openModal(`${modalHead('Simulador de nota final',esc(c.name))}
      <div class="m-body">
        <div class="grade-sim-controls">
          <label>Asignatura<select id="simCourse" data-c="${ci}">${options}</select></label>
          <label>Meta final<input type="number" id="simTarget" min="0" max="100" step="0.1" value="${PASS_GRADE}"></label>
          <label id="simFutureLabel">Nota en cada parcial pendiente<input type="number" id="simFuture" min="0" max="100" step="0.1"></label>
        </div>
        <div id="gradeSimResult" aria-live="polite"></div>
      </div>
      <div class="m-foot"><button class="btn ghost" data-action="close">Cerrar</button><button class="btn primary" data-action="grade-sim-open" data-c="${ci}" id="simOpenCourse">Abrir materia</button></div>`,true);
    updateGradeSimulator();
  }

  function updateGradeSimulator() {
    const select = $('#simCourse'), out = $('#gradeSimResult'), future = $('#simFuture');
    if (!select || !out || !future) return;
    const ci = Number(select.dataset.c);
    const key = select.value, grade = getGradeInfo(key, ci);
    $('#simOpenCourse').dataset.key = key;
    $('#simFutureLabel').hidden = grade.isFinal;
    if (grade.isFinal) {
      out.innerHTML = `<div class="note">${ic(grade.fromHistory ? 'file' : 'grade')}<div>${gradeResultMarkup(grade)}${gradeStatusMarkup(grade)}</div></div>`;
      return;
    }

    const targetValue = $('#simTarget').valueAsNumber;
    const target = Number.isFinite(targetValue) ? Math.max(0, Math.min(100, targetValue)) : PASS_GRADE;
    const missing = 3 - grade.count;
    const historical = usesHistoricalEstimate(grade) ? historicalGradeBaseline(ci) : null;
    const assumption = grade.count ? roundGrade(grade.sum / grade.count) : historical ?? 80;
    future.placeholder = gradeNumber.format(assumption);
    const customized = Number.isFinite(future.valueAsNumber);
    const expected = customized ? Math.max(0, Math.min(100, future.valueAsNumber)) : assumption;
    const projection = projectedFinal(grade, expected);
    const expectedText = gradeNumber.format(expected);
    const required = goal => {
      const minimum = Math.max(0, (goal * 3 - grade.sum) / missing);
      return minimum > 100 ? 'No alcanzable' : gradeNumber.format(Math.ceil(minimum * 10 - 1e-9) / 10) + '%';
    };
    const label = projection >= PASS_GRADE ? 'Aprobación' : projection >= CONVOCATORIA_MIN ? 'Convocatoria' : 'Reprobación';
    const metric = (value, description) => `<div class="sim-mini"><b>${value}</b><span>${description}</span></div>`;
    out.innerHTML = `
      ${historical !== null && !customized ? `<p class="history-upload-hint">Referencia inicial: promedio ponderado de tu hoja de vida (${gradeNumber.format(historical)}%).</p>` : ''}
      <div class="grade-sim-grid">${grade.p.map((value,index) => `<div class="grade-sim-score ${value === null ? 'missing' : ''}"><span>Parcial ${index+1}</span><b>${value === null ? 'Pendiente' : gradeNumber.format(value) + '%'}</b></div>`).join('')}</div>
      <div class="sim-projection">
        ${metric('≈ ' + gradeNumber.format(projection) + '%', `${label} si obtienes ${expectedText}% en cada parcial pendiente`)}
        ${metric(required(PASS_GRADE), 'Promedio pendiente para aprobar con 70%')}
        ${metric(required(CONVOCATORIA_MIN), 'Promedio pendiente para llegar a convocatoria con 60%')}
        ${target === PASS_GRADE ? '' : metric(required(target), `Promedio pendiente para tu meta de ${gradeNumber.format(target)}%`)}
      </div>`;
  }

  function globalSearchData(q='') {
    const query=String(q||'').trim().toLowerCase();
    const modules=[['plan','grid','Malla curricular','Materias, semestres y estados'],['graduacion','cap','Graduación','Qué te falta para terminar la carrera'],['mapa','route','Mapa de requisitos','Relaciones entre prerrequisitos y materias'],['notas','grade','Calificaciones','Notas y simulador'],['horario','calendar','Horario semanal','Clases y aulas'],['estudio','clock','Centro de estudio','Temporizador y sesiones'],['riesgos','alert','Materias en riesgo','Notas necesarias para aprobar']];
    const modMatches=modules.filter(x=>!query||`${x[2]} ${x[3]}`.toLowerCase().includes(query)).slice(0,6);
    const courses=[]; state.careers.forEach((c,ci)=>c?.courses.forEach(x=>{if(!query||`${x.code} ${x.name} ${electiveChoiceFor(x,c)?.code || ''} ${displayCourseName(x,c)} semestre ${x.semester}`.toLowerCase().includes(query))courses.push({x,c,ci});}));
    return {modules:modMatches,courses:courses.slice(0,12)};
  }

  function globalResultsHtml(q='') {
    const r=globalSearchData(q), chunks=[];
    if(r.courses.length)chunks.push(`<div class="gs-group-title">Materias</div>${r.courses.map(({x,c,ci})=>`<button class="gs-result" data-action="global-course" data-key="${esc(x.key)}" data-c="${ci}"><span class="gs-result-icon">${ic('grid')}</span><span class="gs-result-main"><b>${esc(displayCourseName(x,c))}</b><small>${esc(x.code)} · ${esc(c.name)} · ${x.semester||1}° semestre</small></span><span class="gs-result-meta">${statusOf(x)==='taken'?'Aprobada':statusOf(x)==='available'?'Disponible':'Bloqueada'}</span></button>`).join('')}`);
    if(r.modules.length)chunks.push(`<div class="gs-group-title">Secciones</div>${r.modules.map(([v,i,n,d])=>`<button class="gs-result" data-action="global-nav" data-view="${v}"><span class="gs-result-icon">${ic(i)}</span><span class="gs-result-main"><b>${n}</b><small>${d}</small></span><span class="gs-result-meta">Abrir</span></button>`).join('')}`);
    return chunks.join('')||`<div class="empty small"><h3>Sin resultados</h3><p>No encontré materias ni secciones que coincidan con “${esc(q)}”.</p></div>`;
  }

  function openGlobalSearch() {
    openModal(`${modalHead('Buscar en Ruta Académica','Encuentra materias y secciones desde cualquier pantalla')}<div class="m-body"><label class="global-search-box">${ic('search')}<input id="globalSearchInput" autocomplete="off" placeholder="Ej. Cálculo, proyecto, graduación…"></label><div class="global-search-results" id="globalSearchResults">${globalResultsHtml('')}</div></div>`,true);
    setTimeout(()=>$('#globalSearchInput')?.focus(),30);
  }
  function renderGlobalSearch(q){const el=$('#globalSearchResults');if(el)el.innerHTML=globalResultsHtml(q);}


  /* ===== Nuevas herramientas académicas, vinculadas al plan real ===== */
  const X = () => state.academicExtras;
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  const daysShort = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const dayDate = value => new Date(String(value)+'T12:00:00');
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dateNice = s => { const d=dayDate(s); return Number.isNaN(d.getTime())?'Fecha inválida':d.toLocaleDateString('es-NI',{day:'numeric',month:'short',year:'numeric'}); };
  function realContext(ci,sem,key) {return verifiedStudySelection(String(ci),String(sem),String(key));}
  function liveContext(data) {return realContext(data.career,data.semester,data.key);}
  const emptyTool = (title,text) => `<div class="ra-empty-tool">${ic('grid')}<h3>${esc(title)}</h3><p>${esc(text)}</p><button class="btn primary" data-action="nav" data-view="inicio">${ic('upload')}Cargar plan académico</button></div>`;
  const toolHead = (icon,title,sub,action,label) => `<header class="ra-tool-head"><div class="ra-tool-heading"><span class="ra-tool-icon">${ic(icon)}</span><div><h2>${title}</h2><p>${sub}</p></div></div>${action?`<button class="btn primary" data-action="${action}">${ic('plus')}${label}</button>`:''}</header>`;
  function choiceDisplay(data) {const c=state.careers[Number(data.career)];const x=liveContext(data);return x?`${esc(c?.name||'Carrera')} · Semestre ${esc(data.semester)} · ${esc(x.course.name)}`:'La asignatura ya no existe en este plan';}

  function viewExamPlanner() {
    const exams=X().exams.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    return `<div class="ra-hub">${toolHead('calendar','Planifica tus exámenes','Selecciona los días en que puedes estudiar y reparte tus temas antes del examen.','exam-new','Planificar examen')}
      ${!studyCareers().length?emptyTool('Primero carga tu carrera','El planificador solo usa materias de tus planes académicos cargados.'):''}
      <div class="ra-hub-summary"><article><b>${exams.length}</b><span>Exámenes planificados</span></article><article><b>${exams.reduce((n,e)=>n+e.sessions.filter(s=>s.done).length,0)}</b><span>Sesiones completadas</span></article><article><b>${exams.reduce((n,e)=>n+e.sessions.filter(s=>!s.done).length,0)}</b><span>Sesiones pendientes</span></article></div>
      ${exams.length?exams.map(e=>{
        const done=e.sessions.filter(s=>s.done).length,total=e.sessions.length,pct=total?Math.round(done/total*100):0;
        const context=liveContext(e);
        return `<article class="ra-card ra-exam"><div class="ra-card-top"><div><span class="ra-eyebrow">${ic('calendar')}${dateNice(e.date)} · ${esc(e.minutes)} min por sesión</span><h3>${esc(e.title||('Examen de '+(context?.course.name||'asignatura')))}</h3><p>${choiceDisplay(e)}</p></div><div class="ra-card-actions"><button class="btn ghost" data-action="exam-agenda" data-id="${esc(e.id)}" title="Registrar examen en Agenda">${ic('calendar')}Agenda</button><button class="icon-btn" data-action="exam-delete" data-id="${esc(e.id)}" aria-label="Eliminar planificación">${ic('trash')}</button></div></div>
        <div class="ra-progress-line"><div><strong>${done}/${total} sesiones terminadas</strong><span>${pct}% completado</span></div><div class="ra-track"><i style="width:${pct}%"></i></div></div>
        <div class="ra-sessions">${e.sessions.map((se,j)=>`<button type="button" class="ra-session ${se.done?'is-done':''}" data-action="exam-toggle" data-id="${esc(e.id)}" data-session="${j}" aria-pressed="${!!se.done}"><span class="ra-session-check">${se.done?ic('check'):ic('clock')}</span><span class="ra-session-text"><b>${dateNice(se.date)}</b><small>${esc(se.topic)}</small></span><span class="ra-minutes">${esc(se.minutes)} min</span></button>`).join('')}</div>
        ${!context?'<p class="ra-warning">Esta materia fue eliminada o cambió de semestre; revisa el plan.</p>':''}</article>`;
      }).join(''):`<div class="ra-empty-tool">${ic('calendar')}<h3>Tu primer plan de examen</h3><p>Registra una evaluación y define los temas. Las sesiones aparecerán aquí para marcarlas al terminar.</p></div>`}</div>`;
  }
  function openExamModal(){
    if(!studyCareers().length){toast('Carga una carrera antes de planificar exámenes.','err');return;}
    const sel={...state.studySelection};
    const tomorrow=dayDate(localDate());tomorrow.setDate(tomorrow.getDate()+1);
    openModal(`${modalHead('Nuevo plan de examen','Distribuye tus temas en días disponibles')}<form class="m-body form ra-form" id="examPlanForm">
      ${studySelectGroup(sel,'exam')}
      <label>Nombre del examen (opcional)<input name="title" maxlength="90" placeholder="Ej. Segundo parcial de Estadística"></label>
      <div class="ra-form-cols"><label>Fecha del examen<input type="date" name="date" min="${dateKey(tomorrow)}" required></label><label>Minutos disponibles por día<input type="number" name="minutes" min="15" max="240" step="5" value="45" required></label></div>
      <label>Temas del examen (uno por línea)<textarea name="topics" rows="6" required maxlength="3000" placeholder="Tema 1: Distribución normal&#10;Tema 2: Prueba de hipótesis&#10;Tema 3: Intervalos de confianza"></textarea></label>
      <fieldset class="ra-weekdays"><legend>¿Qué días puedes estudiar?</legend>${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((day,i)=>`<label><input type="checkbox" name="days" value="${i}" ${i!==0?'checked':''}><span>${day}</span></label>`).join('')}</fieldset>
      <div class="note">${ic('info')}<span>Se crean sesiones desde hoy hasta el día anterior al examen. Nunca se inventan materias ni notas.</span></div>
      </form><div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" type="submit" form="examPlanForm">${ic('calendar')}Crear planificación</button></div>`,true);
  }
  function saveExamPlan(form){
    const f=new FormData(form),ci=$('#examCareer')?.value,sem=$('#examSemester')?.value,key=$('#examCourse')?.value;
    const selected=realContext(ci,sem,key);
    if(!selected)return toast('Selecciona carrera, semestre y una materia válida.','err');
    const date=String(f.get('date')||''), now=localDate(),end=dayDate(date),start=dayDate(now), diff=Math.round((end-start)/86400000);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(end.getTime())||dateKey(end)!==date||diff<1||diff>366)return toast('El examen debe ser entre mañana y dentro de un año.','err');
    const minutes=Number(f.get('minutes'));
    if(!Number.isInteger(minutes)||minutes<15||minutes>240||minutes%5)return toast('Escribe minutos por día entre 15 y 240, en pasos de 5.','err');
    const raw=String(f.get('topics')||''),topics=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!topics.length||topics.length>30||topics.some(t=>t.length>120))return toast('Escribe entre 1 y 30 temas, uno por línea (máximo 120 caracteres).','err');
    const days=new Set(f.getAll('days').map(Number).filter(v=>v>=0&&v<=6));
    if(!days.size)return toast('Selecciona al menos un día para estudiar.','err');
    const dates=[];
    for(let d=0;d<diff;d++){const day=dayDate(now);day.setDate(day.getDate()+d);if(days.has(day.getDay()))dates.push(dateKey(day));}
    if(!dates.length)return toast('No hay días disponibles antes del examen. Selecciona otros días o una fecha posterior.','err');
    if(dates.length>180)return toast('Reduce el intervalo del plan de estudio.','err');
    const sessions=dates.map((day,i)=>{let topic;if(dates.length>=topics.length)topic=i<topics.length?topics[i]:'Repaso: '+topics[(i-topics.length)%topics.length];else{const a=Math.floor(i*topics.length/dates.length),b=Math.floor((i+1)*topics.length/dates.length);topic=topics.slice(a,b).join(' · ');}return {date:day,topic,minutes,done:false};});
    const title=String(f.get('title')||'').trim().slice(0,90)||`Examen de ${selected.course.name}`;
    X().exams.push({id:uid(),career:ci,semester:sem,key,date,title,minutes,topics,sessions});
    closeModal();render();toast(`${sessions.length} sesiones planificadas para ${selected.course.name}`);
  }
  function toggleExamSession(id,n){const ex=X().exams.find(e=>e.id===id);const s=ex?.sessions[Number(n)];if(!s)return;s.done=!s.done;render();}
  function deleteExam(id){const e=X().exams.find(x=>x.id===id);if(!e||!confirm(`¿Eliminar la planificación de «${e.title}»?`))return;X().exams=X().exams.filter(x=>x.id!==id);render();toast('Planificación eliminada');}
  function addExamAgenda(id){const ex=X().exams.find(x=>x.id===id);if(!ex)return;
    if(state.tasks.some(t=>t.examPlanId===id))return toast('Este examen ya está registrado en Agenda.');
    state.tasks.push({id:Date.now()+Math.floor(Math.random()*10000),examPlanId:id,title:ex.title,key:ex.key,type:'examen',due:ex.date,priority:1,notes:'Planificado desde el planificador de exámenes.',done:false});render();toast('Examen agregado a Agenda');
  }

  const riskGroups = {
    critical: { label:'Revisión prioritaria', icon:'alert' },
    attention: { label:'En seguimiento', icon:'target' },
    favorable: { label:'Situación favorable', icon:'check' },
    empty: { label:'Sin calificaciones', icon:'file' }
  };

  function courseRisk(course, ci) {
    const grade = getGradeInfo(course.key, ci);
    const result = (group, label, detail, target = null, goal = '') => ({group,label,detail,target,goal,grade});
    if (grade.isFinal) {
      if (grade.status === 'passed') return result('favorable','Aprobada','Alcanzaste la nota mínima.');
      if (grade.status === 'convocatoria') return result('critical','Convocatoria','La nota final queda en el rango de convocatoria.');
      return result('critical','Reprobada','La nota final quedó por debajo de ' + CONVOCATORIA_MIN + '.');
    }
    if (!grade.count) return result('empty','Sin notas','Registra un parcial para calcular la meta.');
    const remaining = 3 - grade.count;
    const remainingLabel = remaining === 1 ? 'En el último parcial' : 'De promedio en los parciales restantes';
    if (grade.needed > 100) {
      if (grade.neededConvocatoria <= 100) {
        return result('critical','Solo alcanza a convocatoria',remainingLabel,grade.neededConvocatoria,'Meta para convocatoria');
      }
      return result('critical','Nota insuficiente para convocatoria','Incluso con 100 en cada parcial pendiente, el promedio quedaría por debajo de ' + CONVOCATORIA_MIN + '.');
    }
    if (grade.needed === 0) return result('favorable','Mínimo acumulado','Los puntos registrados ya alcanzan la nota mínima de aprobación.');
    const group = grade.needed >= 85 ? 'critical' : grade.needed >= 70 ? 'attention' : 'favorable';
    const label = group === 'critical' ? 'Meta exigente' : group === 'attention' ? 'Requiere seguimiento' : 'Aprobación alcanzable';
    return result(group,label,remainingLabel,grade.needed,'Meta para aprobar');
  }

  function viewAcademicRisks() {
    const c = cur(), ci = activeIdx();
    if (!c?.courses.length) return emptyState('Carga una malla para revisar el rendimiento', 'Las alertas se calculan con las notas de la carrera seleccionada.');
    const groups = Object.keys(riskGroups);
    const counts = Object.fromEntries(groups.map(key => [key,0]));
    const items = c.courses.map(course => {
      const risk = courseRisk(course,ci);
      counts[risk.group]++;
      return {course,risk};
    });
    const priority = counts.critical + counts.attention;
    const active = ui.riskFilter || (priority ? 'attention-needed' : counts.empty === items.length ? 'empty' : 'all');
    const filters = [
      ['attention-needed','Requieren atención',priority], ['all','Todas',items.length],
      ...groups.map(key => [key,riskGroups[key].label,counts[key]])
    ];
    const number = new Intl.NumberFormat('es', {maximumFractionDigits:1});
    const coursesWord = n => n === 1 ? '1 materia' : n + ' materias';
    const matches = ({risk}) => active === 'all' || active === risk.group ||
      (active === 'attention-needed' && ['critical','attention'].includes(risk.group));
    const shown = items.filter(matches).sort((a,b) => groups.indexOf(a.risk.group) - groups.indexOf(b.risk.group) ||
      (b.risk.grade.needed ?? -1) - (a.risk.grade.needed ?? -1) ||
      (Number(a.course.semester) || 1) - (Number(b.course.semester) || 1) || a.course.name.localeCompare(b.course.name,'es'));
    const item = ({course,risk}) => {
      const {group,label,grade,target,goal,detail} = risk;
      const grades = grade.fromHistory ?
        `<div class="risk-imported">${ic('file')}<span>Nota final importada</span></div>` :
        `<dl class="risk-partials">${grade.p.map((score,i) => `<div><dt aria-label="Parcial ${i+1}">P${i+1}</dt><dd>${score === null ? '—' : number.format(score)}</dd></div>`).join('')}</dl>`;
      const result = grade.isFinal ? `<span>Nota final</span><strong>${number.format(grade.avg)}<small>/100</small></strong>` :
        target !== null ? `<span>${goal}</span><strong>${number.format(target)}<small>/100</small></strong>` :
        `<span>${group === 'empty' ? 'Meta de aprobación' : 'Situación actual'}</span><strong class="risk-text-value">${group === 'empty' ? 'Por calcular' : label}</strong>`;
      return `<article class="risk-course is-${group}">
        <div class="risk-course-name">
          <span class="risk-course-status">${ic(riskGroups[group].icon)}${esc(label)}</span>
          <h3>${esc(displayCourseName(course,c))}</h3><p>${esc(course.code || course.key)} · Semestre ${Number(course.semester) || 1}</p>
        </div>
        ${grades}
        <div class="risk-course-target">${result}<p>${detail}</p></div>
        <button type="button" class="btn ghost risk-course-link" data-action="open" data-key="${esc(course.key)}" data-c="${ci}" aria-label="Ver ficha de ${esc(course.name)}">${ic('arrow-right')}<span>Ver ficha</span></button>
      </article>`;
    };
    const summary = groups.map(key => {
      const {label,icon} = riskGroups[key];
      return `<div class="risk-stat is-${key}"><span class="risk-stat-icon">${ic(icon)}</span><div><b>${counts[key]}</b><span>${label}</span></div></div>`;
    }).join('');
    const barText = groups.map(key => riskGroups[key].label + ': ' + counts[key]).join(', ');
    const bars = groups.filter(key=>counts[key]).map(key=>`<i class="is-${key}" style="width:${100*counts[key]/items.length}%"></i>`).join('');
    return `<div class="risk-dashboard">
      <div class="risk-dashboard-tools">${careerSwitch()}<button type="button" class="btn ghost" data-action="nav" data-view="notas">${ic('grade')} Ir a calificaciones</button></div>
      <section class="risk-overview" aria-labelledby="riskOverviewTitle">
        <div class="risk-heading"><div><h2 id="riskOverviewTitle">Prioridades académicas</h2><p>${priority ? coursesWord(priority) + (priority === 1 ? ' requiere atención.' : ' requieren atención.') : 'No hay alertas con las calificaciones registradas.'}</p></div><span>${coursesWord(items.length)} en el plan</span></div>
        <div class="risk-distribution" role="img" aria-label="${esc(barText)}">${bars}</div>
        <div class="risk-stats">${summary}</div>
      </section>
      <section class="risk-results" aria-labelledby="riskResultTitle">
        <header><div><h2 id="riskResultTitle">Detalle por materia</h2><p>${coursesWord(shown.length)} ${shown.length === 1 ? 'visible' : 'visibles'}</p></div>
        <label>Mostrar<select id="riskFilter">${filters.map(([key,label,count])=>`<option value="${key}" ${key === active ? 'selected' : ''}>${label} (${count})</option>`).join('')}</select></label></header>
        <div class="risk-course-list">${shown.length ? shown.map(item).join('') : '<p class="risk-empty">No hay materias en esta categoría.</p>'}</div>
      </section>
      <details class="risk-guide">
        <summary>${ic('info')} Cómo se calculan las alertas ${ic('arrow-right')}</summary>
        <p>La aprobación requiere ${PASS_GRADE}/100. Una nota final desde ${CONVOCATORIA_MIN} y menor que ${PASS_GRADE} da derecho a convocatoria. Con parciales pendientes, la meta se expresa en puntos enteros y corresponde a lo que necesitas en los restantes.</p>
        <p>La revisión es prioritaria cuando la meta para aprobar es de 85 puntos o más, cuando ${PASS_GRADE} ya queda fuera de alcance con los parciales restantes o cuando hay una nota final en convocatoria o reprobada. Las metas de 70 a 84 puntos quedan en seguimiento.</p>
      </details>
    </div>`;
  }

  function noteResults(){
    const q=String(ui.notebookQuery||'').toLowerCase().trim();
    const notes=X().notes.slice().sort((a,b)=>Number(b.updated||0)-Number(a.updated||0));
    return notes.filter(n=>!q||`${n.title} ${n.body} ${(n.tags||[]).join(' ')} ${findCourse(n.key)?.name||''} ${state.careers[Number(n.career)]?.name||''}`.toLowerCase().includes(q));
  }
  function noteCards(){const items=noteResults();return items.length?items.map(n=>`<article class="ra-card ra-note"><div class="ra-card-top"><div><span class="ra-eyebrow">${esc(n.tags?.slice(0,4).join(' · ')||'Sin etiquetas')}</span><h3>${esc(n.title)}</h3><p>${choiceDisplay(n)}</p></div></div><p class="ra-note-excerpt">${esc(n.body.slice(0,180))}${n.body.length>180?'…':''}</p><div class="ra-card-foot"><small>${new Date(n.updated||n.created).toLocaleDateString('es-NI')}</small><div><button class="btn ghost" data-action="note-view" data-id="${esc(n.id)}">Leer</button><button class="icon-btn" data-action="note-edit" data-id="${esc(n.id)}" aria-label="Editar">${ic('edit')}</button><button class="icon-btn" data-action="note-delete" data-id="${esc(n.id)}" aria-label="Eliminar">${ic('trash')}</button></div></div></article>`).join(''):'<div class="ra-empty-tool"><h3>No hay apuntes que coincidan</h3><p>Prueba otra palabra o crea tu primer apunte.</p></div>';}
  function viewNotebook(){return `<div class="ra-hub">${toolHead('notebook','Cuaderno digital','Apuntes privados guardados en este navegador.','note-new','Nuevo apunte')}
    <div class="ra-toolbar"><label class="ra-search">${ic('search')}<input id="notebookSearch" value="${esc(ui.notebookQuery)}" placeholder="Buscar por materia, título, contenido o etiqueta…"></label><button class="btn ghost" data-action="notes-export">${ic('download')}Exportar PDF</button></div>
    ${!studyCareers().length?emptyTool('Carga primero tu plan','Los apuntes se vinculan a materias reales de la malla.'):''}
    <div class="ra-note-grid" id="raNoteResults">${noteCards()}</div><p class="ra-disclaimer">Los apuntes se guardan localmente en este navegador. Usa «Exportar PDF» para conservar una copia legible.</p></div>`;}
  function refreshNotesList(){const el=$('#raNoteResults');if(el)el.innerHTML=noteCards();}
  function openNoteModal(id = '', folder = null) {
    if (!studyCareers().length) return toast('Primero carga un plan académico.', 'err');
    const note = X().notes.find(item => item.id === id);
    const selection = note ? { career: note.career, semester: note.semester, course: note.key } : state.studySelection;
    const subject = folder ? esc(displayCourseName(folder.course, folder.plan)) : 'Organizado por carrera, semestre y materia';
    openModal(`${modalHead(note ? 'Editar apunte' : 'Nuevo apunte', subject)}
      <form id="noteForm" class="m-body form ra-form" data-id="${esc(id)}" ${folder ? `data-folder-career="${folder.ci}" data-folder-key="${esc(folder.key)}"` : ''}>
        ${folder ? '' : studySelectGroup(selection, 'note')}
        <label>Título<input name="title" required maxlength="110" value="${esc(note?.title)}" placeholder="Ej. Resumen de la unidad 2"></label>
        <label>Etiquetas (separadas por comas)<input name="tags" maxlength="200" value="${esc(note?.tags?.join(', '))}" placeholder="examen, fórmulas, definiciones"></label>
        <label>Contenido<textarea name="body" rows="11" maxlength="20000" required placeholder="Escribe aquí tus apuntes…">${esc(note?.body)}</textarea></label>
      </form>
      <div class="m-foot">${folder ? folderBack() : '<button class="btn ghost" data-action="close">Cancelar</button>'}
        <button class="btn primary" type="submit" form="noteForm">${ic('check')}Guardar apunte</button>
      </div>`, true);
    if (folder) {
      $('#modalCard [data-folder-back]').onclick = () => openCourseFolder(folder.ci, folder.key);
      $('#noteForm input[name="title"]').focus();
    }
  }
  function saveNotebookNote(form) {
    const data = new FormData(form);
    const fromFolder = form.dataset.folderCareer !== undefined;
    const career = fromFolder ? form.dataset.folderCareer : $('#noteCareer')?.value;
    const key = fromFolder ? form.dataset.folderKey : $('#noteCourse')?.value;
    const context = folderContext(Number(career), key);
    const semester = fromFolder ? String(context?.course.semester) : $('#noteSemester')?.value;
    if (!context || !realContext(career, semester, key)) return toast('Elige una materia válida de tu carrera y semestre.', 'err');
    const title = String(data.get('title') || '').trim(), body = String(data.get('body') || '').trim();
    if (title.length < 3 || title.length > 110 || body.length < 3 || body.length > 20000) return toast('Escribe un título y contenido válidos.', 'err');
    const tags = [...new Set(String(data.get('tags') || '').split(',').map(tag => tag.trim()).filter(Boolean))];
    if (tags.length > 10 || tags.some(tag => tag.length > 30)) return toast('Máximo 10 etiquetas de hasta 30 caracteres cada una.', 'err');
    const notes = X().notes;
    const old = notes.find(item => item.id === form.dataset.id);
    const sameCourse = old?.planIdentity === context.identity && Number(old?.career) === context.ci && old?.key === key;
    const value = { id: old?.id || uid(), career, semester, key, title, body, tags,
      planIdentity: context.identity, electiveCode: sameCourse ? old.electiveCode ?? context.elective : context.elective,
      created: old?.created || Date.now(), updated: Date.now() };
    X().notes = old ? notes.map(item => item === old ? value : item) : [...notes, value];
    if (!save()) {
      X().notes = notes;
      return toast('No se pudo guardar el apunte en este navegador.', 'err');
    }
    if (fromFolder) openCourseFolder(context.ci, key);
    else closeModal();
    render();
    toast('Apunte guardado');
  }
  function openNoteReader(id, folder = null) {
    const note = X().notes.find(item => item.id === id);
    if (!note) return;
    openModal(`${modalHead(esc(note.title), folder ? esc(displayCourseName(folder.course, folder.plan)) : choiceDisplay(note))}
      <div class="m-body"><div class="ra-note-reading">${esc(note.body)}</div>
      <p class="ra-note-tags">${(note.tags || []).map(tag => `<span>${esc(tag)}</span>`).join('')}</p></div>
      <div class="m-foot">${folder ? folderBack() : '<button class="btn ghost" data-action="close">Cerrar</button>'}
        <button class="btn primary" type="button" ${folder ? 'data-folder-note-edit' : `data-action="note-edit" data-id="${esc(id)}"`}>${ic('edit')}Editar</button>
      </div>`, true);
    if (folder) {
      $('#modalCard [data-folder-back]').onclick = () => openCourseFolder(folder.ci, folder.key);
      $('#modalCard [data-folder-note-edit]').onclick = () => openNoteModal(id, folder);
    }
  }
  function deleteNote(id) {
    const notes = X().notes;
    const note = notes.find(item => item.id === id);
    if (!note || !confirm(`¿Eliminar el apunte «${note.title}»?`)) return false;
    X().notes = notes.filter(item => item !== note);
    if (!save()) {
      X().notes = notes;
      toast('No se pudo eliminar el apunte.', 'err');
      return false;
    }
    render();
    toast('Apunte eliminado');
    return true;
  }
  function exportNotesPDF(){
    const notes=noteResults();if(!notes.length)return toast('No hay apuntes para exportar.','err');
    const w=window.open('','_blank');if(!w)return toast('Permite ventanas emergentes para imprimir el PDF.','err');
    const body=notes.map(n=>`<article><p class="sub">${choiceDisplay(n)}</p><h2>${esc(n.title)}</h2><p class="tags">${esc(n.tags.join(' · '))}</p><div class="note">${esc(n.body)}</div></article>`).join('');
    w.document.open();w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuaderno Ruta Académica UAM</title><link rel="stylesheet" href="/static/css/estilos-49.css"></head><body><h1>Cuaderno digital · Ruta Académica UAM</h1><p>Exportación personal de apuntes</p>${body}<\/body><\/html>`);w.document.close();w.focus();setTimeout(()=>w.print(),250);
  }

  function goalState(g){
    const x=liveContext(g);if(!x)return {pct:0,done:false,desc:'Materia no disponible en este plan'};
    if(g.kind==='grade'){
      const gr=getGradeInfo(g.key);if(!gr.count&&!gr.fromHistory)return {pct:0,done:false,desc:'Sin notas registradas'};
      const average=gr.isFinal?gr.avg:Math.round(gr.sum/gr.count*10)/10;
      return {pct:Math.min(100,Math.round(average/g.target*100)),done:gr.isFinal&&gr.avg>=g.target,desc:`${gr.isFinal?'Nota final':'Promedio provisional'}: ${average}/100 · objetivo ${g.target}`};
    }
    if(g.kind==='study'){
      const weekly=state.studyLog.filter(s=>s.key===g.key&&new Date(s.date)>=startOfWeek()).reduce((n,s)=>n+(Number(s.minutes)||0),0);
      return {pct:Math.min(100,Math.round(weekly/g.target*100)),done:weekly>=g.target,desc:`${weekly} de ${g.target} minutos esta semana`};
    }
    const task=state.tasks.find(t=>t.id===g.taskId);
    return {pct:task?.done?100:0,done:!!task?.done,desc:task?`${task.done?'Completada':'Pendiente'} · ${dateNice(g.due)}`:'Actividad ya no disponible'};
  }
  function viewCourseGoals(){
    const goals=X().goals.slice(),f=ui.goalFilter,show=goals.filter(g=>f==='all'||(f==='done'?goalState(g).done:!goalState(g).done));
    return `<div class="ra-hub">${toolHead('target','Metas por asignatura','Objetivos personalizados conectados con tus notas y sesiones de estudio.','goal-new','Nueva meta')}
      ${!studyCareers().length?emptyTool('Carga un plan académico','Las metas solo pueden vincularse a asignaturas reales.'):''}
      <div class="ra-hub-summary"><article><b>${goals.length}</b><span>Metas creadas</span></article><article><b>${goals.filter(x=>goalState(x).done).length}</b><span>Cumplidas</span></article><article><b>${goals.filter(x=>!goalState(x).done).length}</b><span>En progreso</span></article></div>
      <div class="ra-seg"><button class="${f==='all'?'on':''}" data-action="goal-filter" data-filter="all">Todas</button><button class="${f==='pending'?'on':''}" data-action="goal-filter" data-filter="pending">En progreso</button><button class="${f==='done'?'on':''}" data-action="goal-filter" data-filter="done">Cumplidas</button></div>
      <div class="ra-goals-grid">${show.length?show.map(g=>{const r=goalState(g);return `<article class="ra-card ra-goal"><div class="ra-card-top"><div><span class="ra-eyebrow">${g.kind==='grade'?'Objetivo de calificación':g.kind==='study'?'Estudio semanal':'Entrega académica'}</span><h3>${esc(g.title)}</h3><p>${choiceDisplay(g)}</p></div><button class="icon-btn" data-action="goal-delete" data-id="${esc(g.id)}" aria-label="Eliminar meta">${ic('trash')}</button></div><div class="ra-progress-line"><div><strong>${esc(r.desc)}</strong><span>${r.done?'Cumplida':'En progreso'}</span></div><div class="ra-track"><i style="width:${r.pct}%"></i></div></div></article>`;}).join(''):'<div class="ra-empty-tool"><h3>No hay metas en esta sección</h3><p>Crea una meta de calificación o de estudio semanal.</p></div>'}</div>
    <p class="ra-disclaimer">Las metas de calificación se cumplen solo cuando están completos los tres parciales. El tiempo se actualiza a partir de las sesiones registradas.</p></div>`;
  }
  function openCourseGoalModal(){
    if(!studyCareers().length)return toast('Primero carga un plan académico.','err');
    openModal(`${modalHead('Nueva meta por asignatura','Define qué quieres alcanzar y la aplicación medirá tu progreso')}<form class="m-body form ra-form" id="courseGoalForm">${studySelectGroup({...state.studySelection},'goal')}
      <label>Tipo de meta<select id="goalKind" name="kind"><option value="grade">Nota final</option><option value="study">Minutos de estudio por semana</option></select></label>
      <label>Título corto<input name="title" maxlength="90" required placeholder="Ej. Alcanzar 85 en Matemáticas"></label>
      <label class="goal-type-fields goal-grade">Nota objetivo (70–100)<input name="gradeTarget" type="number" min="70" max="100" step="1" value="85"></label>
      <label class="goal-type-fields goal-study" hidden>Minutos de estudio por semana (30–1200)<input name="studyTarget" type="number" min="30" max="1200" step="10" value="240"></label>
      <label class="goal-type-fields goal-deadline" hidden>Fecha límite<input name="due" type="date" min="${localDate()}"></label>
      <p class="ra-disclaimer">Define una meta de calificación o de tiempo de estudio semanal.</p></form><div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" type="submit" form="courseGoalForm">${ic('target')}Guardar meta</button></div>`);
  }
  function updateGoalFields(){const k=$('#goalKind')?.value;for(const [type,selector] of [['grade','.goal-grade'],['study','.goal-study']]){const el=$(selector);if(el)el.hidden=k!==type;}}
  function saveCourseGoal(form){
    const f=new FormData(form),career=$('#goalCareer')?.value,semester=$('#goalSemester')?.value,key=$('#goalCourse')?.value,chosen=realContext(career,semester,key);
    if(!chosen)return toast('Selecciona carrera, semestre y materia válidos.','err');
    const kind=String(f.get('kind')),title=String(f.get('title')||'').trim();
    if(title.length<4||title.length>90)return toast('Escribe un título de entre 4 y 90 caracteres.','err');
    const val={id:uid(),career,semester,key,kind,title,target:0,created:Date.now()};
    if(kind==='grade') {val.target=Number(f.get('gradeTarget'));if(!Number.isInteger(val.target)||val.target<70||val.target>100)return toast('La nota objetivo debe estar entre 70 y 100.','err');}
    else if(kind==='study'){val.target=Number(f.get('studyTarget'));if(!Number.isInteger(val.target)||val.target<30||val.target>1200||val.target%10)return toast('Usa minutos entre 30 y 1200, en múltiplos de 10.','err');}
    else if(kind==='deadline'){
      val.due=String(f.get('due')||'');const d=dayDate(val.due);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(val.due)||!Number.isFinite(d.getTime())||dateKey(d)!==val.due||val.due<localDate())return toast('La fecha límite no puede ser anterior a hoy.','err');
      val.taskId=Date.now()+Math.floor(Math.random()*10000);
      state.tasks.push({id:val.taskId,title,key,type:'tarea',due:val.due,priority:2,notes:'Meta personal de Ruta Académica',done:false});
    }else return toast('Tipo de meta inválido.','err');
    X().goals.push(val);closeModal();render();toast('Meta académica creada');
  }
  function deleteCourseGoal(id){const g=X().goals.find(x=>x.id===id);if(!g||!confirm(`¿Eliminar la meta «${g.title}»?`))return;X().goals=X().goals.filter(x=>x.id!==id);render();toast('Meta eliminada');}

  /* ---------------- Vistas ---------------- */
  const VIEWS = {
    inicio: {
      title: 'Inicio',
      sub: 'Tu centro de control para organizar, entender y avanzar en tu carrera',
      render: viewInicio
    },
    perfil: { title: 'Perfil del estudiante', sub: 'Datos personales y avance de tus planes de estudio', render: viewStudentProfile },
    plan: { title: 'Malla curricular', sub: 'Visualiza tu ruta académica, requisitos y avance semestre por semestre.', render: viewPlan },
    notas: { title: 'Calificaciones', sub: 'Registra tus parciales, controla tu promedio y visualiza cuánto necesitas para aprobar', render: viewGrades },
    horario: { title: 'Horario semanal', sub: 'Organiza tus clases por día, hora, aula y modalidad', render: viewSchedule },
    recom: { title: 'Próximo semestre', sub: 'Prioriza las clases disponibles y arma una carga académica inteligente', render: viewRecom },
    req: { title: 'Requisitos', sub: 'Qué clases tienen requisito y cuál debes llevar primero', render: viewReq },
    shared: { title: 'Clases compartidas', sub: 'Compara semestres, créditos y requisitos entre tus dos planes de estudio', render: viewShared },
    prog: { title: 'Mi progreso', sub: 'Avance por carrera y por semestre', render: viewProg },
    estudio: { title: 'Centro de estudio', sub: 'Sesiones de enfoque, meta diaria y tiempo invertido por asignatura', render: viewStudy },
    mapa: { title: 'Mapa de requisitos', sub: 'Visualiza cómo cada prerrequisito conecta y desbloquea materias posteriores', render: viewRequirementMap },
    graduacion: { title: 'Camino a graduación', sub: 'Materias pendientes, avance por semestre y requisitos por completar', render: viewGraduation },
    riesgos: { title: 'Materias en riesgo', sub: 'Revisa tus parciales, alertas y la nota que necesitas para aprobar', render: viewAcademicRisks },
  };

  function renderOfficialCatalog() {
    return `<section class="uam-catalog" aria-label="Biblioteca de planes de estudio integrados">
      <div class="uam-catalog-heading">
        <div><h3>Biblioteca de planes</h3><p>Consulta los PDF originales o carga una malla del catálogo.</p></div>
        <div class="uam-catalog-counter">${UAM_CATALOG.length} planes</div>
      </div>
      ${[...new Set(UAM_CATALOG.map(p=>p.year))].sort((a,b)=>Number(b)-Number(a)).map(year=>`<section class="uam-year-section"><h4 class="uam-year-heading">${esc(year)}</h4><div class="uam-catalog-grid">${UAM_CATALOG.filter(p=>p.year===year).map(p=>{
        const used=state.careers.some(c=>catalogForCareer(c)?.id===p.id);
        return `<article class="uam-catalog-card">
          <div class="uam-catalog-top">${careerIcon(p)}<span class="uam-catalog-code">${esc(p.planCode)}</span></div>
          <h4>${esc(p.name)}</h4>
          <div class="uam-catalog-facts"><span>${p.courses.length} materias</span><span>${p.semesterCount} semestres</span><span>${p.creditTotal} créditos</span></div>
          <div class="uam-catalog-buttons"><button type="button" class="btn uam-catalog-pdf" data-action="catalog-pdf" data-catalog="${esc(p.id)}" title="Abrir PDF original de ${esc(p.name)}">${ic('file')} PDF</button><button type="button" class="btn uam-catalog-load" data-action="catalog-load" data-catalog="${esc(p.id)}">${ic('grid')}${used?'Cargar otra vez':'Usar esta malla'}</button></div>
        </article>`;
      }).join('')}</div></section>`).join('')}
      <p class="uam-catalog-disclaimer">Los códigos, materias, requisitos y créditos provienen de los PDF adjuntos. La columna «Relación» no se trata como prerrequisito. Cuando se cargan planes distintos, la app mantiene como máximo dos planes activos para su comparación; los documentos continúan siempre disponibles en esta biblioteca.</p>
    </section>`;
  }
  function showCatalogPdf(id) {
    const p=catalogById(id);
    if (!p) return toast('No encontramos ese documento PDF','err');
    try {
      const raw=atob(p.pdf); const bytes=new Uint8Array(raw.length);
      for(let z=0;z<raw.length;z++)bytes[z]=raw.charCodeAt(z);
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      const win=window.open(url,'_blank');
      if (!win) {
        const a=document.createElement('a');a.href=url;a.download=p.filename;a.click();
        toast('El navegador bloqueó la pestaña: descargamos el PDF original');
      }
      setTimeout(()=>URL.revokeObjectURL(url),180000);
    } catch(err){ console.error(err);toast('No se pudo abrir el PDF original','err'); }
  }
  function confirmCatalogSlot(id, i) {
    const p=catalogById(id);
    if (!p || ![0,1].includes(i)) return;
    const occupied=state.careers[i];
    if(occupied && !confirm(`¿Reemplazar «${occupied.name}» en el espacio ${i+1} por «${p.name}»? Las notas y aprobaciones de este espacio pertenecen al plan actual; guarda un respaldo antes de reemplazarlo si necesitas conservarlas.`))return;
    state.careers[i]={
      name:p.name, fileName:p.filename, planCode:p.planCode,
      importMode:'uam-table-strict-offline', sourceCatalogId:p.id,
      semesterCount:p.semesterCount,
      courses:p.courses.map(c=>({ ...c, prereqs:[...c.prereqs],coreqs:[...c.coreqs] }))
    };
    state.active=i;
    ui.pendingNames[i]='';
    closeModal();
    render();
    toast(`Se cargó ${p.name} · ${p.courses.length} materias`);
  }
  function selectCatalogSlot(id) {
    const p=catalogById(id);
    if (!p) return;
    const existing=state.careers.findIndex(c=>catalogForCareer(c)?.id===id);
    if(existing!==-1){state.active=existing;go('plan');return;}
    const empty=state.careers.findIndex(c=>!c);
    if(empty!==-1){confirmCatalogSlot(id,empty);return;}
    openModal(`${modalHead('Elegir espacio para cargar el plan',esc(p.name))}
      <div class="m-body"><p class="muted-p">Ya hay dos planes activos. Elige cuál reemplazar. Los documentos PDF seguirán disponibles; las notas de la carrera sustituida no se transferirán a otra malla.</p>
        ${state.careers.map((c,i)=>`<button type="button" class="uam-catalog-slot-choice" data-action="catalog-slot" data-catalog="${esc(id)}" data-i="${i}"><b>Espacio ${i+1}</b><span class="route-career-line">${careerIcon(c)}<span>${esc(c.name)}</span></span>${ic('arrow-right')}</button>`).join('')}
      </div><div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button></div>`);
  }

  function homeAcademicOverview() {
    const groups=new Map();
    list().forEach(({c,i})=>c.courses.forEach(x=>{
      const refs=equivalentCourseRefs(x.key,i),key=refs.map(r=>r.ci+':'+r.course.key).sort().join('|')||i+':'+x.key;
      if(!groups.has(key))groups.set(key,{x,ci:i,refs});
    }));
    const all=[...groups.values()],approved=all.filter(g=>isTaken(g.x.key,g.ci)).length;
    const available=all.filter(g=>!isTaken(g.x.key,g.ci)&&g.refs.some(r=>statusOf(r.course,r.ci)==='available'&&!currentCourseKeys(r.ci).includes(r.course.key))).length;
    return {total:all.length,approved,available,shared:all.filter(g=>g.refs.length>1).length,pct:all.length?Math.round(approved/all.length*100):0};
  }
  function viewStudentProfile() {
    const plans = list().map(({c,i}) => {
      const s = stats(c);
      const pct = Math.round(s.pct * 100);
      return `<article class="student-plan">
        <header>${careerIcon(c)}<div><h3>${esc(c.name)}</h3>${c.planCode ? `<p>${esc(c.planCode)}</p>` : ''}</div><b>${pct}%</b></header>
        <div class="student-plan-track" role="progressbar" aria-label="Avance en ${esc(c.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
        <dl><div><dt>Aprobadas</dt><dd>${s.taken} de ${s.total}</dd></div><div><dt>Pendientes</dt><dd>${s.total-s.taken}</dd></div>${s.credits ? `<div><dt>Créditos aprobados</dt><dd>${s.creditsTaken} de ${s.credits}</dd></div>` : ''}</dl>
        <button type="button" class="btn ghost" data-action="open-plan" data-i="${i}">Ver malla ${ic('arrow')}</button>
      </article>`;
    }).join('');
    return `<div class="student-page">
      <section class="student-record" aria-labelledby="studentRecordName">
        <div class="student-record-identity">
          <div class="student-avatar student-record-avatar"><img data-student-photo alt="" hidden /><span data-student-initials aria-hidden="true">RA</span></div>
          <div class="student-record-title">
            <h2 id="studentRecordName" data-student-text="name">Perfil del estudiante</h2>
            <p data-student-text="subtitle">Estudiante universitario</p>
          </div>
          <button type="button" class="btn student-record-edit" data-student-editor="identity" aria-haspopup="dialog" aria-controls="customizerPanel">${ic('edit')} Editar perfil</button>
        </div>
        <div class="student-record-data">
          <dl>
            <div><dt>${ic('cap')} Carrera</dt><dd data-student-text="career">Sin indicar</dd></div>
            <div><dt>${ic('calendar')} Semestre actual</dt><dd data-student-text="semester">Sin indicar</dd></div>
            <div><dt>${ic('check')} Estado académico</dt><dd data-student-text="status">Sin indicar</dd></div>
          </dl>
          <div class="student-record-bio" data-student-bio hidden><h3>Meta o presentación</h3><p data-student-text="bio"></p></div>
        </div>
      </section>
      <section class="student-progress" aria-labelledby="studentProgressTitle">
        <header><h2 id="studentProgressTitle">Avance académico</h2>${plans ? `<button type="button" class="btn ghost" data-action="nav" data-view="prog">Ver mi progreso ${ic('arrow')}</button>` : ''}</header>
        ${plans ? `<div class="student-plans">${plans}</div>` : `<div class="student-plan student-plan-empty"><p>Carga una malla para ver el avance de tu carrera.</p><button type="button" class="btn primary" data-action="nav" data-view="inicio">${ic('upload')} Cargar plan</button></div>`}
      </section>
    </div>`;
  }

  function viewInicio() {
    const cs=list(),has=cs.length,overview=homeAcademicOverview();
    return `
    <section class="ra-home-hero">
      <div class="ra-home-copy">
        <h2>Tu carrera,<br> <span>semestre a semestre.</span></h2>
        <p>Consulta tu malla, organiza tu horario y descubre qué materias puedes cursar.</p>
        <div class="ra-home-actions">
          <button class="btn primary ra-home-primary" data-action="${has?'nav':'pick'}" ${has?'data-view="plan"':'data-i="0"'}>${ic(has?'grid':'upload')}${has?'Ver mi malla':'Cargar mi plan'}${ic('arrow')}</button>
          <button class="btn ghost" data-action="${has?'nav':'demo'}" ${has?'data-view="recom"':''}>${ic(has?'calendar':'book')}${has?'Próximo semestre':'Explorar ejemplo'}</button>
        </div>
        <button type="button" class="grad-home-link" data-action="nav" data-view="graduacion">${ic('cap')}<span>Camino a graduación</span>${ic('arrow-right')}</button>
        <p class="ra-home-footnote">${ic('lock')} Tu avance se guarda en este navegador.</p>
      </div>
      <aside class="ra-home-summary" aria-labelledby="homeSummaryTitle">
        <header><span class="route-summary-icon">${ic('chart')}</span><h3 id="homeSummaryTitle">Avance académico</h3></header>
        <div class="route-summary-progress">
          ${ring(overview.pct / 100, 96, 8)}
          <div><strong>${overview.approved} de ${overview.total}</strong><p>materias aprobadas</p>${has?'':'<small>Agrega un plan para registrar tu avance.</small>'}</div>
        </div>
        <div class="ra-home-mini-grid">
          <div><b>${overview.available}</b><span>Disponibles</span></div>
          <div><b>${overview.shared}</b><span>Compartidas</span></div>
        </div>
        <button class="ra-home-summary-link" data-action="nav" data-view="prog">Ver mi progreso ${ic('arrow')}</button>
      </aside>
    </section>

    <nav class="home-quick-actions" aria-label="Accesos rápidos académicos">
      <button type="button" data-action="nav" data-view="req"><span class="hq-icon">${ic('route')}</span><span><b>Requisitos</b><small>Consulta los prerrequisitos</small></span>${ic('arrow-right')}</button>
      <button type="button" data-action="nav" data-view="notas"><span class="hq-icon">${ic('grade')}</span><span><b>Mis calificaciones</b><small>Parciales y menciones</small></span>${ic('arrow-right')}</button>
      <button type="button" data-action="nav" data-view="horario"><span class="hq-icon">${ic('calendar')}</span><span><b>Horario semanal</b><small>Organiza tus clases</small></span>${ic('arrow-right')}</button>
      <button type="button" data-action="nav" data-view="shared"><span class="hq-icon">${ic('link')}</span><span><b>Comparar planes</b><small>Materias compartidas</small></span>${ic('arrow-right')}</button>
    </nav>

    <div class="section-heading route-plans-heading">
      <div><h3>Mis planes de estudio</h3><p>Carga una carrera o compara hasta dos.</p></div>
    </div>
    <div class="slots">${slot(0)}${slot(1)}</div>
    ${renderOfficialCatalog()}

    <div class="tip">${ic('info')}<div><b>Importación inteligente:</b> carga tu plan académico en PDF. Si el documento no se detecta correctamente, también puedes pegar el texto o crear la malla manualmente.</div></div>`;
  }

  function slot(i) {
    const c = state.careers[i];
    if (ui.loading[i]) {
      return `<div class="slot loading"><div class="spinner"></div><b>Analizando PDF…</b><span>Detectando asignaturas, semestres y requisitos</span></div>`;
    }
    if (c) {
      const s = stats(c);
      return `<div class="slot filled">
        <div class="slot-head">${careerIcon(c)}
          <input class="slot-name" value="${esc(c.name)}" data-rename="${i}" aria-label="Nombre de la carrera">
          ${ic('edit', 'muted')}</div>
        <div class="slot-file">${ic('file')}<span>${esc(c.fileName || 'Plan creado manualmente')}</span></div>
        <div class="slot-stats">
          <div><b>${s.total}</b><span>clases</span></div>
          <div><b>${semCount(c)}</b><span>semestres</span></div>
          <div><b>${s.credits || '—'}</b><span>créditos</span></div>
          <div><b>${Math.round(s.pct * 100)}%</b><span>avance</span></div>
        </div>
        <div class="bar"><i style="width:${s.pct * 100}%"></i></div>
        <div class="slot-actions">
          <button class="btn primary" data-action="open-plan" data-i="${i}">${ic('grid')}Ver malla</button>
          ${catalogForCareer(c) ? `<button class="btn uam-catalog-slot-pdf" data-action="catalog-pdf" data-catalog="${esc(catalogForCareer(c).id)}" title="Ver PDF original de ${esc(c.name)}">${ic('file')} PDF</button>` : ''}
          <button class="btn ghost" data-action="pick" data-i="${i}">${ic('upload')}Reemplazar</button>
          <button class="btn ghost danger" data-action="remove-career" data-i="${i}" aria-label="Quitar carrera">${ic('trash')}</button>
        </div></div>`;
    }
    return `<div class="slot empty-slot">
      <div class="slot-head">${ic('book')}
        <input class="slot-name" id="cname${i}" aria-label="${i ? 'Nombre del segundo plan' : 'Nombre del primer plan'}" placeholder="${i ? 'Segunda carrera (opcional)' : 'Nombre de tu carrera'}" value="${esc(ui.pendingNames[i])}" data-pending="${i}"></div>
      <button type="button" class="drop" data-action="pick" data-i="${i}" data-drop="${i}">
        <span class="drop-ic">${ic('upload')}</span>
        <b>Seleccionar PDF</b><span>También puedes arrastrarlo aquí</span>
      </button>
      <div class="slot-alt"><button class="link" data-action="paste" data-i="${i}">${ic('clip')}Pegar texto</button>
      <button class="link" data-action="manual" data-i="${i}">${ic('plus')}Crear manualmente</button></div>
      </div>`;
  }

  function viewPlan() {
    const c = cur();
    if (!c) return emptyState('Aún no hay una malla cargada', 'Sube el PDF de tu plan académico o crea tu malla manualmente para comenzar.');
    const ci = activeIdx();
    const shared = sharedKeys();
    const s = stats(c);
    const q = (ui.search || '').trim().toLowerCase();
    const f = state.filter;
    const n = semCount(c);
    const completedSemesters = Array.from({ length:n }, (_,idx) => idx+1).filter(sem => {
      const all = c.courses.filter(x => (x.semester || 1) === sem);
      return all.length && all.every(x => isTaken(x.key));
    }).length;
    const nextAvailable = c.courses.filter(x => statusOf(x) === 'available').length;
    const filt = [['all', 'Todas', s.total], ['taken', 'Aprobadas', s.taken], ['available', 'Disponibles', s.available], ['blocked', 'Bloqueadas', s.blocked]];

    let cols = '';
    for (let sem = 1; sem <= n; sem++) {
      const all = c.courses.filter(x => (x.semester || 1) === sem);
      const shown = all.filter(x => (f === 'all' || statusOf(x) === f) &&
        (!q || x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q) || x.key.toLowerCase().includes(keyOf(q).toLowerCase()) || [electiveChoiceFor(x,c)?.name,electiveChoiceFor(x,c)?.code].some(value=>value?.toLowerCase().includes(q))));
      const done = all.filter(x => isTaken(x.key)).length;
      const credits = all.reduce((a, x) => a + cr(x), 0);
      const pct = all.length ? Math.round(done / all.length * 100) : 0;
      const complete = all.length && done === all.length;
      cols += `<section class="sem curriculum-sem ${complete ? 'complete' : ''}">
        <div class="sem-head curriculum-sem-head">
          <div class="sem-identity"><div><h3>Semestre ${sem}</h3><small>${all.length} asignaturas${credits ? ` · ${credits} créditos` : ''}</small></div></div>
          <div class="sem-progress-badge"><b>${done}/${all.length}</b><span>aprobadas</span></div>
        </div>
        <div class="semester-track" role="progressbar" aria-label="Avance del semestre ${sem}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
        ${all.length ? `<button class="semester-primary-action ${complete ? 'on' : ''}" data-action="sem-all" data-sem="${sem}" title="${complete ? 'Desmarcar todas las materias de este semestre' : 'Marcar todas las materias de este semestre como aprobadas'}">${ic('check')}<span>${complete ? 'Semestre completo · Desmarcar todo' : 'Aprobar semestre completo'}</span></button>` : ''}
        <div class="sem-body curriculum-sem-body">
          ${shown.map(x => courseCard(x, c, ci, shared)).join('') || `<div class="sem-empty">${all.length ? 'No hay materias con este filtro' : 'Semestre vacío'}</div>`}
          ${ui.editMode ? `<button class="add-btn curriculum-add" data-action="add" data-sem="${sem}">${ic('plus')}Agregar asignatura</button>` : ''}
        </div>
      </section>`;
    }

    return `
      <section class="curriculum-hero">
        <div class="curriculum-hero-copy">
          <h2 class="route-career-line">${careerIcon(c)}<span>${esc(c.name)}</span></h2>
          <p>${n} semestres · ${s.total} asignaturas${s.credits ? ` · ${s.credits} créditos` : ''}</p>
          <div class="curriculum-actions">
            <button class="btn primary" data-action="pick" data-i="${ci}">${ic('upload')}Actualizar PDF</button>
            <button class="btn ghost ${ui.editMode ? 'active' : ''}" data-action="edit-mode">${ic('edit')}${ui.editMode ? 'Terminar edición' : 'Editar malla'}</button>
          </div>
        </div>
        <div class="curriculum-score">
          ${ring(s.pct, 86, 7)}
          <div class="score-copy"><b>${s.taken} de ${s.total}</b><span>asignaturas aprobadas</span></div>
        </div>
      </section>

      <section class="curriculum-metrics">
        <article class="route-metric-approved"><span class="metric-icon">${ic('check')}</span><div><b>${s.taken}</b><small>Aprobadas</small></div></article>
        <article class="route-metric-available"><span class="metric-icon">${ic('unlock')}</span><div><b>${nextAvailable}</b><small>Disponibles ahora</small></div></article>
        <article class="route-metric-blocked"><span class="metric-icon">${ic('lock')}</span><div><b>${s.blocked}</b><small>Bloqueadas</small></div></article>
        <article><span class="metric-icon">${ic('grid')}</span><div><b>${completedSemesters}/${n}</b><small>Semestres completos</small></div></article>
      </section>

      ${ui.recentUnlocks.length ? `<section class="unlock-banner">
        <span class="unlock-banner-icon">${ic('unlock')}</span>
        <div class="unlock-banner-copy"><b>${ui.recentUnlocks.length === 1 ? 'Nueva materia desbloqueada' : `${ui.recentUnlocks.length} materias desbloqueadas`}</b><p>Al completar ${ui.unlockSource ? `<strong>${esc(nameOf(ui.unlockSource))}</strong>` : 'el semestre'}, ahora puedes cursar:</p></div>
        <div class="unlock-banner-courses">${ui.recentUnlocks.map(k => { const u = findCourse(k, c); return u ? `<button data-action="jump-course" data-key="${esc(u.key)}" data-c="${ci}" title="Ir a ${esc(u.name)}"><span>→</span><b>${esc(u.code)}</b><small>${esc(u.name)}</small></button>` : ''; }).join('')}</div>
      </section>` : ''}

      <section class="curriculum-toolbar" aria-label="Carreras, búsqueda y filtros de materias">
        <div class="curriculum-toolbar-left">${careerSwitch()}</div>
        <div class="curriculum-toolbar-controls">
          <label class="search curriculum-search">${ic('search')}<input id="search" aria-label="Buscar asignatura o código" placeholder="Buscar asignatura o código…" value="${esc(ui.search)}"></label>
          <div class="curriculum-filters" role="group" aria-label="Estado de las materias">${filt.map(([k,l,num]) => `<button class="filter ${f === k ? 'on' : ''} f-${k}" data-action="filter" data-f="${k}" aria-pressed="${f===k}"><b>${l}</b><span>${num}</span></button>`).join('')}</div>
        </div>
      </section>

      <div class="curriculum-legend"><span><i class="lg taken"></i>Aprobada</span><span><i class="lg available"></i>Disponible</span><span><i class="lg blocked"></i>Bloqueada</span><span><i class="lg current"></i>Cursando</span>${shared.size ? '<span><i class="lg shared"></i>Compartida</span>' : ''}</div>
      <div class="sem-grid curriculum-grid">${cols}</div>`;
  }

  function courseCard(x, c, ci, shared) {
    const st = statusOf(x, ci);
    const gr = getGradeInfo(x.key, ci);
    const { roots } = st === 'blocked' ? chain(x, c) : { roots:[] };
    const approved = st === 'taken';
    const stateLabel = statusLabel[st];
    const gradeBadge = gr.avg !== null ? `<span class="c-grade-pill ${gr.status}">${gr.avg}%</span>` : '';
    const justUnlocked = ui.recentUnlocks.includes(x.key);
    const studying = currentCourseKeys(ci).includes(x.key);
    const directUnlocked = st === 'taken' ? unlocks(x.key, c).filter(y => y.prereqs.length && statusOf(y) === 'available') : [];
    return `<article class="course curriculum-course st-${st} ${shared.has(x.key) ? 'is-shared' : ''} ${justUnlocked ? 'just-unlocked' : ''}" data-action="open" data-key="${esc(x.key)}" data-course-anchor="${esc(x.key)}" data-c="${ci}" tabindex="0">
      <div class="course-status-rail"></div>
      <button type="button" class="check" data-action="toggle" data-key="${esc(x.key)}"
        aria-label="${esc('Aprobación de ' + x.name)}" aria-pressed="${approved}"
        title="${approved ? 'Quitar aprobación' : 'Marcar como aprobada'}">${approved ? ic('check') : ''}</button>
      <div class="c-body">
        <div class="c-top"><span class="code">${esc(x.code)}</span><span class="course-state-label">${ic(st === 'taken' ? 'check' : st === 'available' ? 'unlock' : 'lock')}${stateLabel}</span>${shared.has(x.key) ? `<span class="tag-shared" title="Cuenta para ambas carreras">${ic('link')}</span>` : ''}${gradeBadge}</div>
        <h4 class="c-name">${esc(x.name)}</h4>
        ${electiveControl(x,c,ci)}
        <label class="course-studying ${studying?'is-current':''}" title="Marcar como cursando en esta carrera">
          <input type="checkbox" data-current-course="${esc(x.key)}" data-c="${ci}" ${studying?'checked':''} aria-label="Estoy cursando ${esc(x.name)} en ${esc(c.name)}">
          <span>${studying?'Cursando ahora':'Marcar como cursando'}</span>
        </label>
        <div class="course-metadata">
          ${x.credits ? `<span class="cr" title="${x.credits} créditos">${x.credits} créditos</span>` : ''}
          ${x.prereqs.length ? `<div class="c-req"><span class="req-label">Requiere:</span>${x.prereqs.map(k => `<span class="mini ${isTaken(k) ? 'ok' : ''}" title="${esc(codeOf(k))}">${esc(nameOf(k))}</span>`).join('')}</div>` : `<div class="c-req"><span class="none">Sin requisitos</span></div>`}
        </div>
        ${st === 'blocked' && roots.length ? `<div class="c-hint">${ic('route')}<span>Primero: <b>${roots.slice(0,3).map(r => esc(r.code)).join(', ')}</b></span></div>` : ''}
        ${justUnlocked ? `<div class="unlock-flow fresh"><span class="unlock-arrow">→</span><span><b>Recién desbloqueada</b> porque ya cumpliste sus requisitos.</span></div>` : ''}
        ${directUnlocked.length ? `<div class="unlock-flow achieved"><div class="unlock-links"><span class="unlock-links-label">Desbloqueó</span>${directUnlocked.map(y => `<button class="unlock-jump" data-action="jump-course" data-key="${esc(y.key)}" data-c="${ci}" title="Ir a ${esc(y.name)}"><span class="unlock-arrow">→</span><span>${esc(y.name)}</span></button>`).join('')}</div></div>` : ''}
      </div>
      <span class="course-open-arrow">›</span>
      ${ui.editMode ? `<div class="c-edit"><button class="icon-btn sm" data-action="edit" data-key="${esc(x.key)}" data-c="${ci}" title="Editar">${ic('edit')}</button><button class="icon-btn sm" data-action="del" data-key="${esc(x.key)}" data-c="${ci}" title="Eliminar">${ic('trash')}</button></div>` : ''}
    </article>`;
  }

  /* ---------------- Reconocimientos académicos UAM ---------------- */
  // Reglamento UAM 2023, artículos 16, 44, 46 y 47.
  // El CRA oficial contempla el historial académico, convalidaciones internas y
  // demás condiciones verificadas por Registro Académico.
  const HONOR_RULES = {
    official2023: { label:'Reglamento UAM 2023 (oficial)', cum:93, magna:96 },
    alternative: { label:'Escala alternativa (sin vigencia verificada)', cum:90, magna:94 }
  };
  const HONOR_URL = 'https://uam.edu.ni/wp-content/uploads/2023/02/REGLAMENTO-ACADEMICO-2023-OFICIAL.pdf';
  function estimatedCra(c, ci = Math.max(0, state.careers.indexOf(c))) {
    let sum = 0, credits = 0, graded = 0, missingCredits = 0;
    for (const x of c.courses) {
      const g = getGradeInfo(x.key, ci);
      if (!g.isFinal || (g.fromHistory && g.history?.condition === 'CNV' && !state.includeCnvCra)) continue;
      const academicCredits = Number(x.credits);
      if (!Number.isFinite(academicCredits) || academicCredits <= 0) {
        missingCredits++;
        continue;
      }
      // No redondear cada nota antes de ponderar.
      sum += (g.fromHistory ? g.avg : g.sum / 3) * academicCredits;
      credits += academicCredits;
      graded++;
    }
    return {
      value: credits ? sum / credits : null,
      credits, graded, missingCredits,
      totalCourses: c.courses.length
    };
  }
  function honorClassification(value, rules) {
    if (value === null) return { level:'Sin datos', tier:'none', next:rules.cum };
    if (value >= 98) return { level:'Summa Cum Laude', tier:'summa', next:null };
    if (value >= rules.magna) return { level:'Magna Cum Laude', tier:'magna', next:98 };
    if (value >= rules.cum) return { level:'Cum Laude', tier:'cum', next:rules.magna };
    return { level:'Sin mención estimada', tier:'none', next:rules.cum };
  }
  function honorsPanel(c) {
    const scale = HONOR_RULES[state.honorScale] || HONOR_RULES.official2023;
    const cra = estimatedCra(c);
    const result = honorClassification(cra.value, scale);
    const fmt = x => x === null ? '—' : x.toFixed(2);
    const tiers = [
      {title:'Cum Laude', min:scale.cum, max:(scale.magna-.01).toFixed(2), tier:'cum', note:'Distinción académica'},
      {title:'Magna Cum Laude', min:scale.magna, max:'97.99', tier:'magna', note:'Alto reconocimiento'},
      {title:'Summa Cum Laude', min:98, max:'100', tier:'summa', note:'Máxima distinción'}
    ];
    let progressLabel = '';
    if (cra.value === null) {
      progressLabel = 'Registra tres parciales o importa notas finales oficiales con créditos para comenzar la estimación.';
    } else if (result.next !== null) {
      progressLabel = `A ${fmt(Math.max(0,result.next-cra.value))} puntos del siguiente rango (${result.next}).`;
    } else {
      progressLabel = 'El promedio estimado se encuentra en el rango académico más alto.';
    }
    return `<section class="honors-panel" aria-label="Estimación de menciones honoríficas UAM">
      <div class="honors-top">
        <div><span class="honors-kicker">${ic('star')} RECONOCIMIENTOS ACADÉMICOS</span>
          <h3>Menciones honoríficas UAM</h3>
          <p>Consulta tu avance hacia las distinciones de graduación según el CRA. Las notas CNV se excluyen del cálculo salvo que lo autorices.</p></div>
        <label class="honors-scale-label" for="honorScale">Escala de referencia
          <select id="honorScale" aria-label="Seleccionar escala de menciones honoríficas">
            <option value="official2023" ${state.honorScale==='official2023'?'selected':''}>Reglamento 2023 · oficial</option>
            <option value="alternative" ${state.honorScale==='alternative'?'selected':''}>Escala alternativa · por verificar</option>
          </select>
        </label>
      </div>
      <div class="honors-overview">
        <div class="honors-cra-summary"><small>CRA estimado con notas completas, historial y créditos conocidos</small>
          <strong>${fmt(cra.value)}<span> / 100</span></strong>
          <span class="honors-rank ${result.tier}">${ic('star')}${esc(result.level)}</span>
          <div class="honors-meter" role="progressbar" aria-label="CRA estimado" aria-valuenow="${cra.value===null?0:Math.round(cra.value)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${cra.value===null?0:Math.min(100,Math.max(0,cra.value)).toFixed(2)}%"></i></div>
          <p>${progressLabel}</p></div>
        <div class="honors-cra-meta"><div><b>${cra.graded}</b><span>Asignaturas incluidas</span></div>
          <div><b>${cra.credits}</b><span>Créditos ponderados</span></div>
          <div><b>${cra.missingCredits}</b><span>Notas sin créditos válidos</span></div></div>
      </div>
      <div class="honors-tiers">${tiers.map(t=>`<article class="honors-tier ${t.tier} ${result.tier===t.tier?'current':''}">
        <span class="honors-tier-mark">${ic(t.tier==='summa'?'star':'cap')}</span>
        <div><h4>${t.title}</h4><p>${t.note}</p></div><strong>${t.min}–${t.max}</strong>
        ${result.tier===t.tier?'<span class="honors-current">Rango estimado actual</span>':''}</article>`).join('')}</div>
      <div class="honors-conditions">
        <p><b>Importante:</b> este resultado es una <b>estimación parcial</b>, no una mención concedida ni un CRA oficial. El CRA acumulativo de la UAM pondera las calificaciones por créditos; debe considerar el historial institucional pertinente y sus convalidaciones. Además, las menciones exigen culminar la carrera y cumplir condiciones académicas y disciplinarias: las sanciones y haber reprobado dos o más asignaturas pueden excluir del reconocimiento (art. 47).</p>
        ${state.honorScale==='alternative'?'<p><b>Escala alternativa:</b> rangos facilitados por el usuario; su vigencia no se ha verificado en el reglamento UAM 2023.</p>':''}
        <a href="${HONOR_URL}" target="_blank" rel="noopener noreferrer">${ic('file')}Consultar Reglamento Académico UAM 2023 (arts. 16, 44, 46 y 47) ↗</a>
      </div>
    </section>`;
  }


  function gradeCareerSelector() {
    const entries = list();
    if (!entries.length) return '';
    return `<section class="grade-career-zone" aria-label="Calificaciones por carrera">
      <div class="grade-career-intro"><div><span class="grade-career-eyebrow">${ic('cap')} DOS LIBRETAS INDEPENDIENTES</span><h3>Calificaciones por carrera</h3><p>Selecciona una carrera. Sus parciales, promedio y CRA se calculan por separado.</p></div>
      <span class="grade-career-lock">${ic('check')} No se mezclan las notas</span></div>
      <div class="grade-career-tabs" role="group" aria-label="Seleccionar carrera para ver calificaciones">
        ${entries.map(({c,i})=>{
          const cra=estimatedCra(c,i);
          const completed=c.courses.filter(x=>getGradeInfo(x.key,i).isFinal).length;
          const current=i===activeIdx();
          return `<button type="button" class="grade-career-tab ${current?'is-active':''}" data-action="grade-career" data-i="${i}" aria-pressed="${current?'true':'false'}" title="Ver notas de ${esc(c.name)}">
             ${careerIcon(c)}
             <span class="grade-career-name"><strong>${esc(c.name)}</strong><small>${esc(c.planCode||'Plan académico')} · ${completed} de ${c.courses.length} materias con nota</small></span>
             <span class="grade-career-score"><b>${cra.value===null?'—':cra.value.toFixed(2)}</b><small>CRA estimado</small></span>
             <span class="grade-career-check">${ic('check')}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="grade-career-notice">${ic('info')} Los parciales se registran por carrera. Las materias equivalentes aprobadas en el historial PDF pueden aparecer con nota final convalidada (CNV) en el otro plan.</div>
    </section>`;
  }

  /* ---------------- VISTA: REGISTRO DE NOTAS (PROMEDIO 100/3) ---------------- */
  /* ---------------- Importación de historial académico UAM (PDF) ---------------- */
  function historyNormalize(s) {
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toUpperCase().replace(/[^A-Z0-9+]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function historyUploadPanel(c) {
    const ci=activeIdx(), record=careerRecord(ci), entries=Object.values(record.history||{});
    const withGrade=entries.filter(x=>x.grade!==null).length;
    const unmapped=record.unmappedHistory||[];
    const baseline=historicalGradeBaseline(ci);
    const pending=c.courses.filter(x=>usesHistoricalEstimate(getGradeInfo(x.key,ci))).length;
    return `<section class="history-upload" aria-label="Importar historial de calificaciones">
      <div class="history-upload-main"><span class="history-upload-icon">${ic('file')}</span><div><span class="history-kicker">IMPORTACIÓN AUTOMÁTICA DE NOTAS</span>
      <h3>Tu recorrido histórico de calificaciones</h3>
      <p>Sube el PDF <b>Reporte de Vida Académica</b> de la universidad. La app identificará notas finales y condiciones por período en <b>${esc(c.name)}</b>, sin inventar los tres parciales.</p>
      <div class="history-upload-facts"><span>${entries.length} registros históricos</span><span>${withGrade} notas finales</span><span>${unmapped.length} registros sin vincular</span><span>Datos guardados solo en este dispositivo</span></div></div></div>
      <div class="history-upload-actions"><button type="button" class="btn primary" data-action="history-pick">${ic('upload')} Subir historial PDF</button>
      <label class="history-checkbox"><input id="includeCnvCra" type="checkbox" ${state.includeCnvCra?'checked':''}> Incluir notas CNV en CRA <small>(estimación)</small></label></div>
      <p class="history-upload-hint">Se revisan las coincidencias antes de importar. El plan del PDF conserva la condición original de cada registro. Si tienes dos planes cargados, las materias aprobadas que coincidan por código o nombre se registran también como CNV en el otro plan.</p>
      ${baseline !== null ? `<p class="history-upload-hint history-estimate-reference"><b>${gradeNumber.format(baseline)}% de promedio en la hoja de vida</b> · Ponderado por créditos.${pending ? ` Se usa como referencia para estimar ${pending === 1 ? '1 materia CA/COG sin nota' : pending + ' materias CA/COG sin nota'}.` : ''}</p>` : ''}
      <input id="historyPdfFile" type="file" accept=".pdf,application/pdf" hidden>
      ${unmapped.length?`<details class="history-unmapped"><summary>${ic('info')} Ver ${unmapped.length} registros del PDF sin materia equivalente</summary><div class="history-unmapped-list">${unmapped.map(r=>`<div><b>${esc(r.name)}</b><span>${esc(r.period)} · ${r.grade===null?'Sin nota':r.grade+'/100'} · ${esc(r.condition)}</span></div>`).join('')}</div></details>`:''}
    </section>`;
  }
  function historyAutoMatches(rows, c) {
    return rows.map(r=>{
      const byCode = r.code ? c.courses.filter(x => keyOf(electiveChoiceFor(x,c)?.code || x.code || x.key) === keyOf(r.code)) : [];
      if (byCode.length) return byCode.length === 1 ? byCode[0].key : '';
      const comparable = n => historyNormalize(n).replace(/(?:\s+[A-Z]{2,8}\d{3,4})+$/,'').trim();
      const name = comparable(r.name);
      const matches = c.courses.filter(x => name && comparable(displayCourseName(x,c)) === name);
      if (matches.length === 1) return matches[0].key;
      const byCredits = matches.filter(x => r.credits && Number(x.credits) === Number(r.credits));
      return byCredits.length === 1 ? byCredits[0].key : '';
    });
  }
  function parseHistoryPages(pages) {
    const rows=[];let period='', program='', degree='', reportRecognized=false;
    for(const page of pages) for(const row of page.rows){
      const parts=row.items.map(i=>({x:Number(i.x),str:String(i.str||'').trim()})).filter(i=>i.str).sort((a,b)=>a.x-b.x);
      const text=parts.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      if(/REPORTE\s+DE\s+VIDA\s+ACADEMICA/i.test(historyNormalize(text)))reportRecognized=true;
      const sourceText=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      const lev=/NIVEL\s*:\s*([A-Z0-9-]+)\s*(?:-|–)\s*(.+)/i.exec(sourceText);
      if(lev){program=lev[1];degree=lev[2];}
      const per=/PERIODO\s+(20\d\d\s*[-/]\s*[1234])/i.exec(sourceText);
      if(per){period=per[1].replace(/\s/g,'').replace('/','-');continue;}
      if(!period)continue;
      const title=parts.filter(i=>i.x<325).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      const creditsRaw=parts.filter(i=>i.x>=325 && i.x<390).map(i=>i.str).join('').trim();
      const gradeRaw=parts.filter(i=>i.x>=390 && i.x<447).map(i=>i.str).join('').trim();
      const cond=parts.filter(i=>i.x>=447).map(i=>i.str).join(' ').trim().toUpperCase();
      const credits=Number(creditsRaw), grade=gradeRaw===''?null:Number(gradeRaw);
      if(!title || !/^[A-Z]{2,4}$/.test(cond) || !Number.isInteger(credits) || credits<1 || credits>15 ||
         (grade!==null && (!Number.isFinite(grade) || grade<0 || grade>100)))continue;
      const printed = /^([A-Z]{2,8}-?\d{3,4}[A-Z]?)\s*[-:–]?\s+(.+)$/i.exec(title);
      rows.push({name:printed?.[2] || title,code:printed?.[1] || '',credits,grade,condition:cond,period});
    }
    if(!reportRecognized || !rows.length || !program)throw new Error('Este PDF no corresponde al formato reconocido «Reporte de Vida Académica» o no contiene notas legibles.');
    return {program,degree,rows};
  }
  function historyTargetIsCompatible(report,c) {
    const byCode=String(c.planCode||'').toUpperCase().match(/(?:^|[- ])([A-Z]{3,5}\d{2})\b/);
    if(byCode && report.program && byCode[1]!==report.program)return false;
    const planName=historyNormalize(c.name), degree=historyNormalize(report.degree);
    const overlap=degree.split(' ').filter(w=>w.length>4 && planName.includes(w));
    return !degree || overlap.length>0 || (byCode && byCode[1]===report.program);
  }
  async function handleHistoryPDF(file) {
    if(!file)return;
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')return toast('Debes seleccionar un archivo PDF.','err');
    if(file.size>15*1024*1024)return toast('El PDF supera el máximo de 15 MB.','err');
    try{
      toast('Analizando el historial académico...');
      const report=parseHistoryPages(await PlanParser.extractPages(file));
      const opts=list().filter(({c})=>historyTargetIsCompatible(report,c));
      if(!opts.length){toast('Ningún plan cargado coincide con la carrera del reporte. Carga primero la malla correspondiente.','err');return;}
      const target=opts.some(o=>o.i===activeIdx())?activeIdx():opts[0].i;
      ui.historyImport={report,target,matches:historyAutoMatches(report.rows,state.careers[target]),fileName:file.name};
      showHistoryPreview();
    }catch(err){console.warn('Historial académico:',err);toast(err.message||'No se pudo leer el historial PDF.','err');}
  }
  function historyRowOptions(r,c,selected) {
    return `<option value="">— Solo historial (sin vincular a la malla) —</option>${[...c.courses].sort((a,b)=>(a.semester||1)-(b.semester||1)||a.name.localeCompare(b.name,'es')).map(x=>`<option value="${esc(x.key)}" ${x.key===selected?'selected':''}>${esc(x.semester||1)}° · ${esc(x.name)}${x.credits?' · '+Number(x.credits)+' cr':''}</option>`).join('')}`;
  }
  function showHistoryPreview() {
    const data=ui.historyImport;if(!data)return;
    const {report,target,matches}=data,c=state.careers[target];
    const ready=matches.filter(Boolean).length;
    const withGrade=report.rows.filter(r=>r.grade!==null).length;
    const unresolved=report.rows.length-ready;
    const existing=careerRecord(target).history;
    const replaces=matches.filter(key=>key && existing[key]).length;
    const other=state.careers[1-target];
    const content=`${modalHead('Revisar historial académico','Comprueba los datos antes de guardarlos en la libreta correcta')}
      <div class="m-body"><div class="history-preview-head"><div><span>Plan detectado en PDF</span><strong>${esc(report.degree)}</strong><small>Programa ${esc(report.program)} · ${report.rows.length} filas · ${withGrade} con nota numérica</small></div><label>Importar en la carrera<select id="historyTarget">${list().filter(({c})=>historyTargetIsCompatible(report,c)).map(({c,i})=>`<option value="${i}" ${i===target?'selected':''}>${esc(c.name)} (${esc(c.planCode||'sin código')})</option>`).join('')}</select></label></div>
      <div class="history-import-metrics"><span><b>${ready}</b> asignaturas identificadas</span><span><b>${unresolved}</b> por revisar</span><span><b>${replaces}</b> registros históricos existentes</span></div>
      <div class="note">${ic('info')}<span>Se importan <b>notas finales</b>. Puedes ajustar la asignatura de tu malla antes de confirmar.${other ? ` Las materias con condición APR o CNV y nota de 70 o más se convalidan en <b>${esc(other.name)}</b> si coincide el código o el nombre identifica una sola materia. Se conservan los registros propios y los parciales del otro plan.` : ''}</span></div>
      <div class="history-preview-table"><table><thead><tr><th>Período</th><th>Asignatura en reporte</th><th>Cr.</th><th>Final</th><th>Cond.</th><th>Asignatura de tu malla</th></tr></thead><tbody>
      ${report.rows.map((r,j)=>`<tr><td>${esc(r.period)}</td><td class="history-reported">${esc(r.name)}</td><td>${r.credits}</td><td><b>${r.grade===null?'—':r.grade}</b></td><td><span class="history-cond">${esc(r.condition)}</span></td><td><select data-history-row="${j}" aria-label="Asignatura equivalente para ${esc(r.name)}">${historyRowOptions(r,c,matches[j])}</select>${!matches[j]?'<small class="history-unmatched">Revisar coincidencia</small>':''}</td></tr>`).join('')}
      </tbody></table></div>
      <label class="history-confirm"><input type="checkbox" id="historyReplace" ${replaces?'':'checked'}> Actualizar registros históricos ya existentes para las materias seleccionadas</label>
      <small class="history-privacy">La lectura se realiza en tu navegador. No guardamos el documento, el número de carné ni datos personales del PDF: solo materia, período, nota y condición.</small></div>
      <div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" data-action="history-confirm">${ic('check')} Importar materias seleccionadas</button></div>`;
    openModal(content,true);
  }
  function approvedHistory(entry) {
    return entry && entry.grade !== null && Number(entry.grade) >= PASS_GRADE &&
      (entry.condition === 'APR' || entry.condition === 'CNV');
  }

  function hasThreePartials(record, key) {
    return (record.grades[key] || []).filter(value => value != null && value !== '').length === 3;
  }

  function saveHistoryReport() {
    const data=ui.historyImport;if(!data)return;
    const {report,target}=data,c=state.careers[target];
    if(!c||!historyTargetIsCompatible(report,c))return toast('La carrera seleccionada no coincide con este reporte.','err');
    const record=careerRecord(target),replace=!!document.getElementById('historyReplace')?.checked;
    const selected=[...document.querySelectorAll('[data-history-row]')].map(x=>({j:Number(x.dataset.historyRow),key:x.value})).filter(x=>x.key);
    const duplicates=selected.map(x=>x.key).filter((key,i,arr)=>arr.indexOf(key)!==i);
    if(duplicates.length)return toast('Hay dos filas asignadas a la misma materia. Revisa las equivalencias.','err');
    if(!selected.length&&!report.rows.length)return toast('El reporte no contiene registros.','err');
    let imported=0,ignored=0,approved=0,convalidated=0;
    const mappedRows=new Set(selected.map(x=>x.j));
    const transfers=new Map();
    const other=1-target;
    const originPlan=planIdentity(c,target);
    for(const {j,key} of selected){
      const x=c.courses.find(y=>y.key===key),r=report.rows[j];
      if(!x||!r)continue;
      if(record.history[key]&&!replace) {
        ignored++;
      } else {
        record.history[key]={grade:r.grade,credits:r.credits,condition:r.condition,period:r.period,source:'Reporte de Vida Académica',reportedName:r.name};
        if(approvedHistory(record.history[key])&&!hasThreePartials(record,key)){
          record.taken[key]=true;
          approved++;
        }
        imported++;
      }
      const entry=record.history[key];
      if(!state.careers[other]||!approvedHistory(entry)||entry.convalidation)continue;
      const match=equivalentCourseRefs(key,target,{uniqueName:true}).find(ref=>ref.ci===other)?.course;
      if(!match)continue;
      // Si dos materias distintas apuntan a la misma, conservar la libreta de destino.
      transfers.set(match.key,transfers.has(match.key)?null:{key,entry,course:match});
    }

    if(transfers.size){
      const destination=careerRecord(other);
      for(const [key,transfer] of transfers){
        if(!transfer||hasThreePartials(destination,key))continue;
        const previous=destination.history[key];
        const origin=previous?.convalidation;
        if(previous&&(!replace||origin?.plan!==originPlan||origin?.key!==transfer.key))continue;
        const {entry,course}=transfer;
        destination.history[key]={
          ...entry,credits:cr(course)||entry.credits,condition:'CNV',
          convalidation:{plan:originPlan,key:transfer.key,originalCondition:entry.condition}
        };
        destination.taken[key]=true;
        convalidated++;
      }
    }
    // Conservar registros externos sin inventar asignaturas en la malla.
    const extras=report.rows.filter((r,j)=>!mappedRows.has(j));
    const keyFor=r=>`${historyNormalize(r.name)}|${r.period}|${r.condition}`;
    const untouched=(record.unmappedHistory||[]).filter(r=>!report.rows.some(next=>keyFor(next)===keyFor(r)));
    record.unmappedHistory=[...untouched,...extras].map(r=>({name:r.name,credits:r.credits,grade:r.grade,period:r.period,condition:r.condition}));
    if(!imported&&!convalidated&&!extras.length){return toast('No se importaron nuevas notas. Revisa la opción de actualizar registros existentes.','err');}
    ui.historyImport=null;closeModal();state.active=target;syncCareerData();ui.gradeSem='all';ui.gradeSearch='';render();
    toast(`${imported} registros importados · ${approved} aprobadas en el plan del PDF${convalidated?` · ${convalidated} CNV en ${state.careers[other].name}`:''}${ignored?` · ${ignored} registros existentes conservados`:''}`);
  }

  function gradeTotalsMarkup(c) {
    let totalGraded=0,sumGraded=0,sumGradedCredits=0,sumWeighted=0,passedCount=0,convocatoriaCount=0,failedCount=0,inProgressCount=0;
    c.courses.forEach(x=>{const g=getGradeInfo(x.key);if(g.isFinal){totalGraded++;sumGraded+=g.avg;const creds=cr(x)||1;sumWeighted+=g.avg*creds;sumGradedCredits+=creds;if(g.status==='passed')passedCount++;else if(g.status==='convocatoria')convocatoriaCount++;else failedCount++;}else if(g.count>0)inProgressCount++;});
    const simpleAvg=totalGraded?Math.round((sumGraded/totalGraded)*10)/10:0;
    const weightedAvg=sumGradedCredits?Math.round((sumWeighted/sumGradedCredits)*10)/10:0;
    return `<div class="kpis" data-grade-totals><div class="kpi dark"><b>${totalGraded?simpleAvg+'%':'—'}</b><span>Promedio general</span></div><div class="kpi"><b>${totalGraded?weightedAvg+'%':'—'}</b><span>Promedio ponderado</span></div><div class="kpi"><b>${passedCount}</b><span>Aprobadas con nota</span></div><div class="kpi convocatoria-kpi"><b>${convocatoriaCount}</b><span>Convocatoria</span></div><div class="kpi"><b>${failedCount}</b><span>Reprobadas (0–59)</span></div><div class="kpi"><b>${inProgressCount}</b><span>En curso</span></div></div>`;
  }

  function semesterGradeSummary(keys) {
    const finished = keys.map(key => getGradeInfo(key)).filter(grade => grade.isFinal);
    const approved = finished.filter(grade => grade.status === 'passed').length;
    const convocatoria = finished.filter(grade => grade.status === 'convocatoria').length;
    const average = finished.length ? roundGrade(finished.reduce((total, grade) => total + grade.avg, 0) / finished.length) : null;
    return `<span>${approved} aprobadas</span>${convocatoria ? `<span class="conv-summary">${convocatoria} convocatoria${convocatoria === 1 ? '' : 's'}</span>` : ''}<span>${average === null ? 'Sin promedio aún' : 'Promedio ' + gradeNumber.format(average) + '%'}</span>`;
  }

  function viewGrades() {
    const c = cur();
    if (!c) return emptyState('Sin plan cargado', 'Carga tu plan de estudios para comenzar a registrar tus calificaciones.') + `<section class="honors-panel honors-empty"><div class="honors-top"><div><span class="honors-kicker">${ic('star')} RECONOCIMIENTOS ACADÉMICOS</span><h3>Menciones honoríficas UAM</h3><p>Según el reglamento 2023: Cum Laude 93–95.99; Magna Cum Laude 96–97.99; Summa Cum Laude 98–100.</p><a href="${HONOR_URL}" target="_blank" rel="noopener noreferrer">Consultar reglamento oficial ↗</a></div></div></section>`;

    const q = (ui.gradeSearch || '').trim().toLowerCase();
    const semFilter = ui.gradeSem || 'all';
    const courses = [...c.courses].filter(x => {
      const matchSem = semFilter === 'all' || (x.semester || 1) === Number(semFilter);
      const matchQ = !q || x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q);
      return matchSem && matchQ;
    }).sort((a,b)=>(a.semester||1)-(b.semester||1)||a.name.localeCompare(b.name,'es'));

    const n=semCount(c), baseline=historicalGradeBaseline(activeIdx());
    const semesters=[...new Set(courses.map(x=>x.semester||1))].sort((a,b)=>a-b);

    const row = x => {
      const g=getGradeInfo(x.key),p=g.p;
      return `<tr class="${g.status==='passed'?'row-passed':g.status==='convocatoria'?'row-convocatoria':g.status==='failed'?'row-failed':''}">
        <td><span class="code">${esc(x.code)}</span></td><td><b class="c-title-link" data-action="open" data-key="${esc(x.key)}">${esc(displayCourseName(x,c))}</b>${g.history ? `<small class="historical-course-mark">${ic('file')} Historial ${esc(g.history.period)} · ${esc(g.history.condition)}</small>` : ''}</td><td>${x.credits?x.credits+' cr':'—'}</td>
        ${[0,1,2].map(i=>`<td class="center"><input type="number" class="grade-input" min="0" max="100" placeholder="—" value="${p[i]!==null?p[i]:''}" data-grade="${esc(x.key)}" data-n="${i}"></td>`).join('')}
        <td class="center" data-grade-result aria-live="polite">${gradeResultMarkup(g, activeIdx(), baseline)}</td><td data-grade-status>${gradeStatusMarkup(g)}</td></tr>`;
    };

    const semesterBlock = sem => {
      const items=courses.filter(x=>(x.semester||1)===sem);
      return `<section class="grade-semester"><div class="grade-semester-head"><div class="grade-semester-title"><span class="grade-semester-number">${String(sem).padStart(2,'0')}</span><div><h4>${sem}° semestre</h4><p>${items.length} asignaturas en esta sección</p></div></div><div class="grade-semester-summary">${semesterGradeSummary(items.map(x=>x.key))}</div></div><div class="table-wrap"><table class="table grade-table"><thead><tr><th>Código</th><th>Asignatura</th><th>Créditos</th><th class="center">Parcial 1</th><th class="center">Parcial 2</th><th class="center">Parcial 3</th><th class="center">Nota final</th><th>Estado / meta de 70</th></tr></thead><tbody>${items.map(row).join('')}</tbody></table></div></section>`;
    };

    return `${gradeCareerSelector()}${historyUploadPanel(c)}<div class="toolbar"><div class="search">${ic('search')}<input id="gradeSearch" placeholder="Buscar clase para calificar…" value="${esc(ui.gradeSearch)}"></div><button class="btn primary grade-sim-launch" data-action="grade-sim">${ic('grade')}Simular nota final</button><div class="grade-opts"><div class="grade-policy-compact"><span class="policy-pass">70+ Aprobado</span><span class="policy-call">60–69 Convocatoria</span><span class="policy-fail">0–59 Reprobado</span></div><label class="config-check"><input type="checkbox" id="autoApprove" ${state.autoApprove?'checked':''}><span>Auto-aprobar al llegar a 70</span></label></div></div>
    ${gradeTotalsMarkup(c)}
    <div class="ra-note-tools"><span>${ic('alert')} Analiza tus parciales y calcula cuánto necesitas para aprobar.</span><button class="btn ghost" data-action="nav" data-view="riesgos">Ver detector de riesgo ${ic('arrow')}</button></div>
    ${honorsPanel(c)}
    <div class="panel"><div class="panel-head"><div><h3>${ic('grade')}Calificaciones ordenadas por semestre</h3><p>La <b>estimación</b> usa tus parciales registrados. Para materias CA/COG sin parciales, usa como referencia el promedio ponderado de la hoja de vida. La nota final se obtiene con <b>(P1 + P2 + P3) / 3</b> o del historial PDF. <b>70+</b> aprueba; <b>60–69</b> da derecho a convocatoria; <b>0–59</b> reprueba.</p></div><div class="seg small"><button class="${semFilter==='all'?'on':''}" data-action="grade-sem" data-sem="all">Todos</button>${Array.from({length:Math.min(n,10)},(_,i)=>`<button class="${semFilter===String(i+1)?'on':''}" data-action="grade-sem" data-sem="${i+1}">${i+1}°</button>`).join('')}</div></div><div class="grade-semesters">${semesters.length?semesters.map(semesterBlock).join(''):'<div class="empty small"><h3>Sin resultados</h3><p>No hay asignaturas que coincidan con la búsqueda.</p></div>'}</div></div>`;
  }

  /* ---------------- VISTA: CALENDARIO / HORARIO SEMANAL ---------------- */
  const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const HOURS = [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
  ];

  function viewSchedule() {
    // Un solo calendario con clases de todas las carreras, incluso el mismo día.
    // Las clases se siguen guardando con su carrera y plan original.
    const events = Array.isArray(state.events) ? state.events.filter(e=>{
      const owner=scheduleEventCareer(e);
      return !!state.careers[owner] && scheduleEventBelongs(e,owner);
    }) : [];
    const parseMin = t => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(t||''));
      if(!m) return null;
      const h=Number(m[1]),min=Number(m[2]);
      return h>=0&&h<24&&min>=0&&min<60?h*60+min:null;
    };
    const minToText=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
    const valid = events.map(ev=>({ ...ev, startMin:parseMin(ev.start), endMin:parseMin(ev.end) }))
      .filter(ev=>Number(ev.day)>=0&&Number(ev.day)<6&&ev.startMin!==null&&ev.endMin!==null&&ev.endMin>ev.startMin);
    const totalMinutes=valid.reduce((a,e)=>a+e.endMin-e.startMin,0);
    const uniqueCourses=new Set(valid.map(e=>`${scheduleEventCareer(e)}::${e.key||e.title||e.id}`)).size;
    const todayRaw=new Date().getDay();
    const today=todayRaw===0?-1:todayRaw-1;
    const selectedDay=Math.min(5,Math.max(0,Number(ui.scheduleDay)||0));
    const earliest=Math.min(7*60,...valid.map(e=>Math.floor(e.startMin/60)*60));
    const latest=Math.max(21*60,...valid.map(e=>Math.ceil(e.endMin/60)*60));
    const gridHours=(latest-earliest)/60,pxPerHour=76;
    const boardHeight=gridHours*pxPerHour;
    const position = n => `${Math.round((n-earliest)/60*pxPerHour)}px`;
    const eventCard = (ev,style='',more='') => {
      const allowedColors=['navy','blue','slate','dark','teal','emerald','violet','orange','rose'];
      const cardColor=allowedColors.includes(ev.color)?ev.color:'navy';
      const onBoard=/\bon-board\b/.test(more);
      const startMin=Number.isFinite(ev.startMin)?ev.startMin:parseMin(String(ev.start||''));
      const endMin=Number.isFinite(ev.endMin)?ev.endMin:parseMin(String(ev.end||''));
      const duration=(Number.isFinite(startMin)&&Number.isFinite(endMin))?Math.max(0,endMin-startMin):0;
      const compactShort=onBoard && duration>0 && duration<=95;
      const title=ev.title || (ev.key?nameOf(ev.key):'Clase');
      const careerName=state.careers[scheduleEventCareer(ev)]?.name||'Carrera anterior';
      const roomHtml=ev.room?`<span class="sc-room">${ic('mapPin')}${esc(ev.room)}</span>`:'';
      const careerHtml=`<span class="sc-career">${esc(careerName)}</span>`;
      const bottom=compactShort
        ? `<span class="sc-bottom">${roomHtml || careerHtml}</span>`
        : `<span class="sc-bottom">${careerHtml}${roomHtml}</span>`;
      const titleAttr=`Editar ${title}${ev.room?` · Aula: ${ev.room}`:''}`;
      return `<button type="button" class="sched-card color-${cardColor} ${compactShort?'compact-short':''} ${more}" ${style ? `style="${style}"` : ''} data-action="edit-event" data-id="${esc(String(ev.id))}" title="${esc(titleAttr)}">
        <span class="sc-time">${esc(ev.start)} – ${esc(ev.end)}</span>
        <strong class="sc-title">${esc(title)}</strong>
        ${bottom}
      </button>`;
    };
    // Compute non-overlapping visual lanes for simultaneous lessons.
    const layoutDay = day => {
      const dayEvents=valid.filter(ev=>Number(ev.day)===day).sort((a,b)=>a.startMin-b.startMin||b.endMin-a.endMin);
      const groups=[];
      for(const ev of dayEvents){
        const last=groups[groups.length-1];
        if(last&&ev.startMin<last.end) {last.items.push(ev);last.end=Math.max(last.end,ev.endMin);}
        else groups.push({items:[ev],end:ev.endMin});
      }
      return groups.flatMap(group=>{
        const endLanes=[];
        const placed=group.items.map(ev=>{
          let lane=endLanes.findIndex(end=>end<=ev.startMin);
          if(lane===-1){lane=endLanes.length;endLanes.push(ev.endMin);} else endLanes[lane]=ev.endMin;
          return {ev,lane};
        });
        const laneCount=Math.max(1,endLanes.length);
        return placed.map(({ev,lane})=>{
          const top=(ev.startMin-earliest)/60*pxPerHour+3;
          const height=Math.max(38,(ev.endMin-ev.startMin)/60*pxPerHour-6);
          const width=100/laneCount;
          return eventCard(ev,`top:${Math.round(top)}px;height:${Math.round(height)}px;left:calc(${(lane*width).toFixed(5)}% + 3px);width:calc(${width.toFixed(5)}% - 6px)`,'on-board');
        });
      }).join('');
    };
    const hrs=Array.from({length:gridHours+1},(_,i)=>earliest+i*60);
    const count=day=>valid.filter(e=>Number(e.day)===day).length;
    const mobileDayEvents=valid.filter(e=>Number(e.day)===selectedDay).sort((a,b)=>a.startMin-b.startMin);
    return `
      <section class="schedule-intro"><div><span class="schedule-kicker">${ic('calendar')} TU SEMANA ACADÉMICA</span><h2>Horario semanal unido</h2><p>Visualiza juntas todas tus clases de ambas carreras, incluso el mismo día. Solo puedes añadir materias marcadas como <b>«Cursando»</b> en su malla.</p></div><span class="schedule-today-tag">${ic('clock')}${today===-1?'Semana académica':'Hoy: '+DAYS[today]}</span></section>
      <div class="schedule-unified-banner">${ic('layers')}<div><strong>Calendario único · ${studyCareers().length} ${studyCareers().length===1?'carrera':'carreras'}</strong><span>Selecciona «Cursando» en cada malla y agrega esas materias al mismo horario. Cada bloque indica su carrera.</span></div><button type="button" class="btn ghost" data-action="nav" data-view="plan">${ic('grid')}Ir a mi malla</button></div>
      <div class="schedule-toolbar"><div class="sched-stats">
        <div class="sched-stat"><b>${valid.length}</b><span>Clases programadas</span></div>
        <div class="sched-stat"><b>${(totalMinutes/60).toLocaleString('es',{maximumFractionDigits:1})} h</b><span>Horas semanales</span></div>
        <div class="sched-stat"><b>${uniqueCourses}</b><span>Asignaturas</span></div>
      </div><div class="schedule-actions"><button class="btn primary" data-action="add-event">${ic('plus')}Agregar clase</button>${events.length?`<button class="btn ghost danger" data-action="clear-schedule">${ic('trash')}Limpiar todo el horario</button>`:''}</div></div>
      <div class="panel ra-schedule-frame schedule-week-panel" aria-label="Calendario semanal con duración real">
        <div class="ra-schedule-scroll"><div class="ra-timeboard" style="--ra-board-height:${boardHeight}px;--ra-hour-height:${pxPerHour}px">
          <div class="ra-week-head"><span>HORAS</span>${DAYS.map((d,i)=>`<div class="ra-week-head-day ${today===i?'is-today':''}">${d}${today===i?'<small>HOY</small>':''}<span>${count(i)} ${count(i)===1?'clase':'clases'}</span></div>`).join('')}</div>
          <div class="ra-board-grid"><div class="ra-time-rail" style="height:${boardHeight}px">${hrs.map((h,i)=>`<span style="top:${i*pxPerHour}px">${minToText(h)}</span>`).join('')}</div>
          ${DAYS.map((d,i)=>`<div class="ra-day-track ${today===i?'is-today':''}" style="height:${boardHeight}px" data-action="quick-add" data-day="${i}" data-early="${earliest}" data-step="${pxPerHour}" title="Agregar clase el ${d}">${layoutDay(i)}</div>`).join('')}</div>
        </div></div>
      </div>
      <section class="schedule-mobile" aria-label="Horario por día">
        <div class="schedule-day-tabs" role="group" aria-label="Selecciona un día">${DAYS.map((d,i)=>`<button class="schedule-day-tab ${selectedDay===i?'on':''} ${today===i?'is-today':''}" type="button" data-action="schedule-day" data-day="${i}" aria-pressed="${selectedDay===i}"><b>${d.slice(0,3)}</b>${today===i?'<i>Hoy</i>':''}</button>`).join('')}</div>
        <div class="schedule-mobile-heading"><div><small>${today===selectedDay?'HOY · ':''}CLASES DEL DÍA</small><h3>${DAYS[selectedDay]}</h3></div><b>${mobileDayEvents.length} ${mobileDayEvents.length===1?'clase':'clases'}</b></div>
        <div class="schedule-day-events">${mobileDayEvents.length?mobileDayEvents.map(ev=>`<div class="schedule-event-row"><time>${esc(ev.start)}<span>${esc(ev.end)}</span></time>${eventCard(ev)}</div>`).join(''):`<div class="schedule-day-empty">${ic('calendar')}<strong>No hay clases programadas</strong><p>Puedes aprovechar este día para estudiar o descansar.</p><button type="button" class="btn primary" data-action="quick-add" data-day="${selectedDay}" >${ic('plus')}Agregar clase</button></div>`}</div>
      </section>`;
  }

  function openEventModal(eventId = null, defaultDay = 0, defaultHour = '', presetKey='') {
    const existing=eventId!=null?state.events.find(e=>String(e.id)===String(eventId)):null;
    const owner=existing?scheduleEventCareer(existing):scheduleCareerIndex();
    if(!studyCareers().length){toast('Primero carga al menos una malla académica.','err');go('inicio');return;}
    const currentAcross=studyCareers().flatMap(({c,i})=>scheduleOptionsFor(String(i),'current','').map(x=>({x,c,i})));
    if(!existing&&!currentAcross.length){
      toast('Marca primero tus materias como «Cursando» dentro de Plan de estudios.','err');
      go('plan');return;
    }
    const course=state.careers[owner]?.courses.find(x=>x.key===(existing?.key||presetKey));
    const defaultOwner=course&&currentCourseKeys(owner).includes(course.key)?owner:(currentAcross[0]?.i??owner);
    const currentPlan=state.careers[defaultOwner];
    const oldNotCurrent=!!existing && (!course||!currentCourseKeys(owner).includes(course.key));
    const ev=existing||{id:Date.now()+Math.random(),key:presetKey,title:course?.name||'',day:defaultDay,start:defaultHour||'',end:'',room:'',color:'navy'};
    openModal(`
      ${modalHead(existing?'Editar clase del horario':'Agregar clase al horario','Solo materias marcadas «Cursando» · Horario único para todas las carreras')}
      <form class="m-body form" id="eventForm" data-id="${existing?esc(String(existing.id)):''}" data-custom="${oldNotCurrent?'1':'0'}">
        <div class="ev-select-grid">
          <label>Carrera<select id="evCareer" name="career" required>${studyCareerOptions(String(oldNotCurrent?owner:defaultOwner))}</select></label>
          <div class="schedule-modal-tip">${ic('check')}<span>Las materias se eligen desde la casilla <b>«Cursando»</b> del Plan de estudios.</span></div>
        </div>
        <label>Materia que estás cursando<select id="evKey" name="key" required>${evSubjectOptions(String(oldNotCurrent?owner:defaultOwner),'current','',ev.key)}${oldNotCurrent?'<option value="__custom__">Clase guardada anteriormente (editar)</option>':''}</select></label>
        <p class="ev-info" id="evSelectionHint"></p>
        <label>Nombre de la asignatura<input id="evTitle" name="title" required readonly value="${esc(course?.name||ev.title||'')}" placeholder="Se completa con la materia elegida"></label>
        <div class="f-row">
          <label>Día de la semana<select name="day">${DAYS.map((d,i)=>`<option value="${i}" ${Number(ev.day)===i?'selected':''}>${d}</option>`).join('')}</select></label>
          <label>Hora de inicio<input type="time" name="start" step="60" required></label>
          <label>Hora de fin<input type="time" name="end" step="60" required></label>
        </div>
        <div class="f-row"><label style="grid-column: span 2;">Aula / Edificio / Modalidad<input name="room" value="${esc(ev.room||'')}" placeholder="Ej: Edificio C3 · Aula 201"></label><label>Color de tarjeta<select name="color">${[['navy','Azul Marino'],['dark','Negro'],['blue','Azul'],['slate','Pizarra'],['teal','Turquesa'],['emerald','Esmeralda'],['violet','Violeta'],['orange','Naranja'],['rose','Rosa']].map(([v,label])=>`<option value="${v}" ${ev.color===v?'selected':''}>${label}</option>`).join('')}</select></label></div>
      </form>
      <div class="m-foot">${existing?`<button class="btn ghost danger" data-action="delete-event" data-id="${esc(String(existing.id))}">${ic('trash')}Eliminar</button>`:''}<button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" type="submit" form="eventForm">${ic('check')}Guardar en horario</button></div>
    `);
    updateEventSelectors();
    const startField=$('#eventForm [name=start]'),endField=$('#eventForm [name=end]');
    if(startField)startField.value=ev.start||'';if(endField)endField.value=ev.end||'';
    if(oldNotCurrent){
      const saved=$('#evKey');if(saved)saved.value='__custom__';
      const title=$('#evTitle');if(title){title.value=ev.title||course?.name||'';title.readOnly=true;}
      const hint=$('#evSelectionHint');if(hint)hint.textContent='Esta clase ya estaba guardada. Para cambiarla por otra, marca primero la nueva materia como «Cursando» en su malla.';
    }
  }

  function saveEvent(form) {
    const fd=new FormData(form);
    const ciRaw=String(fd.get('career')??'');
    const ci=Number(ciRaw);
    const c=state.careers[ci];
    const key=String(fd.get('key')||'');
    if(!['0','1'].includes(ciRaw)||!c?.courses?.length){toast('Selecciona una carrera cargada.','err');return;}
    const existing=form.dataset.id?state.events.find(e=>String(e.id)===String(form.dataset.id)):null;
    const isLegacy=!!existing&&form.dataset.custom==='1'&&key==='__custom__'&&scheduleEventCareer(existing)===ci;
    const course=c.courses.find(x=>x.key===key);
    if(!isLegacy&&(!course||!currentCourseKeys(ci).includes(key))){
      toast('Solo puedes agregar materias marcadas como «Cursando» en esa carrera.','err');return;
    }
    const title=isLegacy?existing.title:course.name;
    const day=Number(fd.get('day')),start=String(fd.get('start')||''),end=String(fd.get('end')||'');
    const minutes=t=>{const m=/^(\d{2}):(\d{2})$/.exec(t);if(!m)return NaN;const h=+m[1],mi=+m[2];return h*60+mi;};
    if(!Number.isInteger(day)||day<0||day>5||!Number.isFinite(minutes(start))||!Number.isFinite(minutes(end))||minutes(end)<=minutes(start)){
      toast('La hora final debe ser posterior a la inicial.','err');return;
    }
    const id=existing?existing.id:Date.now()+Math.random();
    // Detecta solapamientos de todas las carreras, sin impedir clases distintas el mismo día.
    const collision=state.events.find(ev=>String(ev.id)!==String(id) &&
      Number(ev.day)===day && minutes(start)<minutes(String(ev.end))&&minutes(String(ev.start))<minutes(end) &&
      state.careers[scheduleEventCareer(ev)] && scheduleEventBelongs(ev,scheduleEventCareer(ev)));
    if(collision&&!confirm(`Conflicto: ${title} coincide con ${collision.title} (${collision.start}–${collision.end})${state.careers[scheduleEventCareer(collision)]?' de '+state.careers[scheduleEventCareer(collision)].name:''}. ¿Guardar ambas de todas formas?`))return;
    const eventData={id,career:ci,planId:planIdentity(c,ci),semester:course?.semester||existing?.semester||0,key:isLegacy?existing.key:key,title,day,start,end,room:String(fd.get('room')||''),color:String(fd.get('color')||'navy')};
    const idx=state.events.findIndex(ev=>String(ev.id)===String(id));
    if(idx>=0)state.events[idx]=eventData;else state.events.push(eventData);
    state.scheduleCareer=ci;
    closeModal();render();toast('Clase guardada en tu horario unificado');
  }

  function deleteEvent(id) {
    state.events = state.events.filter(e => e.id !== Number(id));
    closeModal();
    render();
    toast('Clase retirada del horario');
  }

  /* ---------------- Vistas restantes ---------------- */
  function viewRecom() {
    const ci = ui.recommendationCareer;
    const c = state.careers[ci];
    const parity = ui.recommendationParity;
    const availableCareers = list();
    if(!availableCareers.length)return emptyState('Sin plan cargado','Carga tu plan para recibir recomendaciones.');
    if(!c){
      return `<section class="ra-cycle-intro"><span class="ra-progress-kicker">${ic('star')} PRÓXIMO SEMESTRE</span><h2>¿De cuál carrera quieres recomendaciones?</h2><p>Selecciona una de tus carreras para consultar las materias que puedes llevar el próximo semestre.</p>
      <div class="ra-cycle-options" role="group" aria-label="Selecciona la carrera">${availableCareers.map(({c:career,i})=>`<button class="ra-cycle-option" type="button" data-action="recommend-career" data-i="${i}">${careerIcon(career)}<span class="ra-cycle-copy"><b>${esc(career.name)}</b></span><span class="ra-cycle-mark">${ic('arrow')}</span></button>`).join('')}</div></section>`;
    }
    const selected = parity === 'odd' || parity === 'even';
    const cycleRemainder = parity === 'odd' ? 1 : 0;
    const current = new Set(selected ? currentCourseKeys(ci) : []);
    const planSemesters = [...new Set(c.courses.map(x => Number(x.semester)))]
      .filter(sem => Number.isInteger(sem) && sem > 0)
      .sort((a, b) => a - b);
    const cycleTerms = remainder => planSemesters.filter(sem => sem % 2 === remainder);
    const matchingSemesters = new Set(cycleTerms(cycleRemainder));
    const fromPython = selected ? window.RutaBackend?.recommend(ci, parity, [...current]) : null;
    const recommendedKeys = fromPython ? new Set(fromPython) : null;
    const arr = selected ? c.courses.filter(x => recommendedKeys
      ? recommendedKeys.has(x.key)
      : (matchingSemesters.has(Number(x.semester)) && !current.has(x.key) && statusOf(x, ci) === 'available')
    ).sort((a, b) => a.semester - b.semester || unlocks(b.key, c).length - unlocks(a.key, c).length) : [];
    const semesters = [...new Set(arr.map(x => Number(x.semester)))];
    const choice=(value,label,terms)=>`<button class="ra-cycle-option ${parity===value?'is-selected':''}" type="button" data-action="recommend-cycle" data-cycle="${value}" aria-pressed="${parity===value}">
      <span class="ra-cycle-icon">${ic('calendar')}</span><span class="ra-cycle-copy"><b>Semestre ${label}</b><small>${terms}</small></span><span class="ra-cycle-mark" aria-hidden="true">${parity===value?ic('check'):ic('arrow')}</span></button>`;
    const row=x=>`<button type="button" class="ra-cycle-course" data-action="open" data-key="${esc(x.key)}" data-c="${ci}">
      <span class="ra-cycle-course-icon">${ic('book')}</span><span class="ra-cycle-course-main"><b>${esc(displayCourseName(x,c))}</b><span>${cr(x)?cr(x)+' créditos':'Créditos sin definir'}<i>·</i>${x.prereqs?.length ? 'Requisitos aprobados' : 'Sin requisitos'}</span></span><span class="ra-cycle-course-arrow">${ic('arrow')}</span></button>`;
    return `<section class="ra-cycle-intro"><span class="ra-progress-kicker">${ic('star')} PRÓXIMO SEMESTRE</span><h2>¿Qué ciclo vas a cursar?</h2><p class="route-recommend-selection">${careerIcon(c)}<span>${esc(c.name)}</span><button type="button" data-action="recommend-change-career">Cambiar carrera</button></p>
      <div class="ra-cycle-options" role="group" aria-label="Elige semestre par o impar">${choice('odd','impar',cycleTerms(1).join(' · ') || 'Sin materias en la malla')}${choice('even','par',cycleTerms(0).join(' · ') || 'Sin materias en la malla')}</div></section>
      ${!selected?`<div class="ra-cycle-prompt">${ic('route')}<p>Se mostrarán las materias del ciclo elegido que puedes cursar según tus requisitos.</p></div>`:
      `<div class="ra-cycle-results-head"><div><h3>Materias que puedes llevar</h3><p>Materias pendientes de los semestres ${parity==='odd'?'impares':'pares'}, sin requisitos o con todos sus requisitos aprobados.</p></div><span class="ra-cycle-count">${arr.length} ${arr.length===1?'materia disponible':'materias disponibles'}</span></div>
      ${arr.length?`<div class="ra-cycle-groups">${semesters.map(sem=>{const items=arr.filter(x=>Number(x.semester)===sem);return `<section class="ra-cycle-group"><header><span class="ra-cycle-sem-number">${sem}°</span><div><h4>Semestre ${sem}</h4><p>${items.length} ${items.length===1?'materia disponible':'materias disponibles'}</p></div></header><div>${items.map(row).join('')}</div></section>`;}).join('')}</div>`:
      `<div class="ra-cycle-prompt">${ic('lock')}<p>No hay materias disponibles de este ciclo. Revisa los requisitos pendientes de tu malla o cambia a ${parity==='odd'?'semestre par':'semestre impar'}.</p></div>`}`}`;
  }
  function viewReq() {
    const c = cur(), ci=activeIdx();
    if (!c) return emptyState('Sin plan cargado', 'Carga tu plan para analizar los requisitos.');
    const scope = state.reqScope;
    const withReq = c.courses.filter(x => x.prereqs.length);
    const items = (scope === 'pending' ? withReq.filter(x => statusOf(x,ci) === 'blocked') : withReq)
      .sort((a, b) => (a.semester - b.semester) || a.code.localeCompare(b.code));
    const blockedN = withReq.filter(x => statusOf(x,ci) === 'blocked').length;

    const rows = items.map(x => {
      const st = statusOf(x,ci);
      const { roots } = chain(x, c);
      const paths=pendingRequirementRoutes(x,c).filter(route=>route.length>2);
      return `<div class="req-row st-${st}" data-action="open" data-key="${esc(x.key)}" data-c="${activeIdx()}">
        <div class="req-course"><span class="code">${esc(x.code)}</span><b>${esc(x.name)}</b><small>${x.semester}° semestre</small></div>
        <div class="req-col"><label>Requisitos</label><div class="chips">${x.prereqs.map(k => chip(k,{ci})).join('')}</div></div>
        <div class="req-col">${st === 'blocked'
          ? `<label>Debes llevar primero</label><div class="chips">${roots.map(r => chip(r.key, { strong: true, ci })).join('') || '—'}</div>
             ${paths.length?`<div class="req-paths">${paths.slice(0,3).map((route,i)=>`<div class="req-path"><span class="req-path-label">Ruta${paths.length>1?' '+(i+1):''}</span><ol>${route.map(y=>`<li>${esc(y.name)}</li>`).join('')}</ol></div>`).join('')}</div>`:''}`
          : `<label>Estado</label>${badge(st)}`}
        </div></div>`;
    }).join('');

    return `
    <div class="toolbar">
      ${careerSwitch()}
      <div class="seg small">
        <button class="${scope === 'pending' ? 'on' : ''}" data-action="req-scope" data-s="pending">Pendientes (${blockedN})</button>
        <button class="${scope === 'all' ? 'on' : ''}" data-action="req-scope" data-s="all">Todas con requisito (${withReq.length})</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><b>${withReq.length}</b><span>clases con requisito</span></div>
      <div class="kpi"><b>${c.courses.length - withReq.length}</b><span>sin requisito</span></div>
      <div class="kpi dark"><b>${blockedN}</b><span>bloqueadas por requisito</span></div>
    </div>
    <div class="req-list">${rows || `<div class="empty small"><h3>Nada pendiente</h3><p>No tienes clases bloqueadas por requisitos. ¡Vas muy bien!</p></div>`}</div>`;
  }

  function viewShared() {
    const [a, b] = state.careers;
    if (!a || !b) return emptyState('Compara dos planes de estudio', 'Carga una segunda carrera para consultar las asignaturas que tienen en común.');

    const plans = [a, b];
    const rows = sharedCoursePairs().sort(([x], [y]) =>
      Number(x.semester) - Number(y.semester) || x.name.localeCompare(y.name, 'es')
    );
    const current = plans.map((_, ci) => new Set(currentCourseKeys(ci)));
    const courseMaps = plans.map(mapOf);
    const statuses = { ...statusLabel, current: 'Cursando' };
    const statusIcons = { taken: 'check', available: 'unlock', blocked: 'lock', current: 'clock' };
    const approved = rows.filter(([x]) => isTaken(x.key, 0)).length;
    const percent = rows.length ? Math.round(approved / rows.length * 100) : 0;
    const planLabel = ci => `Plan ${ci + 1}`;
    const statusFor = (course, ci) => {
      const status = statusOf(course, ci);
      return status !== 'taken' && current[ci].has(course.key) ? 'current' : status;
    };

    function requirementLine(keys, ci, label) {
      if (!keys?.length) return '';
      return `<div class="sc-requirements"><span>${label}</span>${keys.map(key => {
        const name = courseMaps[ci].get(key)?.name || courseMaps[1 - ci].get(key)?.name || 'Materia sin identificar';
        const done = isTaken(key, ci);
        return `<span class="sc-req-name${done ? '' : ' sc-req-pending'}" title="${done ? 'Aprobada' : 'Pendiente'}">${esc(name)}${done ? '' : '<span class="sc-visually-hidden"> (pendiente)</span>'}</span>`;
      }).join('')}</div>`;
    }

    function planCell(course, ci) {
      const status = statusFor(course, ci);
      return `<section class="sc-plan-cell" aria-label="${esc(plans[ci].name)}">
        <div class="sc-cell-heading">
          <span class="sc-plan-label"><i></i>${planLabel(ci)}</span>
          <span class="sc-status" data-status="${status}">${ic(statusIcons[status])}${statuses[status]}</span>
        </div>
        <button class="sc-detail" type="button" data-action="open" data-key="${esc(course.key)}" data-c="${ci}"
          aria-label="${esc(course.name + ' · Ver ficha en ' + plans[ci].name)}">
          <span>${esc(course.name)}</span>${ic('arrow-right')}
        </button>
        <p class="sc-course-meta">Semestre ${esc(course.semester || '—')}<span>·</span>${cr(course)} créditos</p>
        ${requirementLine(course.prereqs, ci, 'Prerrequisitos')}
        ${requirementLine(course.coreqs, ci, 'Correquisitos')}
        ${!course.prereqs?.length && !course.coreqs?.length ? '<p class="sc-course-meta">Sin requisitos</p>' : ''}
      </section>`;
    }

    return `<div class="shared-comparison" id="sharedComparison">
      <section class="sc-overview" aria-label="Resumen de clases compartidas">
        <div class="sc-total">
          <span>Asignaturas en común</span>
          <strong>${rows.length}</strong>
          <div class="sc-progress-label"><span>Aprobadas</span><b>${approved} de ${rows.length}</b></div>
          <progress max="100" value="${percent}" aria-label="Porcentaje de asignaturas compartidas aprobadas">${percent}%</progress>
        </div>
        <div class="sc-plan-grid">
          ${plans.map((plan, ci) => {
            const matching = new Set(rows.map(pair => pair[ci].key)).size;
            const coverage = plan.courses.length ? Math.round(matching / plan.courses.length * 100) : 0;
            return `<article class="sc-plan-summary">
              <span class="sc-plan-label"><i></i>${planLabel(ci)}</span>
              <h2>${esc(plan.name)}</h2>
              <div class="sc-coverage"><strong>${coverage}%</strong><span>${matching} de ${plan.courses.length} asignaturas del plan</span></div>
            </article>`;
          }).join('')}
        </div>
      </section>

      <section class="sc-results" aria-labelledby="sharedResultsTitle">
        <div class="sc-toolbar">
          <div><h2 id="sharedResultsTitle">Comparación por asignatura</h2>
          <p id="sharedResultCount" role="status">${rows.length} ${rows.length === 1 ? 'asignatura' : 'asignaturas'}</p></div>
          ${rows.length ? `<div class="sc-controls">
            <label class="sc-search">${ic('search')}<span class="sc-visually-hidden">Buscar asignatura por nombre o código</span>
              <input type="search" id="sharedSearch" placeholder="Buscar por nombre o código" value="${esc(ui.sharedSearch)}">
            </label>
            <select id="sharedFilter" aria-label="Filtrar asignaturas por aprobación">
              ${Object.entries({ all: 'Todas', pending: 'Por aprobar', taken: 'Aprobadas' }).map(([value, label]) =>
                `<option value="${value}"${ui.sharedFilter === value ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>
        ${rows.length ? `<div class="sc-course-list">
          ${rows.map(([x, y]) => {
            const taken = isTaken(x.key, 0);
            const names = normalizeSharedCourseName(x.name) === normalizeSharedCourseName(y.name)
              ? esc(x.name) : `${esc(x.name)}<small>${esc(y.name)}</small>`;
            const search = [x.name, y.name, x.code, y.code].map(normalizeSharedCourseName).join(' ');
            return `<article class="sc-course" data-shared-search="${esc(search)}" data-approved="${taken}">
              <header class="sc-course-heading">
                <div><h3>${names}</h3><span class="sc-match">${ic('link')}${x.key === y.key ? 'Mismo código' : 'Mismo nombre'}</span></div>
                <button type="button" class="sc-approval" data-action="toggle" data-key="${esc(x.key)}" data-c="0"
                  aria-pressed="${taken}" aria-label="${esc('Aprobación de ' + x.name)}">
                  ${ic(taken ? 'check' : 'plus')}${taken ? 'Quitar aprobación' : 'Marcar aprobada'}
                </button>
              </header>
              <div class="sc-plan-grid">${planCell(x, 0)}${planCell(y, 1)}</div>
            </article>`;
          }).join('')}
        </div>
        <p class="sc-empty" id="sharedNoResults" hidden>No hay asignaturas que coincidan con la búsqueda y el filtro.</p>` :
          '<p class="sc-empty">No se encontraron asignaturas con el mismo código o nombre en los dos planes.</p>'}
      </section>
    </div>`;
  }

  function filterSharedCourses() {
    const results = $('#sharedComparison');
    if (!results || !$('#sharedSearch')) return;
    const terms = normalizeSharedCourseName(ui.sharedSearch).split(' ').filter(Boolean);
    let visible = 0;
    results.querySelectorAll('[data-shared-search]').forEach(row => {
      const approved = row.dataset.approved === 'true';
      const fits = ui.sharedFilter === 'all' || approved === (ui.sharedFilter === 'taken');
      row.hidden = !fits || !terms.every(term => row.dataset.sharedSearch.includes(term));
      if (!row.hidden) visible++;
    });
    $('#sharedResultCount').textContent = `${visible} ${visible === 1 ? 'asignatura' : 'asignaturas'}`;
    $('#sharedNoResults').hidden = visible > 0;
  }

  function viewProg() {
    const cs=list();
    if(!cs.length)return emptyState('Sin plan cargado','Carga tu plan para ver tu progreso.');
    const groups=new Map();
    cs.forEach(({c,i})=>c.courses.forEach(x=>{
      const refs=equivalentCourseRefs(x.key,i),id=refs.map(r=>r.ci+':'+r.course.key).sort().join('|')||i+':'+x.key;
      if(!groups.has(id))groups.set(id,{refs,x,ci:i});
    }));
    const unique=[...groups.values()],done=unique.filter(g=>isTaken(g.x.key,g.ci)).length;
    const studying=unique.filter(g=>!isTaken(g.x.key,g.ci)&&g.refs.some(r=>currentCourseKeys(r.ci).includes(r.course.key))).length;
    const shared=unique.filter(g=>g.refs.length>1).length,pct=unique.length?done/unique.length:0;
    const cards=cs.map(({c,i})=>{
      const st=stats(c),current=currentCourseKeys(i).filter(k=>!isTaken(k,i)).length;
      const semesters=Array.from({length:semCount(c)},(_,j)=>{
        const courses=c.courses.filter(x=>(Number(x.semester)||1)===j+1);
        if(!courses.length)return '';
        const approved=courses.filter(x=>isTaken(x.key,i)).length,pc=Math.round(approved/courses.length*100);
        return `<div class="ra-semester-row"><span class="ra-semester-no">${j+1}°</span><div><div class="ra-semester-copy"><span>Semestre ${j+1}</span><b>${pc}%</b></div><div class="ra-semester-track" role="progressbar" aria-label="Avance del semestre ${j+1} de ${esc(c.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}"><i style="width:${pc}%"></i></div></div><span class="ra-semester-count">${approved}/${courses.length}<small>aprobadas</small></span></div>`;
      }).join('');
      return `<article class="ra-progress-card"><div class="ra-progress-card-head"><div class="ra-progress-plan"><span class="ra-progress-kicker">PLAN ${String(i+1).padStart(2,'0')}</span><h3 class="route-career-line">${careerIcon(c)}<span>${esc(c.name)}</span></h3><p>${st.taken} de ${st.total} materias aprobadas</p></div>${ring(st.pct,100,8)}</div>
        <div class="ra-progress-counts"><div><b>${current}</b><span>Cursando</span></div><div><b>${st.available}</b><span>Disponibles</span></div><div><b>${st.blocked}</b><span>Bloqueadas</span></div></div>
        <div class="ra-semester-heading"><span>AVANCE POR SEMESTRE</span><span>${Math.round(st.pct*100)}% TOTAL</span></div><div class="ra-semester-list">${semesters}</div>
        <footer class="ra-progress-card-foot"><span><b>${st.creditsTaken}</b> de ${st.credits} créditos</span><button class="btn ghost" data-action="open-plan" data-i="${i}">Ver mi plan ${ic('arrow')}</button></footer></article>`;
    }).join('');
    return `<section class="ra-progress-overview"><div><span class="ra-progress-kicker">${ic('chart')} TU RECORRIDO</span><h2>Cada materia cuenta.</h2><p>${done?'Ya aprobaste '+done+' de tus '+unique.length+' materias únicas. Sigue tu avance por carrera y por semestre.':'Tu recorrido empieza aquí. Marca tus materias aprobadas para ver crecer tu progreso.'}</p><button class="btn ghost" type="button" data-ra-open-palette>${ic('edit')}Personalizar colores</button></div>${ring(pct,130,9)}</section>
      <div class="ra-overview-metrics"><article><strong>${done}</strong><span>Materias aprobadas</span></article><article><strong>${unique.length-done}</strong><span>Por completar</span></article><article><strong>${studying}</strong><span>Cursando ahora</span></article><article><strong>${shared}</strong><span>Compartidas entre carreras</span></article></div>
      <div class="ra-progress-grid">${cards}</div>`;
  }

  /* ---------------- Herramientas universitarias ---------------- */
  const localDate = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0,10); };
  const prettyDate = v => { if (!v) return 'Sin fecha'; const d = new Date(v + 'T12:00:00'); return d.toLocaleDateString('es', { day:'2-digit', month:'short' }); };
  const dayDelta = v => { if (!v) return 99999; const a = new Date(localDate() + 'T00:00:00'), b = new Date(v + 'T00:00:00'); return Math.round((b-a)/86400000); };
  const taskTypeLabel = { tarea:'Tarea', examen:'Examen', proyecto:'Proyecto', exposicion:'Exposición', otro:'Otro' };
  const priorityLabel = { 1:'Alta', 2:'Media', 3:'Baja' };
  const courseOptions = (selected='') => {
    const seen = new Set(), rows = [];
    list().forEach(({c}) => c.courses.forEach(x => { if (!seen.has(x.key)) { seen.add(x.key); rows.push(x); } }));
    return `<option value="">Sin asignatura</option>` + rows.sort((a,b)=>(a.semester||0)-(b.semester||0)||a.name.localeCompare(b.name)).map(x => `<option value="${esc(x.key)}" ${x.key===selected?'selected':''}>${esc(x.code)} · ${esc(x.name)}</option>`).join('');
  };
  function taskCourseName(k){ const x=findCourse(k); return x ? `${x.code} · ${x.name}` : (k ? fmtCode(k) : 'General'); }
  function taskDueClass(t){ const d=dayDelta(t.due); return t.done ? '' : d<0?'overdue':d===0?'today':''; }
  function taskDueText(t){ if(!t.due)return 'Sin fecha'; const d=dayDelta(t.due); if(d<0)return `Venció hace ${Math.abs(d)} día${Math.abs(d)===1?'':'s'}`; if(d===0)return 'Hoy'; if(d===1)return 'Mañana'; if(d<=7)return `En ${d} días`; return prettyDate(t.due); }

  function viewAgenda(){
    const all=[...state.tasks].sort((a,b)=>(a.done-b.done)||String(a.due||'9999').localeCompare(String(b.due||'9999'))||(Number(a.priority)||2)-(Number(b.priority)||2));
    const pending=all.filter(t=>!t.done), overdue=pending.filter(t=>dayDelta(t.due)<0).length, week=pending.filter(t=>dayDelta(t.due)>=0&&dayDelta(t.due)<=7).length, done=all.filter(t=>t.done).length;
    const f=ui.taskFilter||'pending';
    const shown=all.filter(t=>f==='all'||(f==='pending'&&!t.done)||(f==='done'&&t.done)||(f==='week'&&!t.done&&dayDelta(t.due)>=0&&dayDelta(t.due)<=7)||(f==='overdue'&&!t.done&&dayDelta(t.due)<0));
    return `<div class="student-kpis">
      <div class="student-kpi"><b>${pending.length}</b><span>Pendientes</span></div>
      <div class="student-kpi ${overdue?'danger':''}"><b>${overdue}</b><span>Vencidas</span></div>
      <div class="student-kpi ${week?'warn':''}"><b>${week}</b><span>Próximos 7 días</span></div>
      <div class="student-kpi"><b>${done}</b><span>Completadas</span></div>
    </div>
    <div class="panel">
      <div class="student-toolbar"><button class="btn primary" data-action="new-task">${ic('plus')}Nueva actividad</button>
        <div class="seg">${[['pending','Pendientes'],['week','7 días'],['overdue','Vencidas'],['done','Completadas'],['all','Todas']].map(([k,l])=>`<button class="${f===k?'on':''}" data-action="task-filter" data-f="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="agenda-list">${shown.length?shown.map(t=>`<div class="agenda-row ${t.done?'done':''}">
        <button class="agenda-check ${t.done?'on':''}" data-action="task-toggle" data-id="${t.id}" aria-label="Completar">${ic('check')}</button>
        <div class="agenda-main"><div class="agenda-title">${esc(t.title)}</div><div class="agenda-meta">
          <span class="type-chip">${esc(taskTypeLabel[t.type]||'Actividad')}</span>
          <span>${esc(taskCourseName(t.key))}</span>
          <span class="priority-chip p${t.priority||2}">${esc(priorityLabel[t.priority]||'Media')}</span>
          <span class="due-chip ${taskDueClass(t)}">${ic('calendar')}${esc(taskDueText(t))}</span>
        </div>${t.notes?`<div class="agenda-meta"><span>${esc(t.notes)}</span></div>`:''}</div>
        <div class="agenda-actions"><button class="icon-btn sm" data-action="task-edit" data-id="${t.id}" title="Editar">${ic('edit')}</button><button class="icon-btn sm" data-action="task-delete" data-id="${t.id}" title="Eliminar">${ic('trash')}</button></div>
      </div>`).join(''):`<div class="empty small"><div class="empty-ic">${ic('clip')}</div><h3>${f==='done'?'Aún no hay actividades completadas':'Tu agenda está limpia'}</h3><p>Agrega tareas, exámenes, proyectos o exposiciones para tener tus fechas bajo control.</p><button class="btn primary" data-action="new-task">${ic('plus')}Agregar actividad</button></div>`}</div>
    </div>`;
  }

  function openTaskModal(id, preKey=''){
    const t=state.tasks.find(x=>x.id===Number(id))||{title:'',key:preKey||'',type:'tarea',due:localDate(),priority:2,notes:'',done:false};
    openModal(`${modalHead(id?'Editar actividad':'Nueva actividad','Se guardará en tu agenda académica')}
      <form class="m-body form" id="taskForm" data-id="${id||''}">
        <label>Título<input name="title" required maxlength="90" value="${esc(t.title)}" placeholder="Ej: Entregar investigación de economía"></label>
        <div class="f-row"><label>Asignatura<select name="key">${courseOptions(t.key)}</select></label><label>Tipo<select name="type">${Object.entries(taskTypeLabel).map(([k,l])=>`<option value="${k}" ${t.type===k?'selected':''}>${l}</option>`).join('')}</select></label><label>Prioridad<select name="priority">${[[1,'Alta'],[2,'Media'],[3,'Baja']].map(([k,l])=>`<option value="${k}" ${Number(t.priority)===k?'selected':''}>${l}</option>`).join('')}</select></label></div>
        <label>Fecha límite<input type="date" name="due" value="${esc(t.due||'')}"></label>
        <label>Notas<textarea name="notes" rows="3" maxlength="300" placeholder="Indicaciones, aula, materiales, enlace, etc.">${esc(t.notes||'')}</textarea></label>
      </form><div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" type="submit" form="taskForm">${ic('check')}Guardar actividad</button></div>`);
  }
  function saveTask(form){
    const fd=new FormData(form), id=Number(form.dataset.id)||Date.now();
    const data={id,title:String(fd.get('title')||'').trim(),key:String(fd.get('key')||''),type:String(fd.get('type')||'tarea'),due:String(fd.get('due')||''),priority:Number(fd.get('priority'))||2,notes:String(fd.get('notes')||'').trim(),done:state.tasks.find(x=>x.id===id)?.done||false};
    if(!data.title)return toast('Escribe un título','err');
    const idx=state.tasks.findIndex(x=>x.id===id); if(idx>=0)state.tasks[idx]=data;else state.tasks.push(data); closeModal(); render(); toast('Agenda actualizada');
  }

  function startOfWeek(){const d=new Date();const day=(d.getDay()+6)%7;d.setHours(0,0,0,0);d.setDate(d.getDate()-day);return d;}
  function localDayKey(d=new Date()){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;}
  function weekStudyMinutes(){return studyWeekDays().reduce((n,x)=>n+x.minutes,0);}
  function todayStudyMinutes(){const key=localDayKey();return state.studyLog.filter(x=>localDayKey(new Date(x.date))===key).reduce((n,x)=>n+(Number(x.minutes)||0),0);}
  const STUDY_MOTIVATION=[
    'Cumpliste contigo hoy. Esa constancia vale más que una sesión perfecta.',
    'Meta lograda. Cada día que estudias así hace más pequeño el camino que falta.',
    'Hoy avanzaste de verdad. Tu futuro se construye con sesiones como esta.',
    'Excelente trabajo. La disciplina de hoy será la tranquilidad de mañana.',
    'Meta diaria completada. Tu esfuerzo ya está sumando aunque todavía no veas todo el resultado.',
    'Una meta más cumplida. Sigue acumulando días buenos y el semestre cambia por completo.',
    'Hoy ganaste una batalla contra la procrastinación. Bien hecho.',
    'Tu progreso no necesita ser perfecto, necesita ser constante. Hoy lo fuiste.',
    'Terminaste lo que te propusiste. Esa confianza también se entrena.',
    'Buen trabajo. Estudiar hoy es regalarle menos estrés a tu yo de los exámenes.',
    'Meta cumplida. No subestimes lo que puede hacer una hora bien enfocada todos los días.',
    'Hoy elegiste avanzar. Ese tipo de decisiones termina convirtiéndose en resultados.',
    'Una sesión a la vez, una materia a la vez. Vas construyendo algo grande.',
    'Objetivo del día alcanzado. Puedes estar orgulloso del esfuerzo que sí hiciste.',
    'Cumpliste la meta. Ahora descansa sabiendo que hoy tu carrera avanzó contigo.',
    'Otro día sumado a tu disciplina. Las notas llegan después; el hábito se construye ahora.',
    'Hoy no dependiste de la motivación: cumpliste. Eso es progreso real.',
    'Meta diaria superada. Tu constancia empieza a convertirse en ventaja.',
    'Excelente. Lo que hoy parece una pequeña sesión puede ser la diferencia al final del semestre.',
    'Lo lograste por hoy. Mañana no empiezas desde cero: empiezas desde todo lo que ya construiste.'
  ];
  function motivationForToday(){const k=localDayKey().replace(/-/g,'');let n=0;for(const ch of k)n=(n*31+ch.charCodeAt(0))>>>0;return STUDY_MOTIVATION[n%STUDY_MOTIVATION.length];}
  function dailyGoalReached(before,after){const goal=Math.max(15,Number(state.studyDailyGoal)||60);return before<goal&&after>=goal;}
  function celebrateStudyGoal(before,after){if(!dailyGoalReached(before,after))return;const msg=motivationForToday();setTimeout(()=>openModal(`${modalHead('¡Meta diaria cumplida! 🎉','Completaste tu objetivo de estudio de hoy')}<div class="m-body"><div class="study-motivation"><span class="motivation-icon">★</span><div><b>Buen trabajo</b><p>${esc(msg)}</p></div></div><div class="note">${ic('clock')}<span>Hoy llevas <b>${after} minutos</b> de estudio. Tu meta era de <b>${state.studyDailyGoal} minutos</b>.</span></div></div><div class="m-foot"><button class="btn primary" data-action="close">Seguir avanzando</button></div>`),80);}
  /* El centro de estudio solo utiliza materias reales de los planes importados. */
  const studyCareers = () => state.careers.map((c, i) => ({c, i})).filter(({c}) => c && Array.isArray(c.courses) && c.courses.length);
  const studySemesters = career => {
    const c = state.careers[Number(career)];
    if ((career !== '0' && career !== '1') || !c?.courses?.length) return [];
    return [...new Set(c.courses.map(x=>Number(x.semester)).filter(n=>Number.isInteger(n) && n>=1))].sort((a,b)=>a-b);
  };
  const studyCourses = (career, semester) => {
    const c = state.careers[Number(career)];
    if ((career !== '0' && career !== '1') || !c?.courses?.length || !studySemesters(career).includes(Number(semester))) return [];
    const seen = new Set();
    return c.courses.filter(x=>Number(x.semester)===Number(semester) && x.key && !seen.has(x.key) && seen.add(x.key)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));
  };
  function verifiedStudySelection(career,semester,key){
    const c=state.careers[Number(career)];
    if((career!=='0'&&career!=='1') || !c?.courses?.length) return null;
    if(!studySemesters(career).includes(Number(semester))) return null;
    const course=studyCourses(career,semester).find(x=>x.key===key);
    return course ? {career,semester:String(semester),key,course,name:c.name} : null;
  }
  function studyCareerOptions(current){return '<option value="">Selecciona tu carrera</option>'+studyCareers().map(({c,i})=>`<option value="${i}" ${current===String(i)?'selected':''}>${esc(c.name || 'Carrera '+(i+1))}</option>`).join('');}
  function studySemesterOptions(career,current){return '<option value="">Selecciona tu semestre</option>'+studySemesters(career).map(sem=>`<option value="${sem}" ${String(sem)===String(current)?'selected':''}>Semestre ${sem}</option>`).join('');}
  function studyCourseOptions(career,semester,current){return '<option value="">Selecciona una materia</option>'+studyCourses(career,semester).map(x=>`<option value="${esc(x.key)}" ${current===x.key?'selected':''}>${esc(x.name)}${Number(x.credits)>0?' · '+esc(x.credits)+' créditos':''}</option>`).join('');}
  /* Horario por carrera: las materias en curso se seleccionan explícitamente
     y quedan asociadas a la identidad de cada plan, nunca a un código global. */
  function scheduleCareerIndex(){
    const n=Number(state.scheduleCareer);
    return state.scheduleCareer!==null && [0,1].includes(n) && state.careers[n] ? n : activeIdx();
  }
  function rawCurrentCourseKeys(ci) {
    const id=planIdentity(state.careers[ci],ci)+'::'+ci;
    return id && Array.isArray(state.currentCoursesByPlan[id]) ? state.currentCoursesByPlan[id] : [];
  }
  function currentCourseKeys(ci) {
    const c=state.careers[ci];
    if(!c)return [];
    const selected=new Set();
    c.courses.forEach(course=>{
      if(equivalentCourseRefs(course.key,ci).some(ref=>rawCurrentCourseKeys(ref.ci).includes(ref.course.key))) selected.add(course.key);
    });
    return [...selected];
  }
  function setCurrentCourseKeys(ci,keys,changedKey=null,checked=null) {
    const c=state.careers[ci];
    if(!c)return;
    const refs=changedKey?equivalentCourseRefs(changedKey,ci):[{ci,course:null}];
    refs.forEach(ref=>{
      const plan=state.careers[ref.ci];
      if(!plan)return;
      const allowed=new Set(plan.courses.map(x=>x.key));
      const selected=new Set(rawCurrentCourseKeys(ref.ci).filter(k=>allowed.has(k)));
      if(changedKey&&ref.course){if(checked)selected.add(ref.course.key);else selected.delete(ref.course.key);}
      else if(!changedKey){const requested=new Set(keys);plan.courses.forEach(x=>requested.has(x.key)?selected.add(x.key):selected.delete(x.key));}
      state.currentCoursesByPlan[planIdentity(plan,ref.ci)+'::'+ref.ci]=[...selected];
    });
    save();
  }
  function scheduleEventCareer(ev){
    if(Number.isInteger(Number(ev.career)) && ev.career!==null && ev.career!==undefined && [0,1].includes(Number(ev.career))) return Number(ev.career);
    const matches=state.careers.map((c,i)=>c?.courses?.some(x=>x.key===ev.key)?i:null).filter(x=>x!==null);
    // Eventos anteriores sin carrera: asignación inequívoca si existe; si no,
    // mantenerlos en el espacio principal sin duplicarlos en otra carrera.
    const ci=matches.length===1 ? matches[0] : activeIdx();
    // Anclar cada evento legado una sola vez a un plan concreto.
    if(state.careers[ci]){
      ev.career=ci;
      ev.planId=planIdentity(state.careers[ci],ci);
      save();
    }
    return ci;
  }
  function scheduleEventBelongs(ev,ci){
    if(scheduleEventCareer(ev)!==ci)return false;
    return !ev.planId || ev.planId===planIdentity(state.careers[ci],ci);
  }
  function scheduleOptionsFor(career,mode,semester){
    const c=state.careers[Number(career)];
    if(!c?.courses?.length)return [];
    if(mode==='current'){
      const active=new Set(currentCourseKeys(Number(career)));
      return c.courses.filter(x=>active.has(x.key)).sort((a,b)=>Number(a.semester)-Number(b.semester)||xName(a).localeCompare(xName(b),'es'));
    }
    return studyCourses(String(career),String(semester));
  }
  const xName = x => String(x?.name||'');
  function evSubjectOptions(ci,mode,sem,selected){
    return '<option value="">Selecciona una asignatura</option>'+scheduleOptionsFor(String(ci),mode,sem).map(x=>`<option value="${esc(x.key)}" ${x.key===selected?'selected':''}>${mode==='current'?'Sem. '+x.semester+' · ':''}${esc(displayCourseName(x,state.careers[ci]))}${x.credits?' · '+esc(x.credits)+' cr.':''}</option>`).join('');
  }
  function updateEventSelectors({resetCourse=false}={}){
    const form=$('#eventForm');if(!form)return;
    const career=$('#evCareer'),subject=$('#evKey'),title=$('#evTitle'),hint=$('#evSelectionHint');
    if(!career||!subject)return;
    const ci=career.value,valid=studyCareers().some(({i})=>String(i)===ci);
    const previous=resetCourse?'':subject.value;
    const editingPrevious=form.dataset.custom==='1';
    subject.innerHTML=valid?evSubjectOptions(ci,'current','',previous):'<option value="">Selecciona una carrera primero</option>';
    if(editingPrevious)subject.innerHTML+='<option value="__custom__">Clase guardada anteriormente (editar)</option>';
    subject.disabled=!valid;
    if(valid && !resetCourse && previous && [...subject.options].some(o=>o.value===previous))subject.value=previous;
    const course=valid?state.careers[Number(ci)]?.courses.find(x=>x.key===subject.value):null;
    if(title){
      if(course)title.value=course.name;
      else if(subject.value!=='__custom__')title.value='';
      title.readOnly=true;
    }
    const available=valid?scheduleOptionsFor(ci,'current',''):[];
    if(hint)hint.innerHTML=!valid?'Elige una carrera con malla cargada.':!available.length?'<b>No hay materias marcadas «Cursando» en esta carrera.</b> Ve a Plan de estudios, activa su casilla y regresa al horario.':`Puedes programar cualquiera de las ${available.length} materias marcadas «Cursando» en esta carrera, sin limitarte a un semestre.`;
  }

  function normalizeStudySelection(){
    const s=state.studySelection;
    if(!studyCareers().some(x=>String(x.i)===s.career)){s.career='';s.semester='';s.course='';}
    else if(!studySemesters(s.career).includes(Number(s.semester))){s.semester='';s.course='';}
    else if(!studyCourses(s.career,s.semester).some(x=>x.key===s.course)) s.course='';
    studyTimer.course=s.course;
  }
  function studySelectGroup(sel, prefix='study'){
    const cv=sel.career,sv=sel.semester,kv=sel.course;
    return `<div class="study-select-grid"><label for="${prefix}Career">Carrera<select id="${prefix}Career" ${!studyCareers().length?'disabled':''} required>${studyCareerOptions(cv)}</select></label><label for="${prefix}Semester">¿En qué semestre estás?<select id="${prefix}Semester" ${!cv?'disabled':''} required>${studySemesterOptions(cv,sv)}</select></label><label for="${prefix}Course">Materia de ese semestre<select id="${prefix}Course" ${!sv?'disabled':''} required>${studyCourseOptions(cv,sv,kv)}</select></label></div>`;
  }
  function refreshStudySelects(prefix){
    const career=$('#'+prefix+'Career'),semester=$('#'+prefix+'Semester'),course=$('#'+prefix+'Course');
    if(!career||!semester||!course)return;
    const semesters=studySemesters(career.value);
    if(!semesters.includes(Number(semester.value)))semester.value='';
    semester.innerHTML=studySemesterOptions(career.value,semester.value);
    semester.disabled=!career.value;
    const courses=studyCourses(career.value,semester.value);
    if(!courses.some(x=>x.key===course.value))course.value='';
    course.innerHTML=studyCourseOptions(career.value,semester.value,course.value);
    course.disabled=!semester.value;
    if(prefix==='study'){
      state.studySelection={career:career.value,semester:semester.value,course:course.value};
      studyTimer.course=course.value;
      const start=$('#focusToggle'); if(start)start.disabled=!verifiedStudySelection(career.value,semester.value,course.value);
      save();updateStudyTimerDom();
    }
  }
  function updateStudyTimerDom(){
    const valid=verifiedStudySelection(state.studySelection.career,state.studySelection.semester,state.studySelection.course);
    const locked=!!studyTimer.context&&(studyTimer.running||studyTimer.left<studyTimer.total);
    const time=$('#focusTime');if(time)time.textContent=`${String(Math.floor(studyTimer.left/60)).padStart(2,'0')}:${String(studyTimer.left%60).padStart(2,'0')}`;
    const button=$('#focusToggle');if(button){button.textContent=studyTimer.running?'Pausar sesión':studyTimer.left<studyTimer.total?'Continuar sesión':'Comenzar sesión';button.disabled=!studyTimer.running&&!valid;}
    const elapsed=Math.min(100,Math.max(0,(studyTimer.total-studyTimer.left)/studyTimer.total*100)),bar=$('#focusElapsed');if(bar)bar.style.width=elapsed+'%';
    const progress=$('#focusProgress');if(progress)progress.setAttribute('aria-valuenow',String(Math.round(elapsed)));
    const status=$('#focusSessionState');if(status)status.textContent=studyTimer.running?'En concentración':studyTimer.left<studyTimer.total?'Sesión pausada':valid?'Lista para comenzar':'Elige tu materia';
    const hint=$('#studySelectionHint');if(hint)hint.textContent=locked?'Tu sesión está vinculada a esta materia. Reinicia para cambiarla.':valid?'Materia de tu plan seleccionada. Ya puedes comenzar.':'Elige carrera, semestre y materia para preparar tu sesión.';
    for(const id of ['studyCareer','studySemester','studyCourse','studyFocusNote']){const el=$('#'+id);if(!el)continue;el.disabled=locked||(id==='studyCareer'?!studyCareers().length:id==='studySemester'?!state.studySelection.career:id==='studyCourse'?!state.studySelection.semester:false);}
    document.querySelectorAll('.study-studio [data-action="study-set"]').forEach(el=>{el.classList.toggle('on',Number(el.dataset.min)*60===studyTimer.total);el.setAttribute('aria-pressed',String(Number(el.dataset.min)*60===studyTimer.total));el.disabled=studyTimer.running;});
    for(const id of ['focusCustomMinutes','focusCustomApply']){const el=$('#'+id);if(el)el.disabled=studyTimer.running;}
  }
  function stopStudyTimer(){
    if(studyTimer.running&&studyTimer.endsAt)studyTimer.left=Math.max(0,Math.ceil((studyTimer.endsAt-Date.now())/1000));
    studyTimer.running=false;studyTimer.endsAt=0;if(studyTimerInterval){clearInterval(studyTimerInterval);studyTimerInterval=null;}updateStudyTimerDom();
  }
  function setStudyMinutes(value){
    const min=Number(value);if(!Number.isInteger(min)||min<5||min>180){toast('Elige una duración entre 5 y 180 minutos.','err');return false;}
    stopStudyTimer();studyTimer.total=min*60;studyTimer.left=studyTimer.total;studyTimer.context=null;studyTimer.endsAt=0;const input=$('#focusCustomMinutes');if(input)input.value=String(min);updateStudyTimerDom();return true;
  }
  function toggleStudyTimer(){
    if(studyTimer.running){stopStudyTimer();return;}
    const selection=studyTimer.context||{career:state.studySelection.career,semester:state.studySelection.semester,key:state.studySelection.course};
    const valid=verifiedStudySelection(selection.career,selection.semester,selection.key);
    if(!valid){toast('Selecciona una materia válida de tu plan antes de iniciar. Si cambiaste el plan, reinicia la sesión.','err');return;}
    const context=studyTimer.context||{career:valid.career,semester:valid.semester,key:valid.key,note:String(state.studyFocusNote||'').slice(0,160)};
    studyTimer.context=context;studyTimer.course=context.key;studyTimer.running=true;studyTimer.endsAt=Date.now()+studyTimer.left*1000;
    studyTimerInterval=setInterval(()=>{
      studyTimer.left=Math.max(0,Math.ceil((studyTimer.endsAt-Date.now())/1000));updateStudyTimerDom();
      if(studyTimer.left===0){
        stopStudyTimer();const min=Math.round(studyTimer.total/60),before=todayStudyMinutes();
        if(!verifiedStudySelection(context.career,context.semester,context.key)){setStudyMinutes(min);toast('La materia ya no pertenece al plan cargado. La sesión no se registró.','err');return;}
        state.studyLog.push({id:Date.now(),key:context.key,career:context.career,semester:context.semester,note:context.note,minutes:min,date:new Date().toISOString()});
        setStudyMinutes(min);save();toast(`Sesión de ${min} min completada`);if(state.view==='estudio')render();celebrateStudyGoal(before,before+min);
      }
    },1000);updateStudyTimerDom();
  }
  function studyWeekDays(now=new Date()){
    const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));
    return ['L','M','X','J','V','S','D'].map((label,i)=>{const day=new Date(start);day.setDate(start.getDate()+i);const key=localDayKey(day);return{label,key,today:key===localDayKey(now),date:day,minutes:state.studyLog.filter(x=>localDayKey(new Date(x.date))===key).reduce((n,x)=>n+Math.max(0,Number(x.minutes)||0),0)};});
  }
  function studyLogTitle(entry){return state.careers[Number(entry.career)]?.courses.find(x=>x.key===entry.key)?.name||findCourse(entry.key)?.name||'Sesión de estudio';}
  function viewStudy(){
    normalizeStudySelection();
    const today=todayStudyMinutes(),week=weekStudyMinutes(),goal=Math.max(15,Number(state.studyDailyGoal)||60),pct=Math.min(100,Math.round(today/goal*100));
    const recent=[...state.studyLog].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8),done=today>=goal,days=studyWeekDays(),peak=Math.max(1,...days.map(x=>x.minutes));
    const ready=!!verifiedStudySelection(state.studySelection.career,state.studySelection.semester,state.studySelection.course),noPlans=!studyCareers().length;
    const todaySessions=state.studyLog.filter(x=>localDayKey(new Date(x.date))===localDayKey()).length;
    setTimeout(updateStudyTimerDom,0);
    return `<section class="study-studio">
      <header class="study-studio-head"><div><span class="study-kicker">${ic('clock')} TU ESPACIO DE ENFOQUE</span><h2>Una sesión, un paso más.</h2><p>Elige tu materia, define lo que quieres avanzar y dedica este momento a estudiar.</p></div><span class="study-session-status" id="focusSessionState">${ready?'Lista para comenzar':'Elige tu materia'}</span></header>
      <div class="study-layout study-studio-grid">
        <section class="focus-card study-focus" aria-label="Temporizador de estudio">
          <div class="study-card-head"><div><span class="study-step">02</span><h3>Tu sesión de enfoque</h3></div><span class="study-card-caption">Un paso a la vez</span></div>
          <div class="study-timer-panel"><span class="study-timer-label">TIEMPO RESTANTE</span><div class="focus-time" id="focusTime" role="timer" aria-label="Tiempo restante de la sesión">${String(Math.floor(studyTimer.left/60)).padStart(2,'0')}:${String(studyTimer.left%60).padStart(2,'0')}</div><div class="study-timer-track" id="focusProgress" role="progressbar" aria-label="Avance de la sesión" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="focusElapsed"></i></div><div class="focus-presets" role="group" aria-label="Duración de la sesión">${[25,50,90].map(min=>`<button type="button" class="${studyTimer.total===min*60?'on':''}" data-action="study-set" data-min="${min}" aria-pressed="${studyTimer.total===min*60}">${min} min</button>`).join('')}</div><div class="study-custom-time"><label for="focusCustomMinutes">Tu duración</label><div><input id="focusCustomMinutes" type="number" min="5" max="180" step="1" value="${Math.round(studyTimer.total/60)}" aria-label="Duración personalizada en minutos"><span>min</span><button type="button" id="focusCustomApply" class="btn ghost" data-action="study-custom">Aplicar</button></div></div><div class="focus-actions"><button type="button" class="btn primary" id="focusToggle" data-action="study-toggle" ${!ready&&!studyTimer.running?'disabled':''}>${studyTimer.running?'Pausar sesión':'Comenzar sesión'}</button><button type="button" class="btn ghost" data-action="study-reset">Reiniciar</button></div></div>
        </section>
        <aside class="study-side"><section class="study-session-setup"><div class="study-card-head"><div><span class="study-step">01</span><h3>Prepara tu sesión</h3></div><span class="study-card-caption">Materias de tu plan</span></div>          ${noPlans?`<div class="study-context-warning">${ic('info')}Carga tu plan para elegir tus materias.<button class="btn ghost" data-action="nav" data-view="inicio">Cargar plan</button></div>`:''}
          ${studySelectGroup(state.studySelection)}<p class="study-context-help" id="studySelectionHint">${ready?'Materia de tu plan seleccionada. Ya puedes comenzar.':'Elige carrera, semestre y materia para preparar tu sesión.'}</p>
          <label class="study-focus-note" for="studyFocusNote">¿Qué quieres avanzar?<textarea id="studyFocusNote" maxlength="160" rows="2" placeholder="Ej. Resolver los ejercicios del tema 3">${esc(String(state.studyFocusNote||'').slice(0,160))}</textarea><small>Un objetivo corto para mantener el enfoque.</small></label>
</section><div class="study-focus-tip">${ic('info')}<p>Deja cerca lo que necesitas, silencia las distracciones y avanza una cosa a la vez.</p></div>
        </aside>
      </div>
      <div class="study-overview-grid"><section class="study-goal study-daily"><div class="study-card-head"><div><span class="study-step">03</span><h3>Tu avance de hoy</h3></div><button class="link" data-action="study-goal">Ajustar</button></div><div class="study-daily-summary"><strong>${today}<span> min</span></strong><span>de ${goal} minutos<br>para tu meta diaria</span></div><div class="study-goal-track" role="progressbar" aria-label="Avance de la meta diaria" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><div class="study-goal-detail"><span>${pct}% completado</span><span>${Math.max(0,goal-today)} min por completar</span></div><div class="study-micro-stats"><div><b>${todaySessions}</b><span>${todaySessions===1?'sesión hoy':'sesiones hoy'}</span></div><div><b>${Math.floor(week/60)}<small> h </small>${week%60}<small> min</small></b><span>esta semana</span></div></div></section>
          <section class="study-week-card"><div class="study-card-head"><div><h3>Tu semana de estudio</h3></div><span class="study-card-caption">${week} min</span></div><div class="study-week-chart" role="img" aria-label="Minutos de estudio de lunes a domingo: ${days.map(x=>x.label+' '+x.minutes).join(', ')}">${days.map(day=>`<div class="study-day ${day.today?'is-today':''}" title="${day.date.toLocaleDateString('es-NI',{weekday:'long',day:'numeric',month:'short'})}: ${day.minutes} min"><span>${day.minutes||'—'}</span><div class="study-day-rail"><i style="height:${Math.round(day.minutes/peak*100)}%"></i></div><b>${day.label}</b></div>`).join('')}</div><p class="study-week-caption">${week?'Cada bloque de tiempo suma a tu avance.':'Tu primera sesión dará inicio a esta semana.'}</p></section>
          ${done?`<div class="study-motivation">${ic('check')}<div><b>Meta de hoy completada</b><p>${esc(motivationForToday())}</p></div></div>`:''}
          </div>
      <section class="panel study-history"><div class="panel-head"><div><span class="study-kicker">TU CONSTANCIA, EN UN SOLO LUGAR</span><h3>Sesiones recientes</h3><p>Las sesiones completas se guardan automáticamente. También puedes registrar tiempo que estudiaste fuera del temporizador.</p></div><button class="btn ghost" data-action="study-manual" ${noPlans?'disabled':''}>${ic('plus')}Registrar sesión</button></div><div class="study-log">${recent.length?recent.map(entry=>`<div class="study-row"><span class="study-min">${entry.minutes}<small> min</small></span><div class="study-row-main"><b>${esc(studyLogTitle(entry))}</b><small>${esc(state.careers[Number(entry.career)]?.name||'')} ${entry.semester?'· Semestre '+esc(entry.semester)+' · ':''}${new Date(entry.date).toLocaleString('es-NI',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small>${entry.note?`<p>${esc(entry.note)}</p>`:''}</div><button class="icon-btn sm" data-action="study-delete" data-id="${entry.id}" aria-label="Eliminar sesión de ${esc(studyLogTitle(entry))}">${ic('trash')}</button></div>`).join(''):`<div class="study-history-empty">${ic('clock')}<div><b>Aquí empieza tu constancia</b><p>Completa una sesión o registra el tiempo que ya estudiaste.</p></div></div>`}</div></section>
    </section>`;
  }

  function openStudyManual(){
    normalizeStudySelection();
    const selection={...state.studySelection};
    openModal(`${modalHead('Registrar sesión de estudio','Selecciona tu carrera y semestre antes de registrar tiempo')}<form class="m-body form" id="studyForm">${studySelectGroup(selection,'manualStudy')}<div class="f-row"><label>Minutos<input name="minutes" type="number" min="5" max="600" step="1" value="60" required></label><label>Fecha<input name="date" type="date" max="${localDate()}" value="${localDate()}" required></label></div><div class="note">${ic('info')}<span>Solo se pueden registrar materias del semestre seleccionado; no se permiten fechas futuras.</span></div></form><div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" type="submit" form="studyForm">${ic('check')}Guardar sesión</button></div>`);
  }
  function saveStudy(form){
    const f=new FormData(form);
    const career=$('#manualStudyCareer')?.value||'',semester=$('#manualStudySemester')?.value||'',key=$('#manualStudyCourse')?.value||'';
    const valid=verifiedStudySelection(career,semester,key);
    if(!valid){toast('Selecciona una carrera, un semestre y una materia del plan cargado.','err');return;}
    const min=Number(f.get('minutes')),date=String(f.get('date')||'');
    if(!Number.isInteger(min)||min<5||min>600){toast('La sesión debe durar entre 5 y 600 minutos enteros.','err');return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(date+'T12:00:00').getTime()) || date>localDate()){
      toast('Indica una fecha válida que no sea futura.','err');return;
    }
    const isToday=date===localDayKey(),before=isToday?todayStudyMinutes():0;
    state.studyLog.push({id:Date.now(),career,semester,key,minutes:min,date:date+'T12:00:00'});
    save();closeModal();render();toast('Sesión de estudio registrada');if(isToday)celebrateStudyGoal(before,before+min);
  }
  function openStudyGoal(){openModal(`${modalHead('Meta diaria','Define cuántos minutos quieres estudiar cada día')}<form class="m-body form" id="goalForm"><label>Minutos por día<input name="goal" type="number" min="15" max="720" step="15" value="${state.studyDailyGoal}" required></label><div class="note">${ic('info')}<span>Ejemplo: 60 minutos significa una hora de estudio al día. Al cumplirla recibirás uno de 20 mensajes motivadores.</span></div></form><div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" type="submit" form="goalForm">${ic('check')}Guardar meta</button></div>`);}

  /* ---------------- Modales de detalle / edición ---------------- */
  const folderSections = [
    { kind: 'program', title: 'Programa', icon: 'sheet', add: 'Adjuntar', empty: 'Sin programa adjunto.' },
    { kind: 'guide', title: 'Guías', icon: 'book', add: 'Adjuntar', empty: 'Sin guías adjuntas.' },
    { kind: 'link', title: 'Aula virtual', icon: 'link', add: 'Añadir enlace', empty: 'Sin enlaces guardados.' },
    { kind: 'note', title: 'Apuntes', icon: 'notebook', add: 'Nuevo apunte', empty: 'Sin apuntes de esta materia.' }
  ];

  function folderContext(ci, key) {
    const plan = state.careers[ci];
    const course = plan?.courses.find(item => item.key === key);
    if (!course) return null;
    const identity = planIdentity(plan, ci);
    const elective = electiveChoiceFor(course, plan)?.code || '';
    const scope = JSON.stringify([ci, identity, key, elective]);
    return { ci, key, identity, elective, scope, course, plan };
  }

  function folderStorage(mode, operation) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('rutaAcademica.courseFolders.v1', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('resources', { keyPath: 'id' });
        store.createIndex('scope', 'scope');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const transaction = db.transaction('resources', mode);
          const query = operation(transaction.objectStore('resources'));
          transaction.oncomplete = () => { db.close(); resolve(query.result); };
          transaction.onabort = () => { db.close(); reject(transaction.error); };
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }

  function folderNotes(context) {
    return X().notes.filter(note => Number(note.career) === context.ci && note.key === context.key &&
      (note.planIdentity === undefined ? Number(note.semester) === Number(context.course.semester) : note.planIdentity === context.identity) &&
      (note.electiveCode === undefined || note.electiveCode === context.elective))
      .sort((a, b) => Number(b.updated || 0) - Number(a.updated || 0));
  }

  const folderBack = (label = 'Volver a la carpeta') =>
    `<button class="btn ghost course-folder-back" type="button" data-folder-back>${ic('arrow')}${label}</button>`;

  function folderItem(section, item) {
    const title = esc(item.title);
    const open = section.kind === 'link' && safeFolderUrl(item.url)
      ? `<a href="${esc(safeFolderUrl(item.url))}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : `<button type="button" data-folder-open="${esc(item.id)}" title="${section.kind === 'note' ? 'Leer apunte' : 'Descargar archivo'}">${title}</button>`;
    return `<li class="course-folder-item">${open}
      ${['link', 'note'].includes(section.kind) ? `<button type="button" class="icon-btn" data-folder-edit="${esc(item.id)}" aria-label="Editar ${title}">${ic('edit')}</button>` : ''}
      <button type="button" class="icon-btn" data-folder-delete="${esc(item.id)}" aria-label="Eliminar ${title}">${ic('trash')}</button>
    </li>`;
  }

  function folderSection(section, entries, unavailable) {
    return `<section class="course-folder-card" data-folder-kind="${section.kind}">
      <header><span class="course-folder-icon">${ic(section.icon)}</span><h3>${section.title}</h3>
        <button type="button" class="btn ghost" data-folder-add ${unavailable ? 'disabled' : ''}>${ic('plus')}${section.add}</button>
      </header>
      ${entries.length
        ? `<ul>${entries.map(item => folderItem(section, item)).join('')}</ul>`
        : `<p class="course-folder-empty">${unavailable ? 'No se pudo acceder al almacenamiento.' : section.empty}</p>`}
    </section>`;
  }

  async function openCourseFolder(ci, key) {
    const context = folderContext(ci, key);
    if (!context) return;
    openModal(`${modalHead(esc(displayCourseName(context.course, context.plan)), 'Carpeta de la materia')}
      <div class="m-body">
        <div id="courseFolderGrid" class="course-folder-grid" aria-busy="true"><p class="course-folder-empty" role="status">Cargando materiales…</p></div>
        <p class="course-folder-hint">Los archivos y enlaces se guardan en este navegador. Descarga los archivos que quieras conservar fuera de la carpeta.</p>
      </div>
      <div class="m-foot">${folderBack('Volver a la ficha')}</div>`, true);
    const grid = $('#courseFolderGrid');
    $('#modalCard').scrollTop = 0;
    $('#modalCard [data-folder-back]').onclick = () => {
      openCourse(key, ci);
      $('#modalCard').scrollTop = 0;
      $('.course-folder-entry')?.focus({ preventScroll: true });
    };
    let resources = [], unavailable = false;
    try {
      resources = await folderStorage('readonly', store => store.index('scope').getAll(context.scope));
      resources.sort((a, b) => b.updated - a.updated);
    } catch {
      unavailable = true;
    }
    if (!grid.isConnected || $('#modal').classList.contains('hidden')) return;
    const notes = folderNotes(context);
    grid.innerHTML = folderSections.map(section => folderSection(section,
      section.kind === 'note' ? notes : resources.filter(item => item.kind === section.kind),
      unavailable && section.kind !== 'note')).join('');
    grid.setAttribute('aria-busy', 'false');
    grid.onclick = async event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      const kind = button.closest('[data-folder-kind]').dataset.folderKind;
      const { folderOpen, folderEdit, folderDelete, folderAdd } = button.dataset;
      if (folderAdd !== undefined) {
        if (kind === 'note') openNoteModal('', context);
        else openFolderResourceForm(context, kind);
        return;
      }
      const item = (kind === 'note' ? notes : resources).find(entry => entry.id === (folderOpen || folderEdit || folderDelete));
      if (!item) return;
      if (folderOpen) {
        if (kind === 'note') openNoteReader(item.id, context);
        else if (item.file) {
          const url = URL.createObjectURL(item.file);
          const link = document.createElement('a');
          link.href = url;
          link.download = item.file.name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
      } else if (folderEdit) {
        if (kind === 'note') openNoteModal(item.id, context);
        else openFolderResourceForm(context, kind, item);
      } else if (folderDelete) {
        if (kind === 'note') {
          if (deleteNote(item.id)) openCourseFolder(ci, key);
          return;
        }
        if (!confirm(`¿Eliminar «${item.title}» de esta carpeta?`)) return;
        button.disabled = true;
        try {
          await folderStorage('readwrite', store => store.delete(item.id));
          if (grid.isConnected && !$('#modal').classList.contains('hidden')) openCourseFolder(ci, key);
          toast('Material eliminado');
        } catch {
          button.disabled = false;
          toast('No se pudo eliminar el material.', 'err');
        }
      }
    };
    grid.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  function safeFolderUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  }

  function openFolderResourceForm(context, kind, item) {
    const isLink = kind === 'link';
    const heading = isLink ? (item ? 'Editar enlace' : 'Añadir enlace')
      : kind === 'program' ? 'Adjuntar programa' : 'Adjuntar guías';
    openModal(`${modalHead(heading, esc(displayCourseName(context.course, context.plan)))}
      <form class="m-body form" id="courseFolderForm">
        ${isLink
          ? `<label>Nombre del enlace<input name="title" required maxlength="120" value="${esc(item?.title)}" placeholder="Ej. Aula virtual de la materia"></label>
             <label>Dirección web<input type="url" name="url" required maxlength="2048" value="${esc(item?.url)}" placeholder="https://…"></label>`
          : `<label>${kind === 'program' ? 'Archivo del programa' : 'Archivos de las guías'}<input type="file" name="files" ${kind === 'guide' ? 'multiple' : ''} required></label>`}
      </form>
      <div class="m-foot">${folderBack()}<button class="btn primary" type="submit" form="courseFolderForm">${ic('check')}Guardar</button></div>`);
    const form = $('#courseFolderForm');
    const submit = $('[form="courseFolderForm"]');
    $('#modalCard [data-folder-back]').onclick = () => openCourseFolder(context.ci, context.key);
    form.onsubmit = async event => {
      event.preventDefault();
      if (submit.disabled) return;
      const data = new FormData(form);
      const base = { scope: context.scope, kind, updated: Date.now() };
      let entries;
      if (isLink) {
        const url = safeFolderUrl(String(data.get('url')).trim());
        const title = String(data.get('title')).trim();
        if (!url || !title) return toast('Escribe un nombre y un enlace http o https válido.', 'err');
        entries = [{ ...base, id: item?.id || uid(), title, url }];
      } else {
        entries = [...form.elements.files.files].map(file => ({ ...base, id: uid(), title: file.name, file }));
        if (!entries.length) return;
      }
      submit.disabled = true;
      try {
        await folderStorage('readwrite', store => {
          let query;
          for (const entry of entries) query = store.put(entry);
          return query;
        });
        if (form.isConnected && !$('#modal').classList.contains('hidden')) openCourseFolder(context.ci, context.key);
        toast(isLink ? 'Enlace guardado' : 'Archivos guardados');
      } catch {
        submit.disabled = false;
        toast('No se pudo guardar. Revisa el espacio disponible y el acceso al almacenamiento del navegador.', 'err');
      }
    };
    form.querySelector('input')?.focus();
  }

  function openCourse(key, ci) {
    let c = state.careers[ci];
    if (!c || !c.courses.some(x => x.key === key)) c = state.careers.find(cc => cc && cc.courses.some(x => x.key === key));
    if (!c) { toast(`${fmtCode(key)} no está en ninguno de tus planes`, 'err'); return; }
    ci = state.careers.indexOf(c);
    const x = c.courses.find(y => y.key === key);
    const showCodes = state.view !== 'shared';
    const st = statusOf(x, ci);
    const { roots } = chain(x, c);
    const paths=pendingRequirementRoutes(x,c).filter(route=>route.length>2);
    const unl = unlocks(key, c);
    const other = state.careers[1 - ci];
    const inOther = equivalentCourseRefs(key, ci).find(ref => ref.ci !== ci)?.course;
    const g = getGradeInfo(key, ci);

    openModal(`
      ${modalHead(`<span class="course-detail-title">${showCodes ? `<span class="code lg course-detail-code">${esc(x.code)}</span>` : ''}<span class="course-detail-name">${esc(x.name)}</span></span>`, esc(c.name))}
      <div class="m-body">
        ${electiveOptionsFor(x,c).length ? `<div class="course-detail-elective">${electiveControl(x,c,ci)}</div>` : ''}
        <div class="detail-grid">
          <div><label>Estado</label>${badge(st)}</div>
          <div><label>Semestre</label><b>${x.semester}°</b></div>
          <div><label>Créditos</label><b>${x.credits ?? '—'}</b></div>
          ${x.hours != null ? `<div><label>Horas</label><b>${x.hours}</b></div>` : ''}
          <div><label>Desbloquea</label><b>${unl.length} clases</b></div>
        </div>

        <button type="button" class="course-folder-entry" data-action="course-folder" data-key="${esc(key)}" data-c="${ci}">
          <span class="course-folder-icon">${ic('folder')}</span>
          <span><strong>Carpeta de la materia</strong><small>Programa, guías, aula virtual y apuntes</small></span>
          ${ic('arrow-right')}
        </button>

        <div class="detail-grade-box">
          <div class="dgb-head">
            <b>${ic('grade')}Calificaciones (3 Parciales / Promedio 100/3)</b>
            <div data-grade-result aria-live="polite">${gradeResultMarkup(g, ci)}</div>
          </div>
          <div class="dgb-inputs">
            <label>Parcial 1
              <input type="number" min="0" max="100" class="grade-input" value="${g.p[0] !== null ? g.p[0] : ''}" data-grade="${esc(key)}" data-n="0" data-c="${ci}" placeholder="0-100">
            </label>
            <label>Parcial 2
              <input type="number" min="0" max="100" class="grade-input" value="${g.p[1] !== null ? g.p[1] : ''}" data-grade="${esc(key)}" data-n="1" data-c="${ci}" placeholder="0-100">
            </label>
            <label>Parcial 3
              <input type="number" min="0" max="100" class="grade-input" value="${g.p[2] !== null ? g.p[2] : ''}" data-grade="${esc(key)}" data-n="2" data-c="${ci}" placeholder="0-100">
            </label>
          </div>
          <div class="dgb-hint" data-grade-status>${gradeStatusMarkup(g)}</div>
        </div>

        ${inOther ? `<div class="note dark">${ic('link')}<span>Clase <b>compartida</b>: también está en <b>${esc(other.name)}</b> (${inOther.semester}° semestre). Al aprobarla cuenta para ambas carreras.</span></div>` : ''}
        <h4>Requisitos</h4>
        ${x.prereqs.length ? `<div class="req-items">${x.prereqs.map(k => `<div class="req-item ${isTaken(k, ci) ? 'ok' : ''}" data-action="open" data-key="${esc(k)}" data-c="${ci}">
            <span class="dot">${ic(isTaken(k, ci) ? 'check' : 'lock')}</span>${showCodes ? `<span class="code">${esc(codeOf(k))}</span>` : ''}<span>${esc(findCourse(k, c)?.name || nameOf(k))}</span><small>${isTaken(k, ci) ? 'Aprobada' : 'Pendiente'}</small></div>`).join('')}</div>`
          : '<p class="muted-p">Esta clase no tiene requisitos.</p>'}
        ${x.coreqs?.length ? `<h4>Correquisitos</h4><div class="chips">${x.coreqs.map(k => chip(k,{ci})).join('')}</div><div class="note">${ic('info')}<span>Los correquisitos vienen impresos en el plan, pero no se tratan como prerrequisitos ni bloquean la materia.</span></div>` : ''}
        ${st === 'blocked' ? `<div class="note">${ic('route')}<div><b>Para llevar esta clase, debes llevar primero:</b>
            <div class="chips mt">${roots.map(r => chip(r.key, { strong: true, ci })).join('') || '—'}</div>
            ${paths.length?`<div class="req-paths">${paths.slice(0,3).map((route,i)=>`<div class="req-path"><span class="req-path-label">Ruta${paths.length>1?' '+(i+1):''}</span><ol>${route.map(y=>`<li>${esc(y.name)}</li>`).join('')}</ol></div>`).join('')}</div>`:''}</div></div>` : ''}
        ${unl.length ? `<h4>Al aprobarla podrás avanzar en</h4><div class="chips">${unl.map(u => chip(u.key,{ci})).join('')}</div>` : ''}
      </div>
      <div class="m-foot">
        <button class="btn ghost" data-action="grade-sim" data-key="${esc(key)}" data-c="${ci}">${ic('grade')}Simular nota</button>
        <button class="btn ghost" data-action="quick-sched-course" data-key="${esc(key)}">${ic('calendar')}Agregar al horario</button>
        <button class="btn ghost" data-action="edit" data-key="${esc(key)}" data-c="${ci}">${ic('edit')}Editar</button>
        <button class="btn primary" data-action="toggle-modal" data-key="${esc(key)}" data-c="${ci}">${ic('check')}${isTaken(key, ci) ? 'Marcar como no aprobada' : 'Marcar como aprobada'}</button>
      </div>`);
  }

  function openEdit(ci, key, sem) {
    const c = state.careers[ci];
    if (!c) return;
    const x = key ? c.courses.find(y => y.key === key) : { code: '', name: '', credits: '', hours: '', semester: sem || 1, prereqs: [], coreqs: [] };
    const n = Math.max(12, semCount(c));
    openModal(`
      ${modalHead(key ? 'Editar clase' : 'Agregar clase', esc(c.name))}
      <form class="m-body form" id="editForm" data-c="${ci}" data-key="${esc(key || '')}">
        <div class="f-row">
          <label>Código<input name="code" required value="${esc(x.code)}" placeholder="MM-110"></label>
          <label>Créditos<input name="credits" type="number" min="0" max="30" step="0.5" value="${esc(x.credits ?? '')}"></label>
          <label>Horas<input name="hours" type="number" min="0" max="2000" step="1" value="${esc(x.hours ?? '')}"></label>
          <label>Semestre<select name="semester">${Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${x.semester === i + 1 ? 'selected' : ''}>${i + 1}°</option>`).join('')}</select></label>
        </div>
        <label>Nombre de la clase<input name="name" required value="${esc(x.name)}" placeholder="Matemática I"></label>
        <label>Requisitos <small>(solo los que aparecen como REQUISITO)</small><input name="prereqs" value="${esc(x.prereqs.map(codeOf).join(', '))}" placeholder="MM-110, FS-100"></label>
        <label>Correquisitos <small>(no bloquean la materia)</small><input name="coreqs" value="${esc((x.coreqs || []).map(codeOf).join(', '))}" placeholder="Código(s) si el plan los indica"></label>
      </form>
      <div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" type="submit" form="editForm">${ic('check')}Guardar</button></div>`);
    setTimeout(() => $('#editForm input[name=code]')?.focus(), 50);
  }

  function saveEdit(form) {
    const ci = +form.dataset.c, oldKey = form.dataset.key;
    const c = state.careers[ci];
    const fd = new FormData(form);
    const code = String(fd.get('code')).trim().toUpperCase();
    const name = String(fd.get('name')).trim();
    const nk = keyOf(code);
    if (!nk || !name) return toast('Código y nombre son obligatorios', 'err');
    if (nk !== oldKey && c.courses.some(y => y.key === nk)) return toast('Ya existe una clase con ese código', 'err');
    const prereqs = [...new Set(String(fd.get('prereqs')).split(/[,;]+/).map(s => keyOf(s.trim())).filter(k => k && k !== nk))];
    const coreqs = [...new Set(String(fd.get('coreqs') || '').split(/[,;]+/).map(s => keyOf(s.trim())).filter(k => k && k !== nk))];
    const credits = fd.get('credits') === '' ? null : Number(fd.get('credits'));
    const hours = fd.get('hours') === '' ? null : Number(fd.get('hours'));
    const previous = oldKey ? c.courses.find(y => y.key === oldKey) : null;
    const data = { ...(previous || {}), key: nk, code, name, credits, hours, semester: +fd.get('semester'), prereqs, coreqs };
    if (oldKey) {
      const idx = c.courses.findIndex(y => y.key === oldKey);
      c.courses[idx] = data;
      if (nk !== oldKey) {
        c.courses.forEach(y => { y.prereqs = y.prereqs.map(p => p === oldKey ? nk : p); if (Array.isArray(y.coreqs)) y.coreqs = y.coreqs.map(p => p === oldKey ? nk : p); });
        if (state.taken[oldKey]) { state.taken[nk] = true; delete state.taken[oldKey]; }
        if (state.grades[oldKey]) { state.grades[nk] = state.grades[oldKey]; delete state.grades[oldKey]; }
      }
    } else c.courses.push(data);
    closeModal(); render(); toast(oldKey ? 'Clase actualizada' : 'Clase agregada');
  }

  function deleteCourse(ci, key) {
    const c = state.careers[ci];
    const x = c.courses.find(y => y.key === key);
    if (!x || !confirm(`¿Eliminar ${x.code} — ${x.name}?`)) return;
    c.courses = c.courses.filter(y => y.key !== key);
    c.courses.forEach(y => { y.prereqs = y.prereqs.filter(p => p !== key); if (Array.isArray(y.coreqs)) y.coreqs = y.coreqs.filter(p => p !== key); });
    delete state.grades[key];
    delete state.taken[key];
    render(); toast('Clase eliminada');
  }

  function toggleTaken(key, ci = activeIdx()) {
    const c = state.careers[ci] || cur();
    ci = Math.max(0,state.careers.indexOf(c));
    const wasTaken = isTaken(key, ci);
    const course = findCourse(key, c);
    const beforeAvailable = c && !wasTaken ? availableSet(c) : new Set();
    ui.recentUnlocks = [];
    ui.unlockSource = null;
    setTakenAcrossPlans(key, !wasTaken, ci);
    if (!wasTaken) {
      if (course?.prereqs.some(p => !isTaken(p, ci))) toast('Ojo: ' + course.code + ' tiene requisitos que no has marcado', 'err');
      if (c) {
        const unlocked = newlyUnlocked(c, beforeAvailable, [key]);
        ui.recentUnlocks = unlocked.map(x => x.key);
        ui.unlockSource = key;
      }
    }
    render();
    if (wasTaken && state.view === 'plan' && course && !isTaken(key, ci)) {
      toast(`Aprobación retirada de ${course.name} · ${statusLabel[statusOf(course, ci)]}`);
    } else if (!wasTaken && ui.recentUnlocks.length) {
      const names = ui.recentUnlocks.slice(0, 3).map(k => codeOf(k)).join(', ');
      toast('→ ' + (ui.recentUnlocks.length === 1 ? 'Se desbloqueó' : 'Se desbloquearon') + ': ' + names + (ui.recentUnlocks.length > 3 ? '…' : ''));
    }
  }

  function jumpToCourse(key, careerIndex = activeIdx()) {
    if (!key) return;
    state.active = Number.isFinite(Number(careerIndex)) ? Number(careerIndex) : activeIdx();
    state.view = 'plan';
    state.filter = 'all';
    ui.search = '';
    document.body.classList.remove('menu-open');
    render();
    setTimeout(() => {
      const target = [...document.querySelectorAll('[data-course-anchor]')].find(el => el.dataset.courseAnchor === key);
      if (!target) return toast('No pude localizar esa materia en la malla', 'err');
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      target.classList.remove('course-target-flash');
      void target.offsetWidth;
      target.classList.add('course-target-flash');
      target.focus({ preventScroll: true });
      setTimeout(() => target.classList.remove('course-target-flash'), 2400);
    }, 90);
  }

  function markSemester(sem) {
    const c = cur();
    const all = c.courses.filter(x => (x.semester || 1) === sem);
    const allDone = all.length && all.every(x => isTaken(x.key));
    const beforeAvailable = availableSet(c);
    const changedKeys = all.filter(x => allDone ? isTaken(x.key) : !isTaken(x.key)).map(x => x.key);

    ui.recentUnlocks = [];
    ui.unlockSource = null;
    all.forEach(x => setTakenAcrossPlans(x.key, !allDone, activeIdx()));

    if (!allDone) {
      ui.recentUnlocks = newlyUnlocked(c, beforeAvailable, changedKeys).map(x => x.key);
    }
    render();
    if (allDone) {
      toast(`${sem}° semestre desmarcado`);
    } else if (ui.recentUnlocks.length) {
      toast(`${sem}° semestre aprobado · → ${ui.recentUnlocks.length} ${ui.recentUnlocks.length === 1 ? 'materia desbloqueada' : 'materias desbloqueadas'}`);
    } else {
      toast(`${sem}° semestre marcado como aprobado`);
    }
  }

  /* ---------------- Carga de planes ---------------- */
  async function handleFile(i, file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return toast('El archivo debe ser un PDF', 'err');
    ui.loading[i] = true; render();
    try {
      const r = await readBundledIndustrial(file) || await PlanParser.parsePDF(file);
      ui.loading[i] = false;
      finishParse(i, r, file.name);
    } catch (err) {
      console.error(err);
      ui.loading[i] = false; render();
      toast('No se pudo leer el PDF: ' + (err.message || err), 'err');
    }
  }

  function finishParse(i, r, fileName) {
    if (!r.courses.length) {
      render();
      openModal(`${modalHead('No encontramos clases', esc(fileName))}
        <div class="m-body"><p class="muted-p">No pudimos detectar códigos de clase en este documento.</p>
        ${r.warnings.map(w => `<div class="note">${ic('info')}<span>${esc(w)}</span></div>`).join('')}
        <p class="muted-p">Puedes copiar el texto del PDF y pegarlo, o crear el plan manualmente.</p></div>
        <div class="m-foot"><button class="btn ghost" data-action="manual" data-i="${i}">Crear manualmente</button><button class="btn primary" data-action="paste" data-i="${i}">${ic('clip')}Pegar texto</button></div>`);
      return;
    }
    const typed = ui.pendingNames[i].trim();
    const previous = state.careers[i];
    const next = {
      name:typed || r.title || fileName.replace(/\.pdf$/i,'') || `Carrera ${i + 1}`,
      fileName, planCode:r.planCode || '', importMode:r.format || '',
      courses:r.courses.map(course=>({...course,prereqs:[...course.prereqs],coreqs:[...(course.coreqs || [])]}))
    };
    if (String(r.planCode || '').toUpperCase() === INDUSTRIAL_PLAN && industrialPlan(previous)) {
      next.recordIdentity = planIdentity(previous,i);
      for (const course of next.courses) {
        const existing = previous.courses.find(x=>x.key===course.key);
        const choice = electiveChoiceFor(existing,previous);
        if (choice && electiveOptionsFor(course,next).some(option=>option.code===choice.code)) course.electiveChoice = choice.code;
      }
    }
    repairIndustrialRequirements(next);
    state.careers[i] = next;
    ui.pendingNames[i] = '';
    state.active = i;
    render();
    const c = state.careers[i];
    const withReq = c.courses.filter(x => x.prereqs.length).length;
    const sems = new Set(c.courses.map(x => x.semester)).size;
    const shared = sharedKeys().size;
    openModal(`${modalHead('¡Plan cargado!', esc(c.name))}
      <div class="m-body">
        <div class="detail-grid">
          <div><label>Clases</label><b>${c.courses.length}</b></div>
          <div><label>Semestres</label><b>${sems}</b></div>
          <div><label>Con requisito</label><b>${withReq}</b></div>
          <div><label>Compartidas</label><b>${list().length > 1 ? shared : '—'}</b></div>
        </div>
        ${r.strict ? `<div class="note dark">${ic('check')}<span><b>Lectura estricta${r.planCode ? ` · Plan ${esc(r.planCode)}` : ''}</b><br>La malla se construyó únicamente con las filas y columnas impresas en el PDF. No se infirieron códigos ni requisitos.</span></div>` : ''}
        ${r.warnings.map(w => `<div class="note">${ic('info')}<span>${esc(w)}</span></div>`).join('')}
        <p class="muted-p">Revisa que las clases se hayan detectado correctamente. Si algo falta o está mal, usa <b>Editar plan</b>.</p>
      </div>
      <div class="m-foot"><button class="btn ghost" data-action="review" data-i="${i}">${ic('edit')}Revisar y editar</button>
      <button class="btn primary" data-action="open-plan" data-i="${i}">${ic('grid')}Ver plan de estudios</button></div>`);
  }

  function openPaste(i) {
    openModal(`${modalHead('Pegar texto del plan', 'Copia el contenido del PDF (Ctrl/Cmd + A, C) y pégalo aquí')}
      <div class="m-body form">
        <label>Carrera<input id="pasteName" value="${esc(state.careers[i]?.name || ui.pendingNames[i] || '')}" placeholder="Nombre de la carrera"></label>
        <textarea id="pasteText" rows="12" placeholder="PRIMER SEMESTRE&#10;MM-110  Matemática I  5  Ninguno&#10;IS-110  Introducción a la Ingeniería  3&#10;SEGUNDO SEMESTRE&#10;MM-201  Cálculo I  5  MM-110"></textarea>
      </div>
      <div class="m-foot"><button class="btn ghost" data-action="close">Cancelar</button><button class="btn primary" data-action="parse-paste" data-i="${i}">${ic('check')}Analizar texto</button></div>`, true);
  }

  function loadDemo() {
    if (list().length && !confirm('Esto reemplazará los planes cargados por los de ejemplo. ¿Continuar?')) return;
    state.careers = window.DEMO_PLANS.map(p => ({
      name: p.name, fileName: 'Plan de ejemplo',
      courses: p.semesters.flatMap((arr, s) => arr.map(line => {
        const [code, name, credits, req] = line.split('|');
        return { key: keyOf(code), code, name, credits: +credits, semester: s + 1, prereqs: req ? req.split(',').map(keyOf) : [] };
      }))
    }));
    state.taken = {};
    ['MM110', 'IN101', 'EG011', 'IS110', 'SC101', 'MM201', 'IN102', 'FF101', 'IS210'].forEach(k => { state.taken[k] = true; });

    // Calificaciones de ejemplo (promedios 100/3)
    state.grades = {
      MM110: [85, 90, 80], // Promedio 85.0 (Aprobada)
      IN101: [95, 92, 98], // Promedio 95.0 (Aprobada)
      EG011: [88, 85, 91], // Promedio 88.0 (Aprobada)
      IS110: [90, 95, 85], // Promedio 90.0 (Aprobada)
      SC101: [75, 80, 85], // Promedio 80.0 (Aprobada)
      MM201: [70, 68, 72], // Promedio 70.0 (Aprobada)
      IN102: [85, 88, 90], // Promedio 87.7 (Aprobada)
      FF101: [80, 78, 82], // Promedio 80.0 (Aprobada)
      IS210: [88, 92, 90], // Promedio 90.0 (Aprobada)
      MM202: [75, 80, ''], // En curso (P1=75, P2=80)
      FS100: [65, 70, '']  // En curso
    };

    state.careerRecords = [null, null];
    const sample = careerRecord(activeIdx());
    sample.grades = state.grades;
    sample.taken = state.taken;
    syncCareerData();

    // Horarios de ejemplo
    state.events = [
      { id: 1, key: 'MM202', title: 'Cálculo II', day: 0, start: '08:00', end: '09:00', room: 'Edificio F1 - Aula 102', color: 'navy' },
      { id: 2, key: 'MM202', title: 'Cálculo II', day: 2, start: '08:00', end: '09:00', room: 'Edificio F1 - Aula 102', color: 'navy' },
      { id: 3, key: 'MM202', title: 'Cálculo II', day: 4, start: '08:00', end: '09:00', room: 'Edificio F1 - Aula 102', color: 'navy' },
      { id: 4, key: 'FS100', title: 'Física General I', day: 1, start: '10:00', end: '12:00', room: 'Laboratorio de Física 3', color: 'dark' },
      { id: 5, key: 'FS100', title: 'Física General I', day: 3, start: '10:00', end: '12:00', room: 'Laboratorio de Física 3', color: 'dark' },
      { id: 6, key: 'IS310', title: 'Programación II', day: 0, start: '13:00', end: '15:00', room: 'Lab de Cómputo 2', color: 'blue' },
      { id: 7, key: 'IS310', title: 'Programación II', day: 2, start: '13:00', end: '15:00', room: 'Lab de Cómputo 2', color: 'blue' }
    ];

    state.active = 0; state.view = 'plan';
    closeModal(); render(); toast('Planes de ejemplo, notas y horario cargados');
  }

  /* ---------------- Exportación de la malla en PDF ---------------- */
  const pdfSafeName = value => String(value || 'malla-academica')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'malla-academica';

  function loadScriptOnce(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(s => s.src === src);
      if (existing) {
        existing.addEventListener('load', () => ready() ? resolve() : reject(new Error('La librería no se inicializó')), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar la librería')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src; script.async = true;
      script.onload = () => ready() ? resolve() : reject(new Error('La librería no se inicializó'));
      script.onerror = () => reject(new Error('No se pudo cargar la librería'));
      document.head.appendChild(script);
    });
  }

  async function ensurePDFLibrary() {
    const jsPDFReady = () => !!window.jspdf?.jsPDF;
    const tableReady = () => !!window.jspdf?.jsPDF?.API?.autoTable;
    const jspdfSources = [
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js'
    ];
    const tableSources = [
      'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
      'https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js'
    ];
    if (!jsPDFReady()) {
      let ok = false;
      for (const src of jspdfSources) { try { await loadScriptOnce(src, jsPDFReady); ok = true; break; } catch {} }
      if (!ok) throw new Error('jsPDF no disponible');
    }
    if (!tableReady()) {
      let ok = false;
      for (const src of tableSources) { try { await loadScriptOnce(src, tableReady); ok = true; break; } catch {} }
      if (!ok) throw new Error('AutoTable no disponible');
    }
  }

  function pdfCourseRows(c, sem) {
    return c.courses.filter(x => (x.semester || 1) === sem).map(x => [
      x.code || '',
      x.name || '',
      (x.prereqs || []).map(codeOf).join(', ') || '—',
      (x.coreqs || []).map(codeOf).join(', ') || '—',
      x.credits ?? '—',
      x.hours ?? '—',
      statusLabel[statusOf(x)] || 'Pendiente'
    ]);
  }

  async function generatePlanPDF(c) {
    await ensurePDFLibrary();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const s = stats(c);
    const sems = [...new Set(c.courses.map(x => x.semester || 1))].sort((a,b)=>a-b);
    const fileName = `malla-${pdfSafeName(c.name)}.pdf`;
    const pageW = doc.internal.pageSize.getWidth();
    const generated = new Date().toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
    let y = 15;

    doc.setProperties({ title: `Malla curricular - ${c.name}`, subject: 'Malla curricular exportada desde Ruta Académica', creator: 'Ruta Académica' });
    doc.setTextColor(8, 31, 70);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('Ruta Académica - Malla curricular', 14, y);
    y += 7;
    doc.setFontSize(13); doc.text(String(c.name || 'Plan académico'), 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 99, 116);
    const meta = [c.planCode ? `Plan: ${c.planCode}` : '', c.fileName ? `Fuente: ${c.fileName}` : '', `Generado: ${generated}`].filter(Boolean).join('   |   ');
    doc.text(meta, 14, y + 5);
    doc.text(`Progreso: ${s.taken}/${s.total} materias aprobadas (${Math.round(s.pct*100)}%)   |   Créditos aprobados: ${s.creditsTaken}/${s.credits || '—'}`, 14, y + 10);
    y += 17;
    doc.setDrawColor(210, 218, 232); doc.line(14, y, pageW - 14, y); y += 6;

    sems.forEach((sem, index) => {
      const rows = pdfCourseRows(c, sem);
      const totalCr = c.courses.filter(x => (x.semester || 1) === sem).reduce((a,x)=>a+(Number(x.credits)||0),0);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(8,31,70);
      doc.text(`${sem}° semestre · ${rows.length} materias · ${totalCr} créditos`, 14, y);
      doc.autoTable({
        startY: y + 3,
        head: [['Código','Asignatura','Requisito','Correquisito','CR','Horas','Estado']],
        body: rows,
        theme: 'grid',
        margin: { left: 14, right: 14 },
        styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 2, overflow: 'linebreak', valign: 'middle', textColor: [30,35,48], lineColor: [223,228,238], lineWidth: .15 },
        headStyles: { fillColor: [10,31,71], textColor: [255,255,255], fontStyle: 'bold', fontSize: 7.6 },
        alternateRowStyles: { fillColor: [247,249,252] },
        columnStyles: { 0:{cellWidth:25}, 1:{cellWidth:72}, 2:{cellWidth:48}, 3:{cellWidth:43}, 4:{cellWidth:13,halign:'center'}, 5:{cellWidth:17,halign:'center'}, 6:{cellWidth:27} },
        didParseCell(data) {
          if (data.section === 'body' && data.column.index === 6) {
            const v = String(data.cell.raw || '');
            if (v === 'Aprobada') { data.cell.styles.textColor = [15,118,82]; data.cell.styles.fontStyle = 'bold'; }
            if (v === 'Bloqueada') data.cell.styles.textColor = [126,38,38];
            if (v === 'Disponible') data.cell.styles.textColor = [26,72,148];
          }
        },
        didDrawPage(data) {
          const page = doc.internal.getNumberOfPages();
          doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(120,127,141);
          doc.text('Ruta Académica', 14, doc.internal.pageSize.getHeight() - 7);
          doc.text(`Página ${page}`, pageW - 14, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
        }
      });
      y = doc.lastAutoTable.finalY + 8;
      if (index < sems.length - 1 && y > doc.internal.pageSize.getHeight() - 35) { doc.addPage(); y = 15; }
    });

    doc.save(fileName);
    return fileName;
  }

  function printPlanAsPDF(c) {
    const s = stats(c);
    const sems = [...new Set(c.courses.map(x => x.semester || 1))].sort((a,b)=>a-b);
    const title = `Malla curricular - ${c.name}`;
    const semesterHtml = sems.map(sem => {
      const courses = c.courses.filter(x => (x.semester || 1) === sem);
      const rows = courses.map(x => `<tr><td>${esc(x.code || '')}</td><td class="name">${esc(displayCourseName(x,c) || '')}</td><td>${esc((x.prereqs || []).map(codeOf).join(', ') || '—')}</td><td>${esc((x.coreqs || []).map(codeOf).join(', ') || '—')}</td><td>${x.credits ?? '—'}</td><td>${x.hours ?? '—'}</td><td>${esc(statusLabel[statusOf(x)] || 'Pendiente')}</td></tr>`).join('');
      const credits = courses.reduce((a,x)=>a+(Number(x.credits)||0),0);
      return `<section><h2>${sem}° semestre <small>${courses.length} materias · ${credits} créditos</small></h2><table><thead><tr><th>Código</th><th>Asignatura</th><th>Requisito</th><th>Correquisito</th><th>CR</th><th>Horas</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) { toast('El navegador bloqueó la ventana de exportación. Permite ventanas emergentes e inténtalo de nuevo.', 'err'); return false; }
    w.document.open();
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/static/css/estilos-50.css"></head><body><header><h1>Ruta Académica - Malla curricular</h1><h2>${esc(c.name)}</h2><p>${c.planCode ? `Plan: ${esc(c.planCode)} · ` : ''}${c.fileName ? `Fuente: ${esc(c.fileName)} · ` : ''}Progreso: ${s.taken}/${s.total} (${Math.round(s.pct*100)}%) · Créditos: ${s.creditsTaken}/${s.credits || '—'}</p></header>${semesterHtml}<footer>Exportado desde Ruta Académica.</footer><\x73cript>setTimeout(()=>{window.focus();window.print();},350)<\/script><\/body><\/html>`);
    w.document.close();
    return true;
  }

  async function exportPlanPDF() {
    const c = cur();
    if (!c) return toast('Carga una malla curricular antes de exportar el PDF.', 'err');
    toast('Generando PDF de la malla...');
    try {
      const fileName = await generatePlanPDF(c);
      toast(`PDF generado: ${fileName}`);
    } catch (err) {
      console.warn('Generación directa de PDF no disponible; usando impresión PDF.', err);
      const ok = printPlanAsPDF(c);
      if (ok) toast('Se abrió la versión PDF. Elige “Guardar como PDF” en la ventana de impresión.');
    }
  }

  /* ---------------- Render ---------------- */
  function renderShell() {
    const sharedN = sharedCoursePairs().length;
    const c = cur();
    const navMain = [
      ['inicio', 'home', 'Inicio'],
      ['plan', 'grid', 'Malla curricular'],
      ['recom', 'star', 'Próximo semestre'],
      ['graduacion', 'cap', 'Camino a graduación'],
      ['horario', 'calendar', 'Horario semanal'],
    ];
    const navTracking = [
      ['prog', 'chart', 'Mi progreso'],
      ['notas', 'grade', 'Calificaciones'],
      ['riesgos', 'alert', 'Materias en riesgo'],
      ['estudio', 'clock', 'Centro de estudio'],
    ];
    const navTools = [
      ['req', 'lock', 'Requisitos', c ? c.courses.filter(x => statusOf(x) === 'blocked').length : 0],
      ['mapa', 'route', 'Mapa de requisitos'],
      ['shared', 'link', 'Clases compartidas', sharedN],
    ];
    const navGroup = (label, items) => `<span class="nav-label">${label}</span>` + items.map(([v, i, l, b]) =>
      `<button class="${state.view === v ? 'on' : ''}" data-action="nav" data-view="${v}" title="${esc(l)}" aria-label="${esc(l)}" aria-current="${state.view === v ? 'page' : 'false'}">${ic(i)}<span>${l}</span>${b ? `<span class="badge">${b}</span>` : ''}</button>`).join('');
    $('#nav').innerHTML = navGroup('Planificación', navMain) + navGroup('Seguimiento', navTracking) + navGroup('Plan de estudios', navTools);
    const collapseBtn=document.querySelector('.sidebar-collapse-toggle');
    if(collapseBtn){const closed=document.body.classList.contains('sidebar-collapsed');collapseBtn.setAttribute('aria-expanded',String(!closed));collapseBtn.setAttribute('aria-label',closed?'Ampliar menú lateral':'Contraer menú lateral');collapseBtn.title=closed?'Ampliar menú lateral':'Contraer menú lateral';}

    const dock = $('#mobileDock');
    if (dock) {
      const dockItems = [
        ['inicio','home','Inicio'],
        ['plan','grid','Malla'],
        ['horario','calendar','Horario'],
        ['notas','grade','Notas']
      ];
      dock.innerHTML = dockItems.map(([v,i,l]) => `<button type="button" class="${state.view===v?'on':''}" data-action="nav" data-view="${v}" aria-current="${state.view===v?'page':'false'}">${ic(i)}<span>${l}</span></button>`).join('') + `<button type="button" class="dock-more" data-action="menu" aria-label="Abrir menú completo">${ic('menu')}<span>Más</span></button>`;
    }

    const cs = list();
    $('#sideCard').innerHTML = `<div class="side-card-title"><span>Tu progreso</span><span>${cs.length}/2 planes</span></div>` + (cs.length ? cs.map(({ c: cc }) => {
      const s = stats(cc);
      return `<div class="side-prog"><div class="side-prog-top"><span class="route-career-line">${careerIcon(cc)}<span>${esc(cc.name)}</span></span><b>${Math.round(s.pct * 100)}%</b></div><div class="bar light"><i style="width:${s.pct * 100}%"></i></div><small>${s.taken} de ${s.total} clases aprobadas</small></div>`;
    }).join('') : `<div class="side-prog"><span>Sin planes cargados</span><small>Importa tu primer plan para comenzar</small></div>`);

    $('#profileCard').setAttribute('aria-current',state.view === 'perfil' ? 'page' : 'false');
    const V = VIEWS[state.view] || VIEWS.inicio;
    $('#viewTitle').textContent = V.title;
    $('#viewSub').textContent = V.sub;
    const ctx = $('#viewContext');
    if (ctx) { ctx.hidden = !c || ['inicio', 'perfil', 'shared'].includes(state.view); ctx.textContent = ctx.hidden ? '' : c.name; }
    $('#topRight').innerHTML = `<button class="global-search-btn" data-action="global-search" aria-label="Buscar en toda la aplicación" title="Buscar en toda la app (Ctrl/Cmd + K)">${ic('search')}<span>Buscar</span><kbd aria-hidden="true">${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd></button>`;
  }

  function render() {
    syncCareerData();
    save();
    renderShell();
    const focusSearch = document.activeElement && (document.activeElement.id === 'search' || document.activeElement.id === 'gradeSearch');
    const focusedId = focusSearch ? document.activeElement.id : null;
    const pos = focusSearch ? document.activeElement.selectionStart : 0;
    const V = VIEWS[state.view] || VIEWS.inicio;
    $('#view').innerHTML = `<div class="fade">${V.render()}</div>`;
    if (state.view === 'mapa') requestAnimationFrame(drawRequirementMap);
    if (state.view === 'shared') filterSharedCourses();
    window.RutaStudentProfile?.render(cur()?.name);
    if (focusedId) { const s = $('#' + focusedId); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }
  }

  function go(view) {
    if(view==='recom'){ui.recommendationParity=null;ui.recommendationCareer=null;}
    if(view==='riesgos')ui.riskFilter='';
    state.view = view;
    ui.editMode = false;
    document.body.classList.remove('menu-open');
    render();
    window.scrollTo({ top: 0 });
  }

  /* ---------------- Eventos ---------------- */
  document.addEventListener('click', e => {
    // El checkbox «Cursando» no debe abrir la ficha de la materia al pulsarlo.
    if (e.target.closest('.course-studying,.course-elective-option')) return;
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action, k = t.dataset.key, i = +t.dataset.i;
    switch (a) {
      case 'nav': go(t.dataset.view); break;
      case 'recommend-career': if(state.careers[i]){ui.recommendationCareer=i;ui.recommendationParity=null;render();} break;
      case 'recommend-change-career': ui.recommendationCareer=null;ui.recommendationParity=null;render();break;
      case 'recommend-cycle': if(['odd','even'].includes(t.dataset.cycle)){ui.recommendationParity=t.dataset.cycle;render();} break;
      case 'menu': document.body.classList.toggle('menu-open'); break;
      case 'collapse-sidebar': {
        const collapsed=document.body.classList.toggle('sidebar-collapsed');
        try{localStorage.setItem(collapsedKey,collapsed?'1':'0')}catch{}
        renderShell();
        if(state.view==='mapa'){requestAnimationFrame(drawRequirementMap);setTimeout(drawRequirementMap,300);}
        break;
      }
      case 'schedule-day': ui.scheduleDay=Math.min(5,Math.max(0,Number(t.dataset.day)||0));render();break;
      case 'toggle': {
        e.stopPropagation();
        const ci = Number(t.dataset.c ?? t.closest('[data-c]')?.dataset.c ?? activeIdx());
        const restoreFocus = document.activeElement === t && t.matches('.curriculum-course > .check');
        toggleTaken(k, ci);
        if (restoreFocus) {
          const card = $(`.curriculum-course[data-c="${ci}"][data-course-anchor="${CSS.escape(k)}"]`);
          (card?.querySelector('.check') || $('.curriculum-filters [aria-pressed="true"]'))?.focus({preventScroll:true});
        }
        break;
      }
      case 'toggle-modal': toggleTaken(k, +t.dataset.c); openCourse(k, +t.dataset.c); break;
      case 'open': openCourse(k, t.dataset.c != null ? +t.dataset.c : activeIdx()); break;
      case 'jump-course': e.preventDefault(); e.stopPropagation(); jumpToCourse(k, t.dataset.c != null ? +t.dataset.c : activeIdx()); break;
      case 'career': state.active = i; ui.gradeSem='all'; ui.riskFilter=''; syncCareerData(); render(); break;
      case 'grade-career': state.active = i; ui.gradeSem='all'; ui.gradeSearch=''; syncCareerData(); render(); break;
      case 'history-pick': document.getElementById('historyPdfFile')?.click(); break;
      case 'history-confirm': saveHistoryReport(); break;
      case 'filter': state.filter = t.dataset.f; render(); break;
      case 'grade-sem': ui.gradeSem = t.dataset.sem; render(); break;
      case 'req-scope': state.reqScope = t.dataset.s; render(); break;
      case 'edit-mode': ui.editMode = !ui.editMode; render(); break;
      case 'edit': e.stopPropagation(); openEdit(+t.dataset.c, k); break;
      case 'del': e.stopPropagation(); deleteCourse(+t.dataset.c, k); break;
      case 'add': openEdit(activeIdx(), null, +t.dataset.sem); break;
      case 'sem-all': markSemester(+t.dataset.sem); break;
      case 'catalog-pdf': showCatalogPdf(t.dataset.catalog); break;
      case 'catalog-load': selectCatalogSlot(t.dataset.catalog); break;
      case 'catalog-slot': confirmCatalogSlot(t.dataset.catalog, i); break;
      case 'pick': $('#file' + i)?.click(); break;
      case 'open-plan': state.active = i; closeModal(); go('plan'); break;
      case 'review': state.active = i; closeModal(); state.view = 'plan'; ui.editMode = true; render(); break;
      case 'remove-career':
        if (confirm(`¿Quitar "${state.careers[i].name}"? Se borrará el plan cargado.`)) { state.careers[i] = null; render(); toast('Plan eliminado'); }
        break;
      case 'demo': loadDemo(); break;
      case 'paste': openPaste(i); break;
      case 'parse-paste': {
        const text = $('#pasteText').value;
        if (!text.trim()) return toast('Pega el texto del plan primero', 'err');
        ui.pendingNames[i] = $('#pasteName').value;
        closeModal();
        setTimeout(() => finishParse(i, PlanParser.parseText(text), 'Texto pegado'), 200);
        break;
      }
      case 'manual': {
        const name = (state.careers[i]?.name) || ui.pendingNames[i].trim() || `Carrera ${i + 1}`;
        state.careers[i] = state.careers[i] || { name, fileName: '', courses: [] };
        state.active = i; closeModal(); state.view = 'plan'; ui.editMode = true; render();
        toast('Usa "Agregar clase" en cada semestre');
        break;
      }
      case 'close': closeModal(); break;
      case 'export': exportPlanPDF(); break;
      case 'import': $('#importFile').click(); break;
      case 'reset':
        if (confirm('¿Borrar todos tus datos académicos guardados en este navegador, incluidas las carpetas de materias? Esta acción no se puede deshacer.')) {
          folderStorage('readwrite', store => store.clear()).then(() => {
            closeModal(); state = defaults(); render(); toast('Datos reiniciados');
          }).catch(() => {
            closeModal(); state = defaults(); render();
            toast('Datos académicos reiniciados. No se pudo vaciar el almacenamiento de las carpetas.', 'err');
          });
        }
        break;
      case 'add-event': openEventModal(); break;
      case 'schedule-career': state.scheduleCareer=Number(t.dataset.c);render();break;
      case 'edit-event': openEventModal(Number(t.dataset.id)); break;
      case 'delete-event': deleteEvent(t.dataset.id); break;
      case 'clear-schedule':
        if (confirm('¿Eliminar todas las clases del horario unificado de las dos carreras?')) { state.events=[];render();toast('Horario unificado vaciado'); }
        break;
      case 'quick-add': {
        if(e.target.closest('.sched-card'))return;
        let hour=t.dataset.hour||'';
        if(t.classList.contains('ra-day-track')){
          const y=Math.max(0,e.clientY-t.getBoundingClientRect().top);
          const early=Number(t.dataset.early)||420;
          const perHour=Number(t.dataset.step)||76;
          const m=Math.max(360,Math.min(1260,Math.round((early+y/perHour*60)/30)*30));
          hour=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
        }
        openEventModal(null,Number(t.dataset.day),hour);
        break;
      }
      case 'new-task': openTaskModal(); break;
      case 'task-filter': ui.taskFilter = t.dataset.f || 'pending'; render(); break;
      case 'task-toggle': { const q=state.tasks.find(x=>x.id===Number(t.dataset.id)); if(q){q.done=!q.done;render();} break; }
      case 'task-edit': openTaskModal(t.dataset.id); break;
      case 'task-delete': if(confirm('¿Eliminar esta actividad?')){state.tasks=state.tasks.filter(x=>x.id!==Number(t.dataset.id));render();toast('Actividad eliminada');} break;
      case 'study-custom': setStudyMinutes($('#focusCustomMinutes')?.value); break;
      case 'study-set': setStudyMinutes(Math.max(5,Number(t.dataset.min)||25)); break;
      case 'study-toggle': toggleStudyTimer(); break;
      case 'study-reset': setStudyMinutes(Math.round(studyTimer.total/60)); break;
      case 'study-manual': openStudyManual(); break;
      case 'study-goal': openStudyGoal(); break;
      case 'study-delete': state.studyLog=state.studyLog.filter(x=>x.id!==Number(t.dataset.id));render();toast('Sesión eliminada');break;
      case 'exam-new': openExamModal(); break;
      case 'exam-delete': deleteExam(t.dataset.id); break;
      case 'exam-toggle': toggleExamSession(t.dataset.id,t.dataset.session); break;
      case 'exam-agenda': addExamAgenda(t.dataset.id); break;
      case 'course-folder': openCourseFolder(Number(t.dataset.c), k); break;
      case 'note-new': openNoteModal(); break;
      case 'note-edit': openNoteModal(t.dataset.id); break;
      case 'note-view': openNoteReader(t.dataset.id); break;
      case 'note-delete': deleteNote(t.dataset.id); break;
      case 'notes-export': exportNotesPDF(); break;
      case 'goal-new': openCourseGoalModal(); break;
      case 'goal-delete': deleteCourseGoal(t.dataset.id); break;
      case 'goal-filter': ui.goalFilter=t.dataset.filter||'all'; render(); break;
      case 'global-search': openGlobalSearch(); break;
      case 'global-course': closeModal(); setTimeout(() => jumpToCourse(k, +t.dataset.c), 190); break;
      case 'global-nav': closeModal(); setTimeout(() => go(t.dataset.view), 190); break;
      case 'req-map-select': ui.reqMapSelected = k || null; render(); break;
      case 'req-map-clear': ui.reqMapSelected = null; render(); break;
      case 'req-map-pan': {const sc=$('#reqMapCanvas')?.closest('.req-map-scroll');if(sc)sc.scrollBy({left:Number(t.dataset.direction)*sc.clientWidth*.75,behavior:'smooth'});break;}
      case 'grade-sim': openGradeSimulator(k || '', Number(t.dataset.c ?? activeIdx())); break;
      case 'grade-sim-open': { const kk=t.dataset.key, ci=Number(t.dataset.c); closeModal(); setTimeout(()=>openCourse(kk,ci),190); break; }
      case 'quick-task-course': openTaskModal(null, k); break;
      case 'quick-sched-course': {
        const ci=activeIdx();
        closeModal();
        if(!currentCourseKeys(ci).includes(k)){
          toast('Marca primero «Cursando» en esta materia dentro de Plan de estudios.','err');
          go('plan');break;
        }
        state.scheduleCareer=ci;
        openEventModal(null, 0, '', k);
        break;
      }
    }
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openGlobalSearch(); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { e.preventDefault(); openGlobalSearch(); }
    if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('course')) { e.preventDefault(); e.target.click(); }
  });

  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  document.addEventListener('submit', e => {
    if (e.target.id === 'editForm') { e.preventDefault(); saveEdit(e.target); }
    else if (e.target.id === 'eventForm') { e.preventDefault(); saveEvent(e.target); }
    else if (e.target.id === 'taskForm') { e.preventDefault(); saveTask(e.target); }
    else if (e.target.id === 'studyForm') { e.preventDefault(); saveStudy(e.target); }
    else if (e.target.id === 'examPlanForm') { e.preventDefault(); saveExamPlan(e.target); }
    else if (e.target.id === 'noteForm') { e.preventDefault(); saveNotebookNote(e.target); }
    else if (e.target.id === 'courseGoalForm') { e.preventDefault(); saveCourseGoal(e.target); }
    else if (e.target.id === 'goalForm') { e.preventDefault(); state.studyDailyGoal=Math.max(15,Math.min(720,Number(new FormData(e.target).get('goal'))||60)); closeModal(); render(); toast('Meta diaria actualizada'); }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'search') { ui.search = t.value; render(); }
    else if (t.id === 'studyFocusNote') { state.studyFocusNote=String(t.value||'').slice(0,160);save(); }
    else if (t.id === 'gradeSearch') { ui.gradeSearch = t.value; render(); }
    else if (t.id === 'sharedSearch') { ui.sharedSearch = t.value; filterSharedCourses(); }
    else if (t.id === 'globalSearchInput') renderGlobalSearch(t.value);
    else if (t.id === 'notebookSearch') { ui.notebookQuery=t.value; refreshNotesList(); }
    else if (t.id === 'simTarget' || t.id === 'simFuture') updateGradeSimulator();
    else if (t.dataset.pending != null) ui.pendingNames[+t.dataset.pending] = t.value;
    else if (t.dataset.grade != null && !t.validity.badInput) {
      const ci = Number(t.dataset.c ?? activeIdx());
      const grade = setGrade(t.dataset.grade, +t.dataset.n, t.value, ci);
      const row = t.closest('tr,.detail-grade-box');
      const result = row?.querySelector('[data-grade-result]');
      const status = row?.querySelector('[data-grade-status]');
      if (result) result.innerHTML = gradeResultMarkup(grade, ci);
      if (status) status.innerHTML = gradeStatusMarkup(grade);
      const semester = t.closest('.grade-semester');
      if (semester) {
        row.className = grade.isFinal ? 'row-' + grade.status : '';
        const keys = [...semester.querySelectorAll('[data-grade][data-n="0"]')].map(input => input.dataset.grade);
        $('.grade-semester-summary', semester).innerHTML = semesterGradeSummary(keys);
        $('[data-grade-totals]').outerHTML = gradeTotalsMarkup(cur());
      }
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
     if (t.id === 'historyPdfFile') { const file=t.files?.[0];t.value='';if(file)handleHistoryPDF(file); }
     else if (t.id === 'historyTarget') { const newTarget=Number(t.value);if(ui.historyImport&&state.careers[newTarget]&&historyTargetIsCompatible(ui.historyImport.report,state.careers[newTarget])){ui.historyImport.target=newTarget;ui.historyImport.matches=historyAutoMatches(ui.historyImport.report.rows,state.careers[newTarget]);showHistoryPreview();} }
     else if (t.dataset.historyRow != null && ui.historyImport) { ui.historyImport.matches[Number(t.dataset.historyRow)]=t.value; }
     else if (t.id === 'includeCnvCra') { state.includeCnvCra=t.checked;render(); }
     else if (t.id === 'honorScale') { state.honorScale = t.value==='alternative'?'alternative':'official2023'; render(); }
    else if (t.id === 'simCourse') { $('#simFuture').value = ''; updateGradeSimulator(); }
    else if (['examCareer','examSemester','examCourse','noteCareer','noteSemester','noteCourse','goalCareer','goalSemester','goalCourse'].includes(t.id)) {
      const prefix=t.id.startsWith('exam')?'exam':t.id.startsWith('note')?'note':'goal';
      if(t.id===prefix+'Career'){const el=$('#'+prefix+'Semester'); if(el)el.value='';const co=$('#'+prefix+'Course');if(co)co.value='';}
      if(t.id===prefix+'Semester'){const co=$('#'+prefix+'Course');if(co)co.value='';}
      refreshStudySelects(prefix);
    }
    else if(t.id==='goalKind'){ updateGoalFields(); }
    else if (t.id === 'sharedFilter') { ui.sharedFilter = t.value; filterSharedCourses(); }
    else if (t.id === 'riskFilter') {
      const valid = ['all','attention-needed',...Object.keys(riskGroups)];
      if (valid.includes(t.value)) ui.riskFilter = t.value;
      render();
      $('#riskFilter')?.focus({preventScroll:true});
    }
    else if (t.id === 'reqMapPicker') { ui.reqMapSelected = t.value || null; render(); }
    else if (t.dataset.electiveKey !== undefined) {
      const ci=Number(t.dataset.c),key=t.dataset.electiveKey;
      const career=state.careers[ci], course=career?.courses.find(x=>x.key===key);
      if (!chooseElective(ci,key,t.value)) {
        t.value=electiveChoiceFor(course,career)?.code || '';
        return;
      }
      if (t.closest('#modal')) openCourse(key,ci);
      render();
      document.querySelectorAll('[data-elective-key]').forEach(el=>{
        if (el.dataset.electiveKey===key && Number(el.dataset.c)===ci &&
            !!el.closest('#modal')===!!t.closest('#modal')) el.focus({preventScroll:true});
      });
    }
    else if (t.dataset.file != null) { handleFile(+t.dataset.file, t.files[0]); t.value = ''; }
    else if (t.dataset.rename != null) {
      const c = state.careers[+t.dataset.rename];
      if (c && t.value.trim()) { c.name = t.value.trim(); render(); toast('Nombre actualizado'); }
    }
    else if (t.id === 'autoApprove') { state.autoApprove = t.checked; if (t.checked) recheckAllGrades(); render(); }
    else if (['studyCareer','studySemester','studyCourse'].includes(t.id)) {
      if(studyTimer.running)stopStudyTimer();
      if(t.id==='studyCareer'){const s=$('#studySemester');if(s)s.value='';const c=$('#studyCourse');if(c)c.value='';}
      if(t.id==='studySemester'){const c=$('#studyCourse');if(c)c.value='';}
      refreshStudySelects('study');
    }
    else if (['manualStudyCareer','manualStudySemester','manualStudyCourse'].includes(t.id)) {
      if(t.id==='manualStudyCareer'){const s=$('#manualStudySemester');if(s)s.value='';const c=$('#manualStudyCourse');if(c)c.value='';}
      if(t.id==='manualStudySemester'){const c=$('#manualStudyCourse');if(c)c.value='';}
      refreshStudySelects('manualStudy');
    }
    else if (t.id==='evCareer') {updateEventSelectors({resetCourse:true});}
    else if (t.dataset.currentCourse !== undefined) {
      const ci=Number(t.dataset.c);
      const x=state.careers[ci]?.courses.find(x=>x.key===t.dataset.currentCourse);
      if(!x)return;
      const marked=new Set(currentCourseKeys(ci));
      if(t.checked)marked.add(x.key);else marked.delete(x.key);
      setCurrentCourseKeys(ci,[...marked],x.key,t.checked);
      render();toast((t.checked?'Marcada como cursando: ':'Ya no cursas: ')+x.name);
    }
    else if (t.id === 'evKey') {
      const ci=Number($('#evCareer')?.value),course=state.careers[ci]?.courses.find(x=>x.key===t.value);
      const title=$('#evTitle');if(title){if(course){title.value=displayCourseName(course,state.careers[ci]);title.readOnly=true;}else if(t.value==='__custom__'){title.readOnly=false;}else title.value='';}
    }
    else if (t.id === 'importFile' && t.files[0]) {
      t.files[0].text().then(txt => {
        const d = JSON.parse(txt);
        if (!Array.isArray(d.careers)) throw new Error('formato');
        state.careers = [d.careers[0] || null, d.careers[1] || null];
        state.careers.forEach(repairIndustrialRequirements);
        state.taken = d.taken || {};
        state.grades = d.grades || {};
        state.careerRecords = Array.isArray(d.careerRecords) && d.careerRecords.length === 2 ? d.careerRecords : [null, null];
        if (!state.careerRecords.some(Boolean)) {
          const restored = careerRecord(activeIdx());
          restored.grades = state.grades;
          restored.taken = state.taken;
        }
        syncCareerData();
         state.honorScale = d.honorScale === 'alternative' ? 'alternative' : 'official2023';
         state.includeCnvCra = d.includeCnvCra === true;
        state.events = d.events || [];
        state.scheduleCareer = [0,1].includes(d.scheduleCareer) ? d.scheduleCareer : null;
        state.currentCoursesByPlan = d.currentCoursesByPlan && typeof d.currentCoursesByPlan==='object' && !Array.isArray(d.currentCoursesByPlan) ? d.currentCoursesByPlan : {};
        state.tasks = Array.isArray(d.tasks) ? d.tasks : [];
        state.studyLog = Array.isArray(d.studyLog) ? d.studyLog : [];
        state.studyDailyGoal = Math.max(15, Number(d.studyDailyGoal) || 60);
        const extras=d.academicExtras||{};
        state.academicExtras={exams:Array.isArray(extras.exams)?extras.exams:[],notes:Array.isArray(extras.notes)?extras.notes:[],goals:Array.isArray(extras.goals)?extras.goals:[]};
        state.view = 'plan'; render(); toast('Respaldo académico importado');
      }).catch(() => toast('Archivo no válido', 'err'));
      t.value = '';
    }
  });

  // Arrastrar y soltar PDF en la malla
  document.addEventListener('dragover', e => {
    const d = e.target.closest?.('[data-drop]');
    if (d) { e.preventDefault(); d.classList.add('over'); }
  });
  document.addEventListener('dragleave', e => { e.target.closest?.('[data-drop]')?.classList.remove('over'); });
  document.addEventListener('drop', e => {
    const d = e.target.closest?.('[data-drop]');
    if (!d) return;
    e.preventDefault();
    d.classList.remove('over');
    handleFile(+d.dataset.drop, e.dataTransfer.files[0]);
  });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  window.addEventListener('resize', () => { if (state.view === 'mapa') requestAnimationFrame(drawRequirementMap); });

  /* ---------------- Init ---------------- */
  const logoElement = $('#logo');
  if (logoElement) logoElement.innerHTML = ic('cap');
  $('#menuBtn').innerHTML = ic('menu');
  $('#btnExport').innerHTML = ic('download') + '<span>Exportar malla PDF</span>';
  $('#btnExport').title = 'Descargar la malla curricular activa en formato PDF';
  $('#btnImport').innerHTML = ic('upload') + '<span>Importar respaldo</span>';
  $('#btnReset').innerHTML = ic('refresh') + '<span>Restablecer datos</span>';
  const installBtn = $('#btnInstall');
  if (installBtn && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)) installBtn.hidden = true;
  render();
  window.addEventListener('ruta:backend-ready', () => {
    // Actualiza las tarjetas con el resultado calculado por Python.
    if (document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
    render();
  });
  document.documentElement.classList.add('app-ready');
})();

