
/* Personalización local sin inicio de sesión */
(() => {
  'use strict';
  const THEME_KEY='rutaAcademica.theme.local',PROFILE_KEY='rutaAcademica.profile.local',LEGACY_THEME_PREFIX='rutaAcademica.theme.',LEGACY_SESSION_KEY='rutaAcademica.session.cif',LEGACY_USERS_KEY='rutaAcademica.auth.v1';
  const DB='rutaAcademicaMedia',MEDIA_STORE='wallpapers',AVATAR_KEY='profile-avatar';
  function legacyCif(){try{const s=String(sessionStorage.getItem(LEGACY_SESSION_KEY)||'').trim().toUpperCase();if(s)return s;const u=JSON.parse(localStorage.getItem(LEGACY_USERS_KEY)||'{}')||{},k=Object.keys(u);return k.length===1?String(k[0]).trim().toUpperCase():''}catch{return''}}
  try{if(!localStorage.getItem(THEME_KEY)){const cif=legacyCif();if(cif){const old=localStorage.getItem(LEGACY_THEME_PREFIX+encodeURIComponent(cif));if(old)localStorage.setItem(THEME_KEY,old)}}}catch{}
  const DEFAULT_THEME={primary:'#0099A8',accent:'#0099A8',bg:'#f0f8f9',card:'#ffffff',text:'#092b43',muted:'#486779',border:'#b9d9dd',sidebar:'#0099A8',sidebarText:'#05263d',topbar:'#0099A8',button:'#0099A8',tableHead:'#0099A8',taken:'#073a58',available:'#ffffff',blocked:'#eaf0f1',success:'#06846d',warning:'#996410',danger:'#c44559',schedule1:'#0f4c81',schedule2:'#0099A8',schedule3:'#49657f',fab:'#0099A8',radius:18,compact:false,shadows:true,accessible:false,autoMode:false};
  const DEFAULT_PROFILE={name:'Perfil del estudiante',subtitle:'Estudiante universitario',career:'',semester:'',status:'',bio:'',avatarStyle:'rounded'},clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  function hexToRgb(hex){hex=String(hex||'#000').replace('#','');if(hex.length===3)hex=[...hex].map(x=>x+x).join('');const n=parseInt(hex,16)||0;return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}}
  function rgbToHex({r,g,b}){return'#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('')}function mix(h,t,w){const a=hexToRgb(h),b=hexToRgb(t);return rgbToHex({r:a.r+(b.r-a.r)*w,g:a.g+(b.g-a.g)*w,b:a.b+(b.b-a.b)*w})}function contrastText(h){const{r,g,b}=hexToRgb(h);return(r*299+g*587+b*114)/1000>150?'#111827':'#fff'}
  function loadTheme(){let old;try{old=JSON.parse(localStorage.getItem(THEME_KEY)||'{}')}catch{}return {...DEFAULT_THEME,accessible:!!old?.accessible}}function saveTheme(t){try{localStorage.setItem(THEME_KEY,JSON.stringify(t))}catch{}}function loadProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}');
      const loaded = {...DEFAULT_PROFILE,...saved};
      if (loaded.name === 'Mi perfil') loaded.name = DEFAULT_PROFILE.name;
      return loaded;
    } catch { return {...DEFAULT_PROFILE}; }
  }
  function saveProfile() {
    try {
      localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));
      return true;
    } catch { return false; }
  }
  function initials(n){const p=String(n||'Ruta Académica').trim().split(/\s+/).filter(Boolean);return((p[0]?.[0]||'R')+(p[1]?.[0]||p[0]?.[1]||'A')).toUpperCase()}
  let theme=loadTheme(),profile=loadProfile();
  const SYSTEM_THEME=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
  const AUTO_DARK_PALETTE={bg:'#080f1c',card:'#121e30',text:'#f4f8ff',muted:'#bdc9dc',border:'#30435b',sidebar:'#040c1b',sidebarText:'#f4f8ff',topbar:'#0c1728',available:'#15243a',blocked:'#1c293a'};
  function systemIsDark(){return !!(SYSTEM_THEME&&SYSTEM_THEME.matches)}
  function activeThemePalette(base){
    if(!base.autoMode||!systemIsDark())return base;
    return {...base,...AUTO_DARK_PALETTE,tableHead:mix(base.primary,'#000',.30)};
  }
  function applyTheme(t){
    theme={...DEFAULT_THEME,...t,autoMode:false};
    document.documentElement.style.setProperty('--theme-radius',(theme.radius||18)+'px');
    document.body.classList.toggle('theme-compact',!!theme.compact);
    document.body.classList.toggle('no-theme-shadows',!theme.shadows);
    document.body.classList.toggle('accessible-mode',!!theme.accessible);
    syncThemeControls();
    document.dispatchEvent(new CustomEvent('ra:palette-reapply'));
  }
  function syncThemeControls(){
    const q=id=>document.getElementById(id);
    const map={themePrimary:'primary',themeAccent:'accent',themeBg:'bg',themeCard:'card',themeText:'text',themeMuted:'muted',themeBorder:'border',themeSidebar:'sidebar',themeSidebarText:'sidebarText',themeTopbar:'topbar',themeButton:'button',themeTableHead:'tableHead',themeTaken:'taken',themeAvailable:'available',themeBlocked:'blocked',themeSuccess:'success',themeWarning:'warning',themeDanger:'danger',themeSchedule1:'schedule1',themeSchedule2:'schedule2',themeSchedule3:'schedule3'};
    Object.entries(map).forEach(([id,k])=>{if(q(id))q(id).value=theme[k]});
    if(q('themeRadius'))q('themeRadius').value=theme.radius;if(q('themeCompact'))q('themeCompact').checked=!!theme.compact;if(q('themeShadows'))q('themeShadows').checked=!!theme.shadows;if(q('themeAccessible'))q('themeAccessible').checked=!!theme.accessible;if(q('themeAutoMode'))q('themeAutoMode').checked=!!theme.autoMode;
    if(q('radiusValue'))q('radiusValue').textContent=theme.radius+' px';
    if(q('deviceThemeLabel'))q('deviceThemeLabel').textContent=systemIsDark()?'Oscuro':'Claro';
  }
  function patchTheme(part){const permitted={accessible:!!part.accessible};theme={...DEFAULT_THEME,accessible:('accessible' in part)?permitted.accessible:theme.accessible};applyTheme(theme);saveTheme(theme)}window.RutaTheme={get:()=>({...theme}),apply:applyTheme,patch:patchTheme};applyTheme(theme);
  if(SYSTEM_THEME){const onSystemThemeChange=()=>{if(theme.autoMode)applyTheme(theme);else syncThemeControls()};if(SYSTEM_THEME.addEventListener)SYSTEM_THEME.addEventListener('change',onSystemThemeChange);else if(SYSTEM_THEME.addListener)SYSTEM_THEME.addListener(onSystemThemeChange)}
  function openMediaDB(){return new Promise((res,rej)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(MEDIA_STORE))q.result.createObjectStore(MEDIA_STORE)};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}async function mediaGet(k){const d=await openMediaDB(),v=await new Promise((res,rej)=>{const q=d.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)});d.close();return v}async function mediaPut(k,b){const d=await openMediaDB();await new Promise((res,rej)=>{const t=d.transaction(MEDIA_STORE,'readwrite');t.objectStore(MEDIA_STORE).put(b,k);t.oncomplete=res;t.onerror=()=>rej(t.error)});d.close()}async function mediaDelete(k){const d=await openMediaDB();await new Promise((res,rej)=>{const t=d.transaction(MEDIA_STORE,'readwrite');t.objectStore(MEDIA_STORE).delete(k);t.oncomplete=res;t.onerror=()=>rej(t.error)});d.close()}
  const q = id => document.getElementById(id);
  const profileFields = [
    ['profileNameInput','name',80], ['profileSubtitleInput','subtitle',100],
    ['profileCareerInput','career',100], ['profileSemesterInput','semester',12],
    ['profileStatusInput','status',28], ['profileAvatarStyle','avatarStyle',12],
    ['profileBioInput','bio',160]
  ];
  const avatarStyles = ['rounded','circle','square'];
  let avatarUrl = '', activePlan = '', photoBusy = false;
  let mediaQueue = Promise.resolve();

  function renderProfileText(syncInputs = false) {
    const value = key => String(profile[key] ?? '').trim();
    const name = value('name') || DEFAULT_PROFILE.name;
    const career = value('career') || activePlan;
    const semester = value('semester');
    const values = {
      name, subtitle: value('subtitle') || DEFAULT_PROFILE.subtitle, career: career || 'Sin indicar',
      semester: semester ? semester + '° semestre' : 'Sin indicar',
      status: value('status') || 'Sin indicar', bio: value('bio')
    };
    q('profileNameLabel').textContent = name;
    q('profileSubtitleLabel').textContent = career || values.subtitle;
    document.querySelectorAll('[data-student-text]').forEach(el => {
      el.textContent = values[el.dataset.studentText];
    });
    document.querySelectorAll('[data-student-initials]').forEach(el => {
      el.textContent = name === DEFAULT_PROFILE.name ? 'RA' : initials(name);
    });
    document.querySelectorAll('[data-student-bio]').forEach(el => { el.hidden = !values.bio; });
    q('profileBioCount').textContent = String(profile.bio ?? '').length + '/160';
    document.body.dataset.profileAvatarStyle = avatarStyles.includes(profile.avatarStyle) ? profile.avatarStyle : 'rounded';
    if (syncInputs) {
      for (const [id,key,limit] of profileFields) q(id).value = String(profile[key] ?? '').slice(0,limit);
    }
  }

  function syncProfilePhoto() {
    document.querySelectorAll('[data-student-photo]').forEach(img => {
      if (avatarUrl) {
        if (img.getAttribute('src') !== avatarUrl) img.setAttribute('src',avatarUrl);
      } else img.removeAttribute('src');
      img.hidden = !avatarUrl;
    });
    document.querySelectorAll('[data-student-initials]').forEach(el => { el.hidden = !!avatarUrl; });
    q('removeProfilePhoto').hidden = !avatarUrl;
  }

  function updateAvatar(blob) {
    const previous = avatarUrl;
    avatarUrl = blob ? URL.createObjectURL(blob) : '';
    syncProfilePhoto();
    if (previous) URL.revokeObjectURL(previous);
  }

  function feedback(message) {
    q('studentProfileFeedback').textContent = message;
  }

  function queuePhotoUpdate(change, message) {
    if (photoBusy) return;
    photoBusy = true;
    for (const id of ['chooseProfilePhoto','removeProfilePhoto','resetProfileStyle']) q(id).disabled = true;
    mediaQueue = mediaQueue.then(change).then(() => feedback(message))
      .catch(() => feedback('No se pudo guardar la foto en este navegador.'))
      .finally(() => {
        photoBusy = false;
        for (const id of ['chooseProfilePhoto','removeProfilePhoto','resetProfileStyle']) q(id).disabled = false;
      });
  }

  const backdrop = q('customizerBackdrop');
  const panel = q('customizerPanel');
  const closeButton = q('customizerClose');
  const sectionButtons = [...document.querySelectorAll('[data-student-section]')];
  const modalBackground = [q('app'),q('mobileDock')];
  let returnFocus = null;

  function selectSection(section) {
    const appearance = section === 'appearance';
    q('studentIdentitySettings').hidden = appearance;
    q('studentAppearanceSettings').hidden = !appearance;
    q('studentEditorTitle').textContent = appearance ? 'Apariencia' : 'Editar perfil';
    for (const button of sectionButtons) {
      button.setAttribute('aria-pressed',String(button.dataset.studentSection === (appearance ? 'appearance' : 'identity')));
    }
    panel.scrollTop = 0;
  }

  function openPanel(section, trigger) {
    returnFocus = trigger;
    selectSection(section);
    renderProfileText(true);
    syncProfilePhoto();
    if (!photoBusy) feedback('');
    backdrop.inert = false;
    backdrop.setAttribute('aria-hidden','false');
    backdrop.classList.add('open');
    document.body.classList.add('student-editor-open');
    closeButton.focus({preventScroll:true});
    for (const region of modalBackground) region.inert = true;
  }

  function closePanel() {
    if (!backdrop.classList.contains('open')) return;
    backdrop.classList.remove('open');
    document.body.classList.remove('student-editor-open');
    for (const region of modalBackground) region.inert = false;
    const target = returnFocus?.isConnected ? returnFocus : q('profileCard');
    target.focus({preventScroll:true});
    returnFocus = null;
    backdrop.setAttribute('aria-hidden','true');
    backdrop.inert = true;
  }

  window.RutaStudentProfile = {
    render(planName) {
      activePlan = String(planName || '').trim();
      renderProfileText();
      syncProfilePhoto();
    }
  };
  sectionButtons.forEach(button => button.addEventListener('click',()=>selectSection(button.dataset.studentSection)));
  document.addEventListener('click',e=>{
    const trigger = e.target.closest?.('[data-student-editor],[data-ra-open-palette]');
    if (trigger) openPanel(trigger.dataset.studentEditor || 'appearance', trigger);
  });
  closeButton.addEventListener('click',closePanel);
  backdrop.addEventListener('click',e=>{ if (e.target === backdrop) closePanel(); });
  document.addEventListener('keydown',e=>{
    if (!backdrop.classList.contains('open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closePanel();
    }
    if (e.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]),input:not([type="file"]):not([disabled]),select,textarea')]
      .filter(el=>!el.closest('[hidden]'));
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }, {capture:true});

  for (const [id,key,limit] of profileFields) {
    const input = q(id);
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input',()=>{
      profile[key] = input.value.slice(0,limit);
      feedback(saveProfile() ? 'Cambios guardados' : 'El navegador no pudo guardar los cambios.');
      renderProfileText();
    });
  }
  const photoInput = q('profilePhotoFile');
  q('chooseProfilePhoto').addEventListener('click',()=>photoInput.click());
  photoInput.addEventListener('change',()=>{
    const file = photoInput.files?.[0];
    photoInput.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      feedback('Selecciona una imagen PNG, JPG o WEBP.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      feedback('Selecciona una imagen de hasta 8 MB.');
      return;
    }
    queuePhotoUpdate(async()=>{
      await mediaPut(AVATAR_KEY,file);
      updateAvatar(file);
    },'Foto actualizada');
  });
  q('removeProfilePhoto').addEventListener('click',()=>queuePhotoUpdate(async()=>{
    await mediaDelete(AVATAR_KEY);
    updateAvatar(null);
  },'Foto eliminada'));
  q('resetProfileStyle').addEventListener('click',()=>{
    if (!confirm('¿Restablecer los datos personales y quitar la foto de este perfil?')) return;
    profile = {...DEFAULT_PROFILE};
    const stored = saveProfile();
    renderProfileText(true);
    queuePhotoUpdate(async()=>{
      if (avatarUrl) {
        await mediaDelete(AVATAR_KEY);
        updateAvatar(null);
      }
    }, stored ? 'Perfil restablecido' : 'El navegador no pudo guardar los datos.');
  });
  q('themeAccessible').addEventListener('change',e=>patchTheme({accessible:e.target.checked}));
  renderProfileText(true);
  mediaQueue = mediaGet(AVATAR_KEY).then(updateAvatar).catch(()=>syncProfilePhoto());
})();
