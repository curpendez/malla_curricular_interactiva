/* Login: presentación y eventos en JavaScript; contraseñas/sesiones en Python. */
(() => {
  'use strict';
  const API = 'http://127.0.0.1:5000/api/auth';
  const $ = id => document.getElementById(id);
  let registro = false;
  const emailValido = value => /^[^\s@]+@uamv\.edu\.ni$/i.test(value.trim());
  function mostrarMensaje(texto, tipo = 'error') {
    const el = $('feedback');
    el.textContent = texto;
    el.classList.toggle('info', tipo === 'info');
    el.classList.toggle('hidden', !texto);
  }
  function cambiarModo(crear) {
    registro = crear;
    $('nameField').classList.toggle('hidden', !crear);
    $('passwordHint').classList.toggle('hidden', !crear);
    $('forgotPassword').classList.toggle('hidden', crear);
    $('formTitle').textContent = crear ? 'Crear Cuenta' : 'Iniciar Sesión';
    $('submitBtn').textContent = crear ? 'Crear cuenta' : 'Ingresar';
    $('accountPrompt').textContent = crear ? '¿Ya tienes una cuenta?' : '¿Aún no tienes una cuenta?';
    $('switchMode').textContent = crear ? 'Iniciar sesión' : 'Crear cuenta';
    $('nombre').required = crear;
    $('clave').autocomplete = crear ? 'new-password' : 'current-password';
    $('clave').value = '';
    mostrarMensaje('');
  }
  $('switchMode').addEventListener('click', () => cambiarModo(!registro));
  $('showPassword').addEventListener('click', () => {
    const visible = $('clave').type === 'text';
    $('clave').type = visible ? 'password' : 'text';
    $('showPassword').setAttribute('aria-pressed', String(!visible));
    $('showPassword').setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
  $('forgotPassword').addEventListener('click', () => mostrarMensaje(
    'La recuperación automática de contraseñas aún no está disponible en esta versión local. Contacta al administrador del proyecto para recuperar el acceso.', 'info'
  ));
  $('authForm').addEventListener('submit', async event => {
    event.preventDefault();
    const correo = $('correo').value.trim().toLowerCase();
    const clave = $('clave').value;
    if (!emailValido(correo)) return mostrarMensaje('Introduce tu correo institucional completo, terminado en @uamv.edu.ni.');
    if (!clave) return mostrarMensaje('Introduce tu contraseña.');
    if (registro && (clave.length < 10 || clave.length > 128)) return mostrarMensaje('Tu contraseña debe tener entre 10 y 128 caracteres.');
    const payload = {correo, clave};
    if (registro) payload.nombre = $('nombre').value.trim();
    if (registro && payload.nombre.length < 2) return mostrarMensaje('Escribe tu nombre completo.');
    $('submitBtn').disabled = true;
    mostrarMensaje('');
    try {
      const response = await fetch(`${API}/${registro ? 'registro' : 'login'}`, {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo completar el acceso.');
      location.replace('./index.html');
    } catch (err) {
      mostrarMensaje(err instanceof TypeError
        ? 'No hay conexión con Python. Ejecuta python3 servidor.py y abre Go Live en http://127.0.0.1:5500.'
        : err.message);
    } finally {
      $('submitBtn').disabled = false;
    }
  });
  fetch(API + '/me', {credentials: 'include'}).then(response => {
    if (response.ok) location.replace('./index.html');
  }).catch(() => {});
})();
