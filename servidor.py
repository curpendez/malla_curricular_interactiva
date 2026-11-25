"""API Python local con autenticación y estructuras dinámicas; sin clases ni pip."""
import json
import sqlite3
from pathlib import Path
from threading import Lock
from wsgiref.simple_server import make_server
from academico import evaluar, alternar_cursada
from grafo_requisitos import crear_grafo, ruta_requisitos
from cola_enlazada import recorrido_bfs
from autenticacion import (preparar_tablas, registrar, autenticar, crear_sesion,
                           usuario_actual, cerrar_sesion, cookie_sesion, cookie_borrada)

BASE = Path(__file__).resolve().parent
DATABASE = BASE / 'ruta_academica.sqlite3'
LOCK = Lock()
MAX_BYTES = 18 * 1024 * 1024
ALLOWED_ORIGINS = {'http://127.0.0.1:5500', 'http://localhost:5500',
                   'http://127.0.0.1:5501', 'http://localhost:5501',
                   'http://127.0.0.1:5000', 'http://localhost:5000'}


def init_db():
    with sqlite3.connect(DATABASE) as db:
        db.execute('PRAGMA foreign_keys=ON')
        preparar_tablas(db)


def save_state(usuario_id, state):
    with LOCK, sqlite3.connect(DATABASE) as db:
        db.execute('INSERT INTO estados_usuario (usuario_id,payload) VALUES (?,?) '
                   'ON CONFLICT(usuario_id) DO UPDATE SET payload=excluded.payload',
                   (usuario_id, json.dumps(state, ensure_ascii=False)))


def load_state(usuario_id):
    with sqlite3.connect(DATABASE) as db:
        row = db.execute('SELECT payload FROM estados_usuario WHERE usuario_id=?', (usuario_id,)).fetchone()
    return json.loads(row[0]) if row else None


def responder(start_response, status, payload, origin=None, cookie=None):
    contenido = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    headers = [('Content-Type', 'application/json; charset=utf-8'),
               ('Content-Length', str(len(contenido))), ('Cache-Control', 'no-store')]
    if origin in ALLOWED_ORIGINS:
        headers += [('Access-Control-Allow-Origin', origin), ('Vary', 'Origin'),
                    ('Access-Control-Allow-Credentials', 'true'),
                    ('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'),
                    ('Access-Control-Allow-Headers', 'Content-Type')]
    if cookie:
        headers.append(('Set-Cookie', cookie))
    start_response(status, headers)
    return [contenido]


def recibir_json(environ):
    size = int(environ.get('CONTENT_LENGTH') or '0')
    if not 0 < size <= MAX_BYTES:
        raise ValueError('Se requiere un JSON válido de tamaño permitido.')
    data = json.loads(environ['wsgi.input'].read(size))
    if not isinstance(data, dict):
        raise ValueError('Se requiere un objeto JSON.')
    return data


def aplicacion(environ, start_response):
    ruta = environ.get('PATH_INFO', '')
    metodo = environ.get('REQUEST_METHOD', 'GET')
    origin = environ.get('HTTP_ORIGIN')
    if metodo == 'OPTIONS':
        if origin not in ALLOWED_ORIGINS:
            return responder(start_response, '403 Forbidden', {'error': 'Origen no permitido'})
        return responder(start_response, '200 OK', {}, origin)
    if origin and origin not in ALLOWED_ORIGINS:
        return responder(start_response, '403 Forbidden', {'error': 'Origen no permitido'})
    if metodo == 'GET' and ruta == '/api/salud':
        return responder(start_response, '200 OK', {'ok': True, 'servidor': 'Python sin dependencias',
                            'estructuras': ['grafo dirigido', 'cola enlazada FIFO']}, origin)
    try:
        with sqlite3.connect(DATABASE) as db:
            db.execute('PRAGMA foreign_keys=ON')
            if metodo == 'POST' and ruta in ('/api/auth/registro', '/api/auth/login'):
                data = recibir_json(environ)
                if ruta.endswith('registro'):
                    usuario = registrar(db, data.get('nombre'), data.get('correo'), data.get('clave'))
                else:
                    usuario = autenticar(db, data.get('correo'), data.get('clave'))
                token = crear_sesion(db, usuario['id'])
                return responder(start_response, '200 OK', {'ok': True, 'usuario': usuario}, origin,
                                 cookie_sesion(token, environ))
            usuario = usuario_actual(db, environ)
            if not usuario:
                return responder(start_response, '401 Unauthorized', {'error': 'Iniciá sesión para continuar.'}, origin)
            if metodo == 'GET' and ruta == '/api/auth/me':
                return responder(start_response, '200 OK', {'usuario': usuario}, origin)
            if metodo == 'POST' and ruta == '/api/auth/logout':
                cerrar_sesion(db, environ)
                return responder(start_response, '200 OK', {'ok': True}, origin, cookie_borrada())
            if metodo == 'GET' and ruta == '/api/estado':
                return responder(start_response, '200 OK', {'state': load_state(usuario['id'])}, origin)
            if metodo != 'POST' or ruta not in ('/api/sincronizar', '/api/evaluar', '/api/alternar-materia', '/api/grafo'):
                return responder(start_response, '404 Not Found', {'error': 'Ruta no encontrada'}, origin)
            data = recibir_json(environ)
            if ruta == '/api/alternar-materia':
                state, key = data.get('state'), data.get('key')
                ci = int(data.get('career', 0))
                if not isinstance(state, dict) or not isinstance(key, str) or ci not in (0, 1):
                    raise ValueError('Estado, materia o carrera inválidos.')
                updated = alternar_cursada(state, key, ci, data.get('value'))
                save_state(usuario['id'], updated)
                result = {'state': updated, 'evaluation': evaluar(updated)}
            elif ruta == '/api/grafo':
                state, ci = data.get('state') or data, int(data.get('career', 0))
                if ci not in (0, 1):
                    raise ValueError('Carrera inválida.')
                careers = state.get('careers') or []
                courses = ((careers[ci] or {}).get('courses') or []) if ci < len(careers) else []
                grafo = crear_grafo(courses)
                key = str(data.get('key') or '')
                result = {'vertices': list(grafo['materias']), 'adyacencia': grafo['adyacencia'],
                          'requisitos': grafo['requisitos']}
                if key:
                    result['cadena_requisitos'] = ruta_requisitos(grafo, key)
                    result['dependientes_bfs'] = recorrido_bfs(grafo, key)
            else:
                result = evaluar(data)
                if ruta == '/api/sincronizar':
                    save_state(usuario['id'], data)
            return responder(start_response, '200 OK', result, origin)
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        return responder(start_response, '400 Bad Request', {'error': str(exc)}, origin)


def iniciar():
    init_db()
    with make_server('127.0.0.1', 5000, aplicacion) as server:
        print('Servidor Python listo: http://127.0.0.1:5000/api/salud', flush=True)
        print('Abre login.html con Go Live (puerto 5500).', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('Servidor detenido.')


if __name__ == '__main__':
    iniciar()

#Fin