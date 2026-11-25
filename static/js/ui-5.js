
/*
 * PlanParser — Extrae clases, semestres y requisitos de un plan académico en PDF.
 * Usa pdf.js para obtener el texto, reconstruye las líneas por posición y aplica
 * heurísticas para detectar:
 *   - Encabezados de semestre ("Primer semestre", "Semestre 3", "III Periodo", "5to ciclo"...)
 *   - Códigos de clase (MM-110, MAT101, IS 210, CALC.201...)
 *   - Nombre, créditos/UV y requisitos de cada clase
 */
window.PlanParser = (() => {
  'use strict';

  const ORD = {
    primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5, sexto: 6,
    septimo: 7, setimo: 7, octavo: 8, noveno: 9, decimo: 10, undecimo: 11, onceavo: 11,
    duodecimo: 12, doceavo: 12
  };
  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
  const PER = '(?:semestre|periodo|cuatrimestre|trimestre|ciclo|nivel|bloque)';
  const STOP = new Set(['HORAS', 'HRS', 'PAG', 'TOTAL', 'PLAN', 'NIVEL', 'CICLO', 'ANO', 'UV', 'UVS', 'CR', 'CRED',
    'CODIGO', 'CLAVE', 'AREA', 'SEM', 'HT', 'HP', 'TEL', 'ISO', 'ACUERDO', 'RES', 'NO', 'CP', 'APDO']);
  const REQ_RE = /(pre[\s-]?)?requisitos?|\breq\.|correquisitos?|seriaci[oó]n|antecedentes?/i;
  const NONE_RE_G = /\b(ninguno|ninguna|n\/a|sin requisitos?|no tiene)\b|(^|\s)[-–—]{1,3}(?=\s|$)/gi;
  const STRICT_CODE_RE = /^[A-Z]{2,8}-?\d{3,4}[A-Z]?$/;
  const STRICT_CODES_RE = /[A-Z]{2,8}-?\d{3,4}[A-Z]?/g;

  const strip = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const norm = s => strip(s).toUpperCase().replace(/\s+/g, ' ').trim();
  const normKey = code => String(code ?? '').toUpperCase().replace(/[\s\-._]/g, '');
  const clean = t => String(t ?? '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

  const SEM_ORD_RE = new RegExp('\\b(' + Object.keys(ORD).join('|') + ')\\s+' + PER + '\\b');
  const SEM_NUM_RE = new RegExp('\\b' + PER + '\\s*(?:no\\.?|n°|nº|#|:|-)?\\s*(\\d{1,2}|[ivx]{1,4})\\b');
  const SEM_PRE_RE = new RegExp('\\b(\\d{1,2})\\s*(?:°|º|o|er|ero|do|ro|to|vo|no|mo|avo)?\\.?\\s*' + PER + '\\b');
  const SEM_ROM_RE = new RegExp('\\b([ivx]{1,4})\\s+' + PER + '\\b');

  /** Busca códigos explícitos. Nunca genera códigos que no estén escritos. */
  function findCodes(text) {
    const re = /(^|[^A-Za-z0-9])([A-Z]{2,8})([\-.\s]?)(\d{3,4}[A-Z]?)(?![A-Za-z0-9])/g;
    const out = [];
    let m;
    while ((m = re.exec(String(text ?? '')))) {
      const letters = m[2], sep = m[3], num = m[4];
      if (STOP.has(letters)) continue;
      if (sep === ' ' && /^\d{4}$/.test(num) && +num > 1900 && +num < 2100) continue;
      const start = m.index + m[1].length;
      const printed = letters + (sep || '') + num;
      out.push({ raw: printed, key: normKey(printed), index: start, end: start + printed.length });
    }
    return out;
  }

  function strictCodes(text) {
    const joined = String(text ?? '').toUpperCase().replace(/\s+/g, '');
    return (joined.match(STRICT_CODES_RE) || []).map(raw => ({ raw, key: normKey(raw) }));
  }

  /** Detecta encabezados de semestre; no estima semestres por dependencias. */
  function detectSemester(text) {
    const s = strip(text).toLowerCase();
    let m = s.match(SEM_ORD_RE);
    if (m) return ORD[m[1]];
    m = s.match(SEM_NUM_RE);
    if (m) {
      const v = /\d/.test(m[1]) ? +m[1] : ROMAN[m[1]];
      if (v >= 1 && v <= 12) return v;
    }
    m = s.match(SEM_PRE_RE);
    if (m && +m[1] >= 1 && +m[1] <= 12) return +m[1];
    m = s.match(SEM_ROM_RE);
    if (m && ROMAN[m[1]]) return ROMAN[m[1]];
    return null;
  }

  function splitName(part) {
    part = String(part ?? '').replace(NONE_RE_G, ' ');
    const cells = part.split('|').map(s => s.trim()).filter(Boolean);
    let name = '', credits = null;
    if (cells.length > 1) {
      for (const cell of cells) {
        if (!name && /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/.test(cell)) { name = cell; continue; }
        if (name && credits == null && /^\d{1,2}([.,]\d)?$/.test(cell)) credits = parseFloat(cell.replace(',', '.'));
      }
    }
    if (!name) {
      const tokens = cells.join(' ').split(/\s+/).filter(Boolean);
      const nums = [];
      while (tokens.length && /^\d{1,2}([.,]\d+)?$/.test(tokens[tokens.length - 1])) nums.unshift(tokens.pop());
      name = tokens.join(' ');
      if (nums.length) credits = parseFloat(nums[0].replace(',', '.'));
    }
    name = name.replace(/^[\s\-–:.|]+|[\s\-–:.|,]+$/g, '').replace(/\s+/g, ' ');
    if (credits != null && (!(credits > 0) || credits > 30)) credits = null;
    return { name, credits };
  }

  /** Agrupa fragmentos de una fila en celdas por separación horizontal. */
  function rowChunks(items) {
    const sorted = [...items].sort((a, b) => a.x - b.x);
    const chunks = [];
    let cur = null;
    for (const it of sorted) {
      const str = String(it.str ?? '').trim();
      if (!str) continue;
      if (!cur || it.x - cur.end > 14) {
        cur = { x: it.x, end: it.x + (it.w || 0), text: str };
        chunks.push(cur);
      } else {
        const gap = it.x - cur.end;
        cur.text += (gap > 1.2 ? ' ' : '') + str;
        cur.end = Math.max(cur.end, it.x + (it.w || 0));
      }
    }
    return chunks;
  }

  const rowText = row => rowChunks(row.items).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();

  /** Detecta la tabla oficial UAM por sus siete columnas reales. */
  function tableHeader(row) {
    const found = {};
    for (const it of row.items) {
      const n = norm(it.str);
      if (n === 'CODIGO') found.CODIGO = it.x;
      else if (n === 'ASIGNATURA') found.ASIGNATURA = it.x;
      else if (n === 'REQUISITO') found.REQUISITO = it.x;
      else if (n === 'COREQUISITO') found.COREQUISITO = it.x;
      else if (n === 'RELACION') found.RELACION = it.x;
      else if (n === 'CR') found.CR = it.x;
      else if (n === 'HORAS') found.HORAS = it.x;
    }
    return ['CODIGO','ASIGNATURA','REQUISITO','COREQUISITO','RELACION','CR','HORAS'].every(k => Number.isFinite(found[k])) ? found : null;
  }

  /**
   * Parser estricto para el formato oficial de Universidad Americana usado en
   * los planes 2024/2025/2026. La columna RELACION nunca se usa como requisito.
   * Las asignaturas electivas listadas como opciones al final no se agregan como
   * materias nuevas de la malla: se guardan como opciones de la fila ELECTIVA del plan.
   */
  /** Reads the appendix groups and keeps the original curriculum slots. */
  function readElectiveOptions(pages, courses) {
    const slots = new Map(courses.map(course=>[course.key,course]));
    const header = /^([A-Z]{2,8}-?\d{3,4}[A-Z]?)\s+ELECTIVA\s+(?:[IVX]+|\d+)\s*[-–—:]?\s*SEMESTRE\s+(\d{1,2})$/i;
    const choice = /^([A-Z]{2,8}-?\d{3,4}[A-Z]?)\s+(.+)$/i;
    let appendix = false, slot = null;
    for (const page of pages) for (const row of page.rows) {
      const text = rowText(row);
      const normalized = norm(text);
      if (normalized === 'ASIGNATURAS ELECTIVAS') {
        appendix = true;
        slot = null;
        continue;
      }
      if (!appendix || !text) continue;
      const group = normalized.match(header);
      if (group) {
        const candidate = slots.get(normKey(group[1]));
        slot = candidate?.semester === Number(group[2]) ? candidate : null;
        continue;
      }
      if (normalized.startsWith('PAGINA ') || normalized.startsWith('TOTALES ')) {
        slot = null;
        continue;
      }
      const item = text.match(choice);
      if (!slot || !item || normKey(item[1])===slot.key) continue;
      const code = item[1].toUpperCase();
      const options = slot.electiveOptions ||= [];
      if (!options.some(option=>option.code===code)) options.push({code,name:clean(item[2])});
    }
  }

  function parseUamPages(pages) {
    const hasOfficialHeader = pages.some(page => page.rows.some(row => !!tableHeader(row)));
    if (!hasOfficialHeader) return null;

    const rawCourses = [];
    const warnings = [];
    let title = '', planCode = '', semester = null, current = null, inElectiveOptions = false;
    let sourceCreditTotal = null, sourceHourTotal = null;
    let skippedWithoutSemester = 0;

    for (const page of pages) {
      // Metadatos impresos en el documento.
      for (const row of page.rows) {
        const text = rowText(row);
        let m = text.match(/^\s*PROGRAMA:\s*([A-Z0-9-]+)\s*-\s*(.+?)\s*$/i);
        if (m && !title) title = clean(m[2]);
        m = text.match(/^\s*PLAN:\s*([A-Z0-9-]+)\s*$/i);
        if (m && !planCode) planCode = m[1].trim();
        if (/TOTALES\s+PLAN/i.test(strip(text))) {
          const nums = text.match(/\b\d+\b/g) || [];
          if (nums.length >= 2) {
            sourceCreditTotal = Number(nums[nums.length - 2]);
            sourceHourTotal = Number(nums[nums.length - 1]);
          }
        }
      }

      const headerRow = page.rows.find(row => !!tableHeader(row));
      if (!headerRow) continue;
      const h = tableHeader(headerRow);
      const hIndex = page.rows.indexOf(headerRow);
      const bounds = {
        indexCode: h.CODIGO - 30,
        codeName: (h.CODIGO + h.ASIGNATURA) / 2 - 2,
        nameReq: (h.ASIGNATURA + h.REQUISITO) / 2,
        reqCoreq: (h.REQUISITO + h.COREQUISITO) / 2,
        coreqRel: (h.COREQUISITO + h.RELACION) / 2,
        relCr: (h.RELACION + h.CR) / 2,
        crHours: (h.CR + h.HORAS) / 2
      };
      const classify = x => {
        if (x < bounds.indexCode) return 'index';
        if (x < bounds.codeName) return 'code';
        if (x < bounds.nameReq) return 'name';
        if (x < bounds.reqCoreq) return 'req';
        if (x < bounds.coreqRel) return 'coreq';
        if (x < bounds.relCr) return 'relation';
        if (x < bounds.crHours) return 'credits';
        return 'hours';
      };

      for (let ri = hIndex + 1; ri < page.rows.length; ri++) {
        const row = page.rows[ri];
        const text = rowText(row);
        if (!text) continue;
        const n = norm(text);

        const sem = detectSemester(text);
        if (sem && /SEMESTRE|PERIODO|CICLO|NIVEL|BLOQUE/i.test(strip(text))) {
          semester = sem;
          current = null;
          continue;
        }

        if (n.includes('ASIGNATURAS ELECTIVAS')) {
          inElectiveOptions = true;
          current = null;
          continue;
        }
        if (inElectiveOptions) continue;

        if (n.includes('TOTALES PERIODO') || n.includes('TOTALES PLAN')) {
          current = null;
          continue;
        }
        if (n.includes('PAGINA ') || n === 'UNIVERSIDAD AMERICANA' || n === 'PLAN DE ESTUDIOS' || n.startsWith('PROGRAMA:') || n.startsWith('PLAN:')) continue;

        const cols = { index: [], code: [], name: [], req: [], coreq: [], relation: [], credits: [], hours: [] };
        for (const chunk of rowChunks(row.items)) cols[classify(chunk.x)].push(chunk.text);
        const val = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, clean(v.join(' '))]));
        const index = val.index.replace(/\s+/g, '');
        const printedCode = val.code.replace(/\s+/g, '').toUpperCase();

        if (/^\d{1,3}$/.test(index) && STRICT_CODE_RE.test(printedCode)) {
          if (semester == null) {
            skippedWithoutSemester++;
            current = null;
            continue;
          }
          current = {
            index: Number(index),
            semester,
            code: printedCode,
            name: val.name,
            reqRaw: val.req.replace(/\s+/g, ''),
            coreqRaw: val.coreq.replace(/\s+/g, ''),
            relation: val.relation.replace(/\s+/g, ''),
            creditsRaw: val.credits,
            hoursRaw: val.hours
          };
          rawCourses.push(current);
          continue;
        }

        // Continuaciones de una misma celda (nombres o requisitos partidos en varias líneas).
        if (current) {
          if (val.name) current.name = clean(`${current.name} ${val.name}`);
          if (val.req) current.reqRaw += val.req.replace(/\s+/g, '');
          if (val.coreq) current.coreqRaw += val.coreq.replace(/\s+/g, '');
        }
      }
    }

    const seen = new Set();
    const courses = [];
    for (const r of rawCourses) {
      const key = normKey(r.code);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const prereqs = [...new Set(strictCodes(r.reqRaw).map(x => x.key).filter(k => k && k !== key))];
      const coreqs = [...new Set(strictCodes(r.coreqRaw).map(x => x.key).filter(k => k && k !== key))];
      const credits = /^\d{1,2}(?:[.,]\d+)?$/.test(r.creditsRaw) ? Number(r.creditsRaw.replace(',', '.')) : null;
      const hours = /^\d{1,4}$/.test(r.hoursRaw) ? Number(r.hoursRaw) : null;
      courses.push({
        key,
        code: r.code,
        name: clean(r.name),
        credits,
        hours,
        semester: r.semester,
        prereqs,
        coreqs,
        relation: r.relation || '',
        sourceIndex: r.index
      });
    }

    if (planCode.toUpperCase() === '25-LTEC01') readElectiveOptions(pages, courses);
    if (skippedWithoutSemester) warnings.push(`${skippedWithoutSemester} fila(s) se omitieron porque el PDF no indicaba a qué semestre pertenecían. No se asignó un semestre inventado.`);
    const creditSum = courses.reduce((a, c) => a + (Number(c.credits) || 0), 0);
    const hourSum = courses.reduce((a, c) => a + (Number(c.hours) || 0), 0);
    if (sourceCreditTotal != null && creditSum !== sourceCreditTotal) warnings.push(`Verificación: el PDF declara ${sourceCreditTotal} créditos y se leyeron ${creditSum}. Revisa el plan antes de continuar.`);
    if (sourceHourTotal != null && hourSum !== sourceHourTotal) warnings.push(`Verificación: el PDF declara ${sourceHourTotal} horas y se leyeron ${hourSum}. Revisa el plan antes de continuar.`);
    warnings.unshift('Lectura estricta del plan: solo se usan las columnas impresas CÓDIGO, ASIGNATURA, REQUISITO, COREQUISITO, CR y HORAS. La columna RELACIÓN no se convierte en requisito.');

    return {
      title,
      planCode,
      courses,
      semestersDetected: true,
      warnings,
      format: 'uam-table-strict',
      strict: true,
      sourceTotals: { credits: sourceCreditTotal, hours: sourceHourTotal }
    };
  }

  /** Parser genérico conservador para texto pegado u otros formatos. */
  function parseLines(lines) {
    const courses = new Map();
    let sem = null, anySem = false, last = null, lastFresh = false, title = '';
    let textChars = 0;

    for (const raw of lines) {
      const text = (raw || '').trim();
      if (!text) continue;
      textChars += text.length;
      const codes = findCodes(text);

      if (!title && !codes.length && text.length < 110 &&
        /(ingenier|licenciatura|carrera|tecnic|tecnolog|maestria|arquitectura|medicina|derecho|bachiller|profesorado|odontolog|enfermer|psicolog|contadur|administraci)/i.test(strip(text))) {
        title = clean(text);
      }

      const s = detectSemester(text);
      if (s && (!codes.length || detectSemester(text.slice(0, codes[0].index)))) {
        sem = s; anySem = true; last = null; lastFresh = false;
        if (!codes.length) continue;
      }

      if (!codes.length) {
        if (last && lastFresh && !last.name && /[a-z]{3,}/i.test(text) && !REQ_RE.test(text)) last.name = clean(text);
        lastFresh = false;
        continue;
      }

      const first = codes[0];
      const before = text.slice(0, first.index);
      const startsWithCode = /^[\s\d.)#|\-–•*°º]*$/.test(before);

      if (startsWithCode) {
        const rest = text.slice(first.end);
        let namePart = rest, reqPart = '';
        const rIdx = rest.search(REQ_RE);
        // En modo genérico solo se aceptan requisitos si el texto los etiqueta explícitamente.
        if (rIdx >= 0) { namePart = rest.slice(0, rIdx); reqPart = rest.slice(rIdx); }
        addCourse(first, splitName(namePart), findCodes(reqPart));
      } else if (last && REQ_RE.test(text)) {
        codes.forEach(cd => {
          if (cd.key !== last.key && !last.prereqs.includes(cd.key)) last.prereqs.push(cd.key);
        });
      } else if (before.length < 80 && /[A-Za-zÁÉÍÓÚáéíóú]{3,}/.test(before) &&
        !/(aprobad|haber|cursad|requier|debe)/i.test(strip(before))) {
        const after = text.slice(first.end);
        const { credits } = splitName('x ' + after.replace(/[A-Z]{2,8}[\-.\s]?\d{3,4}[A-Z]?/g, ' '));
        addCourse(first, { name: clean(before.replace(/^[\s\d.)#\-–•*]+/, '')), credits }, []);
      }
    }

    function addCourse(code, { name, credits }, reqCodes) {
      const prereqs = [...new Set(reqCodes.map(c => c.key).filter(k => k !== code.key))];
      let c = courses.get(code.key);
      if (c) {
        prereqs.forEach(p => { if (!c.prereqs.includes(p)) c.prereqs.push(p); });
        if (!c.name && name) c.name = name;
        if (c.credits == null) c.credits = credits;
        if (c.semester == null && sem != null) c.semester = sem;
      } else {
        c = { key: code.key, code: code.raw, name, credits, semester: sem, prereqs, coreqs: [] };
        courses.set(code.key, c);
      }
      last = c; lastFresh = true;
    }

    const list = [...courses.values()];
    const warnings = [];
    if (!anySem && list.length) warnings.push('No se detectaron encabezados de semestre. No se estimaron semestres mediante requisitos; revisa el plan manualmente.');
    list.forEach(c => {
      // La interfaz necesita un semestre para mostrar la tarjeta. Se usa 1 solo como ubicación temporal y se informa al usuario.
      if (c.semester == null) c.semester = 1;
      if (!c.name) c.name = 'Clase sin nombre';
    });
    if (!textChars) warnings.push('El PDF no contiene texto seleccionable (posiblemente es escaneado). Usa "Pegar texto" o créalo manualmente.');
    return { title, courses: list, semestersDetected: anySem, warnings, format: 'generic-conservative', strict: false };
  }

  /** Carga pdf.js desde una segunda CDN si la primera no estuvo disponible. */
  async function ensurePdfJs() {
    if (window.pdfjsLib) return;
    const sources = [
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
    ];
    for (const src of sources) {
      try {
        await new Promise((resolve, reject) => {
          const el = document.createElement('script');
          el.src = src; el.async = true;
          el.onload = resolve; el.onerror = reject;
          document.head.appendChild(el);
        });
        if (window.pdfjsLib) return;
      } catch {}
    }
    throw new Error('No se pudo cargar el lector de PDF. Puedes seguir usando la app y volver a intentar cuando tengas conexión a internet.');
  }

  /** Extrae páginas, filas y coordenadas con pdf.js. */
  async function extractPages(file) {
    await ensurePdfJs();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const rows = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const x = it.transform[4], y = it.transform[5];
        const h = Math.abs(it.transform[3]) || it.height || 10;
        let row = rows.find(r => Math.abs(r.y - y) < Math.max(2.5, h * 0.4));
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, w: it.width || 0, str: it.str });
      }
      rows.sort((a, b) => b.y - a.y);
      rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
      pages.push({ number: p, rows });
    }
    return pages;
  }

  function pagesToLines(pages) {
    const lines = [];
    for (const page of pages) for (const row of page.rows) lines.push(rowText(row));
    return lines;
  }

  return {
    async parsePDF(file) {
      const pages = await extractPages(file);
      const strict = parseUamPages(pages);
      if (strict) return strict;
      return parseLines(pagesToLines(pages));
    },
    parseText(text) {
      return parseLines(String(text).split(/\r?\n/).map(t => t.replace(/\t+/g, ' | ')));
    },
    findCodes,
    detectSemester,
    extractPages
  };
})();

