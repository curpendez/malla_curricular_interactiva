"""Simulador de análisis a posteriori para búsquedas de materias.

No define clases propias y no necesita dependencias externas.

Ejemplos:
    python3 simulador_busqueda.py --n 1000 --repeticiones 30
    python3 simulador_busqueda.py --tamanos 100,500,1000,5000 --repeticiones 20

Integración:
    from simulador_busqueda import ejecutar_simulacion
    resultados = ejecutar_simulacion([100, 500, 1000], repeticiones=20)
"""

import argparse
import csv
import random
import statistics
from pathlib import Path
from time import perf_counter_ns


def generar_materias(n, semilla=42):
    """Crea materias sintéticas con prerrequisitos que forman un grafo acíclico."""
    if n < 1:
        raise ValueError("La cantidad de materias debe ser mayor que cero")
    azar = random.Random(semilla)
    materias = []
    for indice in range(n):
        codigo = f"MAT{indice:07d}"
        anteriores = list(range(max(0, indice - 20), indice))
        cantidad = min(len(anteriores), azar.randint(0, 3))
        requisitos = [f"MAT{j:07d}" for j in azar.sample(anteriores, cantidad)]
        materias.append({
            "codigo": codigo,
            "nombre": f"Materia {indice + 1}",
            "semestre": indice // 6 + 1,
            "requisitos": requisitos,
        })
    return materias


def crear_indice(materias):
    """Índice de acceso directo por código (diccionario de Python)."""
    return {materia["codigo"]: materia for materia in materias}


def crear_grafo(materias):
    """Lista de adyacencia: requisito -> materias que desbloquea."""
    grafo = {materia["codigo"]: [] for materia in materias}
    for materia in materias:
        for requisito in materia["requisitos"]:
            if requisito in grafo:
                grafo[requisito].append(materia["codigo"])
    return grafo


def busqueda_lineal(materias, codigo):
    for materia in materias:
        if materia["codigo"] == codigo:
            return materia
    return None


def busqueda_indice(indice, codigo):
    return indice.get(codigo)


def crear_cola():
    """Cola dinámica enlazada: los nodos se crean al encolar (sin clases)."""
    return {"primero": None, "ultimo": None}


def encolar(cola, valor):
    nodo = {"valor": valor, "siguiente": None}
    if cola["ultimo"] is None:
        cola["primero"] = nodo
    else:
        cola["ultimo"]["siguiente"] = nodo
    cola["ultimo"] = nodo


def desencolar(cola):
    nodo = cola["primero"]
    if nodo is None:
        raise IndexError("No se puede desencolar una cola vacía")
    cola["primero"] = nodo["siguiente"]
    if cola["primero"] is None:
        cola["ultimo"] = None
    return nodo["valor"]


def busqueda_bfs(grafo, origen, objetivo):
    """Búsqueda en anchura usando cola FIFO; retorna True si hay camino."""
    if origen not in grafo or objetivo not in grafo:
        return False
    cola = crear_cola()
    encolar(cola, origen)
    visitados = {origen}
    while cola["primero"] is not None:
        actual = desencolar(cola)
        if actual == objetivo:
            return True
        for vecino in grafo[actual]:
            if vecino not in visitados:
                visitados.add(vecino)
                encolar(cola, vecino)
    return False


def medir_ns(funcion, repeticiones, operaciones_por_repeticion=1):
    """Mide únicamente la operación; entrega mediana y media por operación en ms."""
    mediciones = []
    for _ in range(repeticiones):
        inicio = perf_counter_ns()
        for _ in range(operaciones_por_repeticion):
            funcion()
        fin = perf_counter_ns()
        mediciones.append((fin - inicio) / operaciones_por_repeticion / 1_000_000)
    return {
        "mediana_ms": statistics.median(mediciones),
        "media_ms": statistics.mean(mediciones),
        "min_ms": min(mediciones),
        "max_ms": max(mediciones),
    }


