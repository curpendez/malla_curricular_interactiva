"""Grafo dirigido dinámico de prerrequisitos.

Cada materia es un vértice, y una arista A -> B indica que A
es requisito de B. Las listas de adyacencia crecen al añadir materias.
"""


def crear_grafo(cursos):
    grafo = {'adyacencia': {}, 'requisitos': {}, 'materias': {}}
    for materia in cursos:
        clave = str(materia.get('key') or '')
        if clave:
            agregar_materia(grafo, clave, materia)
    for materia in cursos:
        destino = str(materia.get('key') or '')
        if not destino:
            continue
        for requisito in materia.get('prereqs') or []:
            agregar_requisito(grafo, str(requisito), destino)
    return grafo


def agregar_materia(grafo, clave, datos=None):
    if clave not in grafo['adyacencia']:
        grafo['adyacencia'][clave] = []
        grafo['requisitos'][clave] = []
    if datos is not None:
        grafo['materias'][clave] = datos
    return grafo


def agregar_requisito(grafo, requisito, materia):
    if not requisito or not materia:
        return grafo
    agregar_materia(grafo, requisito)
    agregar_materia(grafo, materia)
    if materia not in grafo['adyacencia'][requisito]:
        grafo['adyacencia'][requisito].append(materia)
    if requisito not in grafo['requisitos'][materia]:
        grafo['requisitos'][materia].append(requisito)
    return grafo


def requisitos_pendientes(grafo, materia, aprobadas):
    return [r for r in grafo['requisitos'].get(materia, []) if r not in aprobadas]


def materias_disponibles(grafo, aprobadas):
    return [clave for clave in grafo['materias']
            if clave not in aprobadas and not requisitos_pendientes(grafo, clave, aprobadas)]


def dependientes_directas(grafo, materia):
    return list(grafo['adyacencia'].get(materia, []))


def ruta_requisitos(grafo, materia, visitados=None):
    """Devuelve prerrequisitos transitivos; evita ciclos mediante visitados."""
    if visitados is None:
        visitados = set()
    pendientes = []
    for requisito in grafo['requisitos'].get(materia, []):
        if requisito not in visitados:
            visitados.add(requisito)
            pendientes.append(requisito)
            pendientes.extend(ruta_requisitos(grafo, requisito, visitados))
    return pendientes

#Despliegue
