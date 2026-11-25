/* Comunicación con Python: los elementos visuales siguen en JavaScript.
   Se conservan los datos del navegador para migrar las sesiones anteriores. */
(function () {
  'use strict';
  let evaluation = null;
  let latest = null;
  let running = false;
  let signature = '';
  async function send() {
    if (running || !latest) return;
    running = true;
    const snapshot = latest;
    latest = null;
    try {
      const response = await fetch('http://127.0.0.1:5000/api/sincronizar', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
      if (!response.ok) throw new Error('Servidor académico ' + response.status);
      evaluation = await response.json();
      if (!latest) window.dispatchEvent(new CustomEvent('ruta:backend-ready', { detail: evaluation }));
    } catch (error) {
      console.warn('No se pudo sincronizar con Python; se conserva el respaldo local.', error);
    } finally {
      running = false;
      if (latest) send();
    }
  }
  window.RutaBackend = {
    sync(snapshot) {
      const body = JSON.stringify(snapshot);
      if (body === signature) return;
      signature = body;
      evaluation = null; // no reutilizar resultados anteriores tras una modificación
      latest = snapshot;
      send();
    },
    status(ci, key) { return evaluation?.statuses?.[String(ci)]?.[key] || null; },
    grade(ci, key) { return evaluation?.grades?.[String(ci)]?.[key] || null; },
    statistics(ci) { return evaluation?.statistics?.[String(ci)] || null; },
    recommend(ci, parity, currentKeys = []) {
      const keys = evaluation?.recommendations?.[`${ci}:${parity}`];
      return keys ? keys.filter(k => !currentKeys.includes(k)) : null;
    },
    isConnected() { return !!evaluation; }
  };
})();