def ejecutar_simulacion(tamanos, repeticiones=30, operaciones_por_repeticion=100,
                        semilla=42, destino_csv=None):
    """Compara tres búsquedas con la misma instancia para cada tamaño n.

    - Lineal: localizar el último código en una lista (peor caso).
    - Índice: localizar el mismo código mediante un diccionario.
    - BFS: buscar si desde la primera materia existe camino a la última.
      Puede no haber camino: se mide igualmente la exploración realizada.

    La generación de los datos e índices no forma parte del cronometraje.
    """
    if repeticiones < 1 or operaciones_por_repeticion < 1:
        raise ValueError("Las repeticiones y operaciones deben ser positivas")
    resultados = []
    for n in tamanos:
        materias = generar_materias(n, semilla)
        indice = crear_indice(materias)
        grafo = crear_grafo(materias)
        objetivo = materias[-1]["codigo"]
        origen = materias[0]["codigo"]
        if busqueda_lineal(materias, objetivo) != busqueda_indice(indice, objetivo):
            raise AssertionError("Los métodos de búsqueda no coinciden")
        pruebas = [
            ("lineal_lista", lambda: busqueda_lineal(materias, objetivo)),
            ("indice_diccionario", lambda: busqueda_indice(indice, objetivo)),
            ("bfs_grafo_cola", lambda: busqueda_bfs(grafo, origen, objetivo)),
        ]
        for metodo, accion in pruebas:
            # Calentamiento para reducir fluctuaciones del primer uso.
            accion()
            datos = medir_ns(accion, repeticiones, operaciones_por_repeticion)
            resultados.append({"n": n, "metodo": metodo,
                               "repeticiones": repeticiones,
                               "operaciones_por_repeticion": operaciones_por_repeticion,
                               **datos})
    if destino_csv:
        ruta = Path(destino_csv)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with ruta.open("w", newline="", encoding="utf-8") as archivo:
            escritor = csv.DictWriter(archivo, fieldnames=list(resultados[0]))
            escritor.writeheader()
            escritor.writerows(resultados)
    return resultados


def imprimir_resultados(resultados):
    print("\nANÁLISIS A POSTERIORI — TIEMPOS REALES (milisegundos por búsqueda)")
    print("-" * 78)
    print(f"{'Materias':>9}  {'Método':<21} {'Mediana (ms)':>14} {'Media (ms)':>13}")
    print("-" * 78)
    for resultado in resultados:
        print(f"{resultado['n']:>9}  {resultado['metodo']:<21} "
              f"{resultado['mediana_ms']:>14.6f} {resultado['media_ms']:>13.6f}")
    print("\nNota: tiempos dependientes del equipo; BFS mide conectividad en el grafo")
    print("y no equivale a una búsqueda directa por código.")


def main():
    parser = argparse.ArgumentParser(description="Simula búsquedas en n materias")
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--n", type=int, help="Una cantidad de materias")
    grupo.add_argument("--tamanos", type=str, help="Cantidades separadas por comas")
    parser.add_argument("--repeticiones", type=int, default=30)
    parser.add_argument("--operaciones", type=int, default=100,
                        help="Búsquedas por repetición para reducir ruido de medición")
    parser.add_argument("--csv", default="resultados_busqueda.csv")
    argumentos = parser.parse_args()
    try:
        tamanos = ([argumentos.n] if argumentos.n is not None
                   else [int(x.strip()) for x in argumentos.tamanos.split(",")]
                   if argumentos.tamanos else [100, 500, 1000, 5000])
        resultados = ejecutar_simulacion(tamanos, argumentos.repeticiones,
                                         argumentos.operaciones,
                                         destino_csv=argumentos.csv)
    except ValueError as error:
        parser.error(str(error))
    imprimir_resultados(resultados)
    print(f"\nResultados exportados a: {argumentos.csv}")


if __name__ == "__main__":
    main()
