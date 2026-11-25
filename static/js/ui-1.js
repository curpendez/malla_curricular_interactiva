
    try {
      const keys = ['rutaAcademica.appearance.v4', 'rutaAcademica.appearance.v3', 'rutaAcademica.appearance.v2', 'rutaAcademica.palette.v1'];
      const saved = keys.map(key => localStorage.getItem(key)).find(Boolean);
      if (saved) {
        const appearance = JSON.parse(saved);
        if (appearance?.mode === 'dark' || appearance?.dark === true) document.documentElement.dataset.raMode = 'dark';
      }
    } catch {}
  