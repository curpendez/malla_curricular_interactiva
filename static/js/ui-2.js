
(function(){
  window.addEventListener('error',function(){
    var n=document.querySelector('.compat-device-note');
    if(n && !document.documentElement.classList.contains('app-ready')){
      n.innerHTML='<b>No se pudo iniciar la aplicación en este visor</b>Abre este archivo en Safari, Chrome, Edge o Firefox. En iPhone, Vista rápida puede mostrar el HTML sin ejecutar la aplicación.';
    }
  });
})();
