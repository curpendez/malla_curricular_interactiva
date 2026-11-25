"""Cola FIFO dinámica, enlazada por nodos diccionario. Sin clases.

Las operaciones encolar/desencolar son O(1). Cada nodo se crea
solamente cuando se agrega un dato a la cola.
"""


def crear_cola():
    return {'primero': None, 'ultimo': None, 'longitud': 0}


def encolar(cola, valor):
    nodo = {'valor': valor, 'siguiente': None}
    if cola['ultimo'] is None:
        cola['primero'] = nodo
    else:
        cola['ultimo']['siguiente'] = nodo
    cola['ultimo'] = nodo
    cola['longitud'] += 1
    return cola


def desencolar(cola):
    if cola['primero'] is None:
        raise IndexError('La cola está vacía')
    nodo = cola['primero']
    cola['primero'] = nodo['siguiente']
    if cola['primero'] is None:
        cola['ultimo'] = None
    cola['longitud'] -= 1
    return nodo['valor']


def esta_vacia(cola):
    return cola['primero'] is None


def longitud(cola):
    return cola['longitud']


def recorrido_bfs(grafo, origen):
    """Recorre materias dependientes por niveles usando una cola enlazada."""
    cola = crear_cola()
    encolar(cola, origen)
    visitados = {origen}
    resultado = []
    while not esta_vacia(cola):
        actual = desencolar(cola)
        resultado.append(actual)
        for siguiente in grafo['adyacencia'].get(actual, []):
            if siguiente not in visitados:
                visitados.add(siguiente)
                encolar(cola, siguiente)
    return resultado


def ordenar_disponibles(grafo, disponibles):
    """Procesa materias disponibles con una cola FIFO y respeta el plan."""
    claves = set(disponibles)
    cola = crear_cola()
    for clave in grafo['materias']:
        if clave in claves:
            encolar(cola, clave)
    orden = []
    while not esta_vacia(cola):
        orden.append(desencolar(cola))
    return orden
