"""Reglas académicas y cálculos. Sin dependencias del navegador."""
from __future__ import annotations
import math
import re
import unicodedata
from grafo_requisitos import crear_grafo, requisitos_pendientes
from cola_enlazada import ordenar_disponibles

APROBACION = 70
CONVOCATORIA = 60


def normalizar_nombre(value):
    value = unicodedata.normalize('NFD', str(value or '').lower())
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    return ' '.join(re.findall(r'[a-z0-9]+', value))


def _planes(state):
    careers = state.get('careers') or []
    return (careers + [None, None])[:2]


def _identidad(plan, ci):
    if not plan:
        return ''
    return str(next((plan[k] for k in ('recordIdentity', 'sourceCatalogId', 'planCode', 'fileName') if plan.get(k)), f'personal-{ci}'))


def registros(state):
    plans = _planes(state)
    previous = (state.get('careerRecords') or []) + [None, None]
    result = []
    for ci, plan in enumerate(plans):
        identity = _identidad(plan, ci)
        rec = previous[ci] if isinstance(previous[ci], dict) else None
        if not rec or rec.get('identity') != identity:
            rec = {'identity': identity, 'grades': {}, 'taken': {}, 'history': {}, 'unmappedHistory': []}
        for key in ('grades', 'taken', 'history'):
            if not isinstance(rec.get(key), dict):
                rec[key] = {}
        result.append(rec)
    return result


def cursos(state, ci):
    plan = _planes(state)[ci]
    return (plan or {}).get('courses') or []


def equivalencias(state, key, ci, unique_name=False):
    plans = _planes(state)
    source = next((c for c in cursos(state, ci) if c.get('key') == key), None)
    if source is None:
        for index in range(2):
            source = next((c for c in cursos(state, index) if c.get('key') == key), None)
            if source:
                ci = index
                break
    if source is None:
        return []
    refs = [(ci, source)]
    if source.get('electiveOptions') or source.get('electiveGroup'):
        return refs
    name = normalizar_nombre(source.get('name'))
    for other in range(2):
        if other == ci:
            continue
        comparable = [x for x in cursos(state, other) if not x.get('electiveOptions') and not x.get('electiveGroup')]
        by_code = next((x for x in comparable if x.get('key') == source.get('key')), None)
        matches = [x for x in comparable if name and normalizar_nombre(x.get('name')) == name]
        by_name = (matches[0] if len(matches) == 1 else None) if unique_name else next((x for x in matches if x.get('semester') == source.get('semester')), matches[0] if matches else None)
        match = by_code or by_name
        if match:
            refs.append((other, match))
    return refs


def cursada(state, records, key, ci):
    if records[ci]['taken'].get(key):
        return True
    return any(other != ci and bool(records[other]['taken'].get(course.get('key'))) for other, course in equivalencias(state, key, ci))


def estado(state, records, course, ci):
    if cursada(state, records, course.get('key'), ci):
        return 'taken'
    return 'available' if all(cursada(state, records, pre, ci) for pre in (course.get('prereqs') or [])) else 'blocked'


def nota(partials, history=None):
    partials = (partials or [])[:3]
    partials = (partials + [None] * 3)[:3]
    def safe_grade(x):
        try:
            result = float(x) if x not in (None, '') else None
            return min(100.0, max(0.0, result)) if result is not None and math.isfinite(result) else None
        except (TypeError, ValueError):
            return None
    values = [safe_grade(x) for x in partials]
    filled = [x for x in values if x is not None]
    count, total = len(filled), sum(filled)
    avg, status, needed, needed_conv = None, 'none', None, None
    if count == 3:
        avg = math.floor((total / 3) * 10 + 0.5) / 10
        status = 'passed' if avg >= APROBACION else ('convocatoria' if avg >= CONVOCATORIA else 'failed')
    elif count > 0:
        avg = math.floor((total / 3) * 10 + 0.5) / 10
        remaining = 3 - count
        needed = max(0, math.ceil((APROBACION * 3 - total) / remaining))
        needed_conv = max(0, math.ceil((CONVOCATORIA * 3 - total) / remaining))
        status = 'progress'
    from_history = False
    if count < 3 and isinstance(history, dict) and history.get('grade') is not None:
        try:
            historical_grade = float(history['grade'])
            if math.isfinite(historical_grade):
                avg = historical_grade
                status = 'passed' if avg >= APROBACION else ('convocatoria' if avg >= CONVOCATORIA else 'failed')
                from_history = True
        except (ValueError, TypeError):
            pass
    return {'p': values, 'count': count, 'sum': total, 'avg': avg, 'status': status,
            'needed': needed, 'neededConvocatoria': needed_conv, 'pass': APROBACION,
            'convocatoriaMin': CONVOCATORIA, 'isFinal': count == 3 or from_history,
            'fromHistory': from_history, 'history': history}


