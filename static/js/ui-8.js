
(()=>{'use strict';
const KEY='rutaAcademica.appearance.v4';
const PAGE={light:'#f4f8f7',dark:'#111316'};
const D={
 light:{card:'#ffffff',sidebar:'#fbfdfd',accent:'#008c88',home:'#e1f2ef',homeCard:'#ffffff',progress:'#e9f5f2',progressBar:'#006e69',border:'#d8e5e4',text:'#152b2c'},
 dark:{card:'#1d2227',sidebar:'#161a1e',accent:'#58d5bf',home:'#162729',homeCard:'#242b30',progress:'#1e2b30',progressBar:'#60d6c1',border:'#39434d',text:'#edf2f5'}
};
const STANDARD_V6_DARK={card:'#21252a',sidebar:'#1a1d21',accent:'#68d3c0',home:'#1d2b2e',homeCard:'#282e33',progress:'#202b2e',progressBar:'#70d6c5',border:'#353e44',text:'#eef1f3'};
const STANDARD_V5={
 light:{card:'#ffffff',sidebar:'#ffffff',accent:'#0099a8',home:'#e0f4f2',homeCard:'#ffffff',progress:'#e5f4f4',progressBar:'#007885',border:'#dbe7e8',text:'#142b30'},
 dark:{card:'#252528',sidebar:'#202023',accent:'#54d7d2',home:'#1c3031',homeCard:'#2a2a2d',progress:'#1d3031',progressBar:'#54d7d2',border:'#3c3c41',text:'#f3f3f5'}
};
 const FORMER={
 light:{card:'#ffffff',sidebar:'#0099a8',accent:'#0099a8',home:'#def1ef',homeCard:'#ffffff',progress:'#d8eeee',progressBar:'#0099a8',border:'#c6d4dc',text:'#000000'},
 dark:{card:'#d0d8dc',sidebar:'#78adb0',accent:'#a1cfce',home:'#c0cdd0',homeCard:'#dbe3e5',progress:'#a8bec2',progressBar:'#225c65',border:'#889da6',text:'#000000'}
};
const PREVIOUS_DARK={card:'#dce4ed',sidebar:'#5ea7b2',accent:'#79c3cd',home:'#bacddd',homeCard:'#e3eaf1',progress:'#c1d4e0',progressBar:'#236a83',border:'#92a7bb',text:'#000000'};
const OLD_DARK={bg:'#111b28',card:'#d5e0e7',sidebar:'#0099a8',accent:'#31b4be',home:'#b6cfd0',homeCard:'#d5e0e7',progress:'#aac8cd',progressBar:'#007d88',border:'#8ca3b3',text:'#000000'};
const valid=v=>/^#[0-9a-f]{6}$/i.test(String(v||''));
let prefs={mode:'light',profiles:{light:{...D.light},dark:{...D.dark}}};
try{
 const current=JSON.parse(localStorage.getItem(KEY)||'null'),previous=JSON.parse(localStorage.getItem('rutaAcademica.appearance.v3')||'null'),legacy=JSON.parse(localStorage.getItem('rutaAcademica.appearance.v2')||'null'),saved=current||previous||legacy;
 const darkDefaults=current?FORMER.dark:previous?PREVIOUS_DARK:OLD_DARK;
 if(saved){
   prefs.mode=saved.mode==='dark'?'dark':'light';
   for(const mode of ['light','dark']){
     const old=saved.version===6 && mode==='dark'
       ? STANDARD_V6_DARK
       : saved.version===5 ? STANDARD_V5[mode] : mode==='dark' ? darkDefaults : FORMER.light;
     for(const k of Object.keys(D[mode])){
       const value=saved.profiles?.[mode]?.[k];
       if(valid(value)&&(saved.version>=7||(saved.version===6 && mode==='light')||value.toLowerCase()!==old[k]))prefs.profiles[mode][k]=value;
     }
   }
 } else {
   const old=JSON.parse(localStorage.getItem('rutaAcademica.palette.v1')||'null');
   if(old){prefs.mode=old.dark?'dark':'light';for(const k of ['card','border'])if(valid(old[k])&&old[k].toLowerCase()!==FORMER.light[k])prefs.profiles.light[k]=old[k];}
 }
}catch{}
const root=document.documentElement,body=document.body;
const controls={raColorCard:'card',raColorSidebar:'sidebar',raColorAccent:'accent',raColorHome:'home',raColorHomeCard:'homeCard',raColorProgress:'progress',raColorProgressBar:'progressBar',raColorBorder:'border',raColorText:'text'};
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const hex=a=>'#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>hex(rgb(a).map((v,i)=>v*(1-t)+rgb(b)[i]*t));
const luminance=h=>rgb(h).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
function readable(bg,text,ratio=5){if(contrast(bg,text)>=ratio)return bg;const end=luminance(text)<.35?'#ffffff':'#000000';for(let t=.02;t<=1.01;t+=.02){const c=mix(bg,end,Math.min(1,t));if(contrast(c,text)>=ratio)return c}return end}
function save(){try{localStorage.setItem(KEY,JSON.stringify({...prefs,version:7}))}catch{}}
// Limit surface brightness while retaining the hue of a saved dark palette.
function darkSurface(value, ceiling = .085) {
 if (luminance(value) <= ceiling) return value;
 let low = 0, high = 1;
 for (let i = 0; i < 10; i++) {
   const middle = (low + high) / 2;
   if (luminance(mix('#000000', value, middle)) > ceiling) high = middle;
   else low = middle;
 }
 return mix('#000000', value, low);
}

function apply(sync=true){
 const mode=prefs.mode, darkMode=mode==='dark', p=prefs.profiles[mode];
 const text=darkMode && luminance(p.text)<.52 ? readable(p.text,'#202023',7) : p.text;
 const surface=(value, ratio=7)=>readable(darkMode ? darkSurface(value) : value,text,ratio);
 const card=surface(p.card), sidebar=surface(p.sidebar), accent=surface(p.accent,5);
 const page=surface(PAGE[mode]), soft=surface(mix(card,p.accent,darkMode?.07:.045));
 const progress=surface(p.progress), home=surface(p.home), homeCard=surface(p.homeCard);
 const border=darkMode ? darkSurface(p.border,.135) : p.border;
 const solid=darkMode ? darkSurface(p.progressBar,.39) : p.progressBar;
 const progressBar=darkMode ? readable(p.progressBar,card,3) : p.progressBar;
 const onSolid=contrast(solid,'#ffffff')>=4.5?'#ffffff':darkMode?'#000000':'#111416';
 const muted=readable(mix(text,card,darkMode?.29:.27),card,4.5);
 const accentInk=readable(p.accent,card,4.7);
 const values={
 '--ra-page':page,'--ra-card':card,'--ra-text':text,'--ra-sidebar':sidebar,'--ra-sidebar-card':surface(mix(sidebar,p.accent,.045)),'--ra-side-active':surface(mix(sidebar,p.accent,darkMode?.17:.12),5),'--ra-accent':accent,'--ra-accent-raw':p.accent,
 '--route-muted':muted,'--route-highlight':accentInk,'--route-solid':solid,'--route-on-solid':onSolid,
 '--route-raised':surface(mix(card,text,darkMode?.065:.12)),'--route-control':surface(mix(card,page,darkMode?.46:.53)),
 '--route-selected':surface(mix(card,p.accent,darkMode?.17:.095),5),
 '--route-ring':readable(progressBar,homeCard,3),
 '--route-status-approved':readable(mode==='dark'?'#83e4b6':'#216945',card,4.7),
 '--route-status-available':accentInk,'--route-status-blocked':readable(mode==='dark'?'#c2c3ce':'#56616e',card,4.7),
 '--ra-home':home,'--ra-home-card':homeCard,'--ra-home-detail':surface(mix(darkMode?homeCard:p.homeCard,p.accent,.08)),'--ra-progress':progress,'--ra-progress-bar':progressBar,'--ra-border':border,'--ra-soft':soft,'--ra-track':darkMode?surface(mix(card,border,.65)):mix(card,border,.65),'--ra-workspace':surface(mix(page,card,darkMode?.88:.78)),'--ra-map-paper':surface(mix(page,card,.95)),'--ra-map-link':readable(progressBar,card,3),
 '--ra-chip-first':surface(mix(card,p.accent,darkMode?.23:.36)),'--ra-chip-pending':surface(mix(card,p.accent,.12)),'--ra-approved':surface(mix(card,p.accent,.22)),'--ra-alert':surface(mix(card,'#f4c5ba',darkMode?.17:.55)),'--ra-warning':surface(mix(card,'#f8df9e',darkMode?.17:.55)),
 '--ink':text,'--ink-2':text,'--muted':text,'--line':border,'--bg':page,'--white':card,'--card-bg':card,'--sidebar-bg':sidebar,'--sidebar-text':text,'--topbar-bg':card,'--btn-primary':accent,'--on-btn-primary':text,
 '--status-taken':soft,'--on-status-taken':text,'--status-available':card,'--status-blocked':soft,'--table-head':soft,'--on-table-head':text,'--fab-color':accent,'--profile-accent':accent
 };
 for(const k of ['950','900','800','700','600','500','300'])values['--navy-'+k]=accent;
 for(const k of ['200','100','50'])values['--navy-'+k]=soft;
 Object.entries(values).forEach(([k,v])=>root.style.setProperty(k,v));
 body.classList.remove('ra-palette-active','ra-user-dark','ra-dark','dark-theme-active','auto-dark-theme');
 body.classList.add('ra-theme-v2');body.dataset.raMode=mode;root.dataset.raMode=mode;root.style.colorScheme=mode;
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=sidebar;
 const reset=document.getElementById('raPaletteReset');
 if(reset)reset.textContent=darkMode?'Aplicar paleta grafito':'Aplicar paleta clara';
 if(sync)Object.entries(controls).forEach(([id,k])=>{const e=document.getElementById(id);if(e)e.value=p[k]});
 document.querySelectorAll('[data-ra-value]').forEach(e=>e.textContent=p[e.dataset.raValue].toUpperCase());
 document.querySelectorAll('[data-ra-edit-mode]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.raEditMode===prefs.mode)));
 const label=document.getElementById('raPaletteModeLabel');if(label)label.textContent='Editando los colores del modo '+(darkMode?'oscuro':'claro');
 const dark=document.getElementById('raUserDarkMode');if(dark)dark.checked=mode==='dark';
 const toggle=document.getElementById('routeThemeToggle');
 toggle.setAttribute('aria-pressed',String(darkMode));
 toggle.title=mode==='dark'?'Cambiar a modo claro':'Cambiar a modo oscuro';
 document.dispatchEvent(new CustomEvent('ra:palette-changed',{detail:{mode:prefs.mode}}));
}
Object.entries(controls).forEach(([id,k])=>document.getElementById(id)?.addEventListener('input',e=>{if(valid(e.target.value)){prefs.profiles[prefs.mode][k]=e.target.value.toLowerCase();apply(false);save()}}));
function setMode(mode){prefs.mode=mode==='dark'?'dark':'light';apply();save()}
document.querySelectorAll('[data-ra-edit-mode]').forEach(e=>e.addEventListener('click',()=>setMode(e.dataset.raEditMode)));
document.getElementById('raUserDarkMode')?.addEventListener('change',e=>setMode(e.target.checked?'dark':'light'));
document.getElementById('routeThemeToggle').addEventListener('click',()=>setMode(prefs.mode==='dark'?'light':'dark'));
document.getElementById('raPaletteReset')?.addEventListener('click',()=>{prefs.profiles[prefs.mode]={...D[prefs.mode]};apply();save()});
document.getElementById('raPaletteBlack')?.addEventListener('click',()=>{prefs.profiles[prefs.mode].text=D[prefs.mode].text;apply();save()});
document.addEventListener('ra:palette-reapply',()=>apply());
window.RutaPalette={get:()=>JSON.parse(JSON.stringify(prefs)),setMode,apply};
apply();save();
})();
