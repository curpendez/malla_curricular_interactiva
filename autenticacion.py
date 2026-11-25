"""Autenticación modular sin clases, solo biblioteca estándar."""
import hashlib
import hmac
import re
import secrets
import sqlite3
import time
from threading import Lock
from http.cookies import SimpleCookie

SESSION_SECONDS = 7 * 24 * 3600
ITERATIONS = 310_000

# PILA DINÁMICA DE INICIOS DE SESIÓN (LIFO)
# Nodos enlazados mediante diccionarios: no se definen clases.
# Guarda únicamente metadatos de intentos; NUNCA contraseñas ni tokens.
# Es un historial temporal en memoria, no reemplaza la base de datos.
MAX_EVENTOS_LOGIN = 100
PILA_LOGIN = {'cima': None, 'tamano': 0}
PILA_LOCK = Lock()


def apilar_login(pila, evento):
    """Push: inserta un nodo en la cima en O(1)."""
    pila['cima'] = {'valor': evento, 'siguiente': pila['cima']}
    pila['tamano'] += 1
    return pila['tamano']


def desapilar_login(pila):
    """Pop: retira el evento más reciente (LIFO), en O(1)."""
    if pila['cima'] is None:
        raise IndexError('La pila de inicios de sesión está vacía.')
    nodo = pila['cima']
    pila['cima'] = nodo['siguiente']
    pila['tamano'] -= 1
    return nodo['valor']


def cima_login(pila):
    """Peek: consulta la cima sin eliminarla."""
    return pila['cima']['valor'] if pila['cima'] is not None else None


def listar_login(pila, limite=10, usuario_id=None):
    """Recorre la pila desde el intento más reciente, sin modificarla."""
    actual = pila['cima']
    resultado = []
    while actual is not None and len(resultado) < limite:
        dato = actual['valor']
        if usuario_id is None or dato['usuario_id'] == usuario_id:
            resultado.append(dict(dato))
        actual = actual['siguiente']
    return resultado


def registrar_evento_login(usuario_id, accion, exitoso):
    """Apila un evento de autenticación sin almacenar información secreta."""
    evento = {'usuario_id': usuario_id, 'accion': accion,
              'exitoso': bool(exitoso), 'fecha': int(time.time())}
    with PILA_LOCK:
        apilar_login(PILA_LOGIN, evento)
        # Se conserva un historial acotado para no consumir memoria indefinidamente.
        if PILA_LOGIN['tamano'] > MAX_EVENTOS_LOGIN:
            actual = PILA_LOGIN['cima']
            for _ in range(MAX_EVENTOS_LOGIN - 1):
                actual = actual['siguiente']
            actual['siguiente'] = None
            PILA_LOGIN['tamano'] = MAX_EVENTOS_LOGIN
    return evento


def historial_login_usuario(usuario_id, limite=10):
    """Devuelve los últimos eventos del usuario autenticado, en orden LIFO."""
    limite = max(1, min(int(limite), 30))
    with PILA_LOCK:
        return listar_login(PILA_LOGIN, limite, usuario_id)


def preparar_tablas(db):
    db.execute('''CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        correo TEXT NOT NULL UNIQUE COLLATE NOCASE,
        sal BLOB NOT NULL,
        clave_hash BLOB NOT NULL,
        creado INTEGER NOT NULL)''')
    db.execute('''CREATE TABLE IF NOT EXISTS sesiones (
        token_hash TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        vence INTEGER NOT NULL)''')
    db.execute('''CREATE TABLE IF NOT EXISTS estados_usuario (
        usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
        payload TEXT NOT NULL)''')


def validar_registro(nombre, correo, clave):
    nombre = str(nombre or '').strip()
    correo = str(correo or '').strip().lower()
    if not (2 <= len(nombre) <= 80):
        raise ValueError('El nombre debe tener entre 2 y 80 caracteres.')
    if len(correo) > 254 or not re.fullmatch(r'[^\s@]+@uamv\.edu\.ni', correo):
        raise ValueError('Utilizá un correo institucional @uamv.edu.ni válido.')
    if not isinstance(clave, str) or len(clave) < 10 or len(clave) > 128:
        raise ValueError('La contraseña debe tener entre 10 y 128 caracteres.')
    return nombre, correo


def derivar_clave(clave, sal):
    return hashlib.pbkdf2_hmac('sha256', clave.encode('utf-8'), sal, ITERATIONS)


def registrar(db, nombre, correo, clave):
    nombre, correo = validar_registro(nombre, correo, clave)
    sal = secrets.token_bytes(16)
    try:
        cursor = db.execute('INSERT INTO usuarios (nombre,correo,sal,clave_hash,creado) VALUES (?,?,?,?,?)',
                            (nombre, correo, sal, derivar_clave(clave, sal), int(time.time())))
    except sqlite3.IntegrityError:
        raise ValueError('Ya existe una cuenta con ese correo.') from None
    return {'id': cursor.lastrowid, 'nombre': nombre, 'correo': correo}


def autenticar(db, correo, clave):
    correo = str(correo or '').strip().lower()
    if not re.fullmatch(r'[^\s@]+@uamv\.edu\.ni', correo):
        raise ValueError('Utilizá tu correo institucional @uamv.edu.ni.')
    row = db.execute('SELECT id,nombre,correo,sal,clave_hash FROM usuarios WHERE correo=?', (correo,)).fetchone()
    if not row or not isinstance(clave, str) or not hmac.compare_digest(derivar_clave(clave, row[3]), row[4]):
        registrar_evento_login(None, 'intento_fallido', False)
        raise ValueError('Correo o contraseña incorrectos.')
    registrar_evento_login(row[0], 'inicio_sesion', True)
    return {'id': row[0], 'nombre': row[1], 'correo': row[2]}


def crear_sesion(db, usuario_id):
    token = secrets.token_urlsafe(32)
    db.execute('INSERT INTO sesiones(token_hash,usuario_id,vence) VALUES (?,?,?)',
               (hashlib.sha256(token.encode()).hexdigest(), usuario_id, int(time.time()) + SESSION_SECONDS))
    return token


def leer_cookie(environ):
    cookies = SimpleCookie()
    try:
        cookies.load(environ.get('HTTP_COOKIE', ''))
        return cookies['ra_sesion'].value if 'ra_sesion' in cookies else None
    except Exception:
        return None


def usuario_actual(db, environ):
    token = leer_cookie(environ)
    if not token:
        return None
    row = db.execute('''SELECT u.id,u.nombre,u.correo FROM sesiones s
                        JOIN usuarios u ON u.id=s.usuario_id
                        WHERE s.token_hash=? AND s.vence>?''',
                     (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
    return {'id': row[0], 'nombre': row[1], 'correo': row[2]} if row else None


def cerrar_sesion(db, environ):
    usuario = usuario_actual(db, environ)
    token = leer_cookie(environ)
    if token:
        db.execute('DELETE FROM sesiones WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))
    if usuario:
        registrar_evento_login(usuario['id'], 'cierre_sesion', True)


def cookie_sesion(token, environ):
    # HTTP local en 127.0.0.1; Secure se activa al desplegar detrás de HTTPS.
    secure = '; Secure' if environ.get('wsgi.url_scheme') == 'https' else ''
    return f'ra_sesion={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_SECONDS}{secure}'


def cookie_borrada():
    return 'ra_sesion=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