def evaluar(state):
    records = registros(state)
    statuses, grades, recommendations, statistics = {}, {}, {}, {}
    current = state.get('currentCoursesByPlan') or {}
    for ci, plan in enumerate(_planes(state)):
        if not plan:
            continue
        courses = cursos(state, ci)
        grafo = crear_grafo(courses)
        aprobadas = {c.get('key') for c in courses if c.get('key') and cursada(state, records, c.get('key'), ci)}
        # El grafo decide bloqueos; la equivalencia entre carreras se conserva.
        statuses[str(ci)] = {c.get('key'): ('taken' if c.get('key') in aprobadas else
                             ('blocked' if requisitos_pendientes(grafo, c.get('key'), aprobadas) else 'available'))
                             for c in courses if c.get('key')}
        grades[str(ci)] = {key: nota(partials, records[ci]['history'].get(key)) for key, partials in records[ci]['grades'].items() if isinstance(partials, list)}
        for key, historical in records[ci]['history'].items():
            if key not in grades[str(ci)]:
                grades[str(ci)][key] = nota(None, historical)
        stats = {'total': len(courses), 'taken': 0, 'available': 0, 'blocked': 0, 'credits': 0, 'creditsTaken': 0}
        for c in courses:
            current_status = statuses[str(ci)].get(c.get('key'), 'blocked')
            stats[current_status] += 1
            credits = float(c.get('credits') or 0)
            stats['credits'] += credits
            if current_status == 'taken':
                stats['creditsTaken'] += credits
        stats['pct'] = stats['taken'] / stats['total'] if stats['total'] else 0
        statistics[str(ci)] = stats
        planid = _identidad(plan, ci) + '::' + str(ci)
        registered = set(current.get(planid) or [])
        for parity, odd in (('odd', 1), ('even', 0)):
            options = [c for c in courses if int(c.get('semester') or 0) > 0 and int(c.get('semester') or 0) % 2 == odd and c.get('key') not in registered and statuses[str(ci)].get(c.get('key')) == 'available']
            ordered = sorted(options, key=lambda x: int(x.get('semester') or 0))
            grafo_ordenado = crear_grafo(ordered)
            # La cola enlazada procesa en orden FIFO las materias elegibles.
            recommendations[f'{ci}:{parity}'] = ordenar_disponibles(grafo_ordenado, [c.get('key') for c in ordered])
    return {'statuses': statuses, 'grades': grades, 'statistics': statistics, 'recommendations': recommendations}


def alternar_cursada(state, key, ci, value=None):
    records = registros(state)
    currently = cursada(state, records, key, ci)
    target = not currently if value is None else bool(value)
    for other, course in equivalencias(state, key, ci) or [(ci, {'key': key})]:
        ck = course['key']
        if target:
            records[other]['taken'][ck] = True
            planid = _identidad(_planes(state)[other], other) + '::' + str(other)
            selected = (state.get('currentCoursesByPlan') or {}).get(planid)
            if isinstance(selected, list):
                selected[:] = [x for x in selected if x != ck]
        else:
            records[other]['taken'].pop(ck, None)
    state['careerRecords'] = records
    ci_active = int(state.get('active') or 0)
    state['taken'] = records[ci_active]['taken']
    return state
