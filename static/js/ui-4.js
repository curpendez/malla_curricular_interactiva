
/* Planes de ejemplo (formato: "CÓDIGO|Nombre|Créditos|REQ1,REQ2") — uno por semestre */
window.DEMO_PLANS = [
  {
    name: 'Ingeniería en Sistemas',
    semesters: [
      ['MM-110|Matemática I|5|', 'IN-101|Inglés I|4|', 'EG-011|Español General|4|', 'IS-110|Introducción a la Ingeniería en Sistemas|3|', 'SC-101|Sociología|4|'],
      ['MM-111|Geometría y Trigonometría|5|MM-110', 'MM-201|Cálculo I|5|MM-110', 'IN-102|Inglés II|4|IN-101', 'IS-210|Programación I|4|IS-110', 'FF-101|Filosofía|4|'],
      ['MM-202|Cálculo II|5|MM-201', 'MM-211|Vectores y Matrices|3|MM-111', 'FS-100|Física General I|5|MM-201', 'IS-310|Programación II|4|IS-210', 'IN-103|Inglés III|4|IN-102'],
      ['MM-411|Ecuaciones Diferenciales|3|MM-202', 'MM-314|Matemática Discreta|4|MM-211', 'FS-200|Física General II|5|FS-100,MM-202', 'IS-410|Estructuras de Datos|4|IS-310', 'MM-401|Estadística I|4|MM-202'],
      ['IS-412|Bases de Datos I|4|IS-410', 'IS-411|Electrónica para Sistemas|4|FS-200', 'MM-402|Estadística II|4|MM-401', 'IS-501|Lenguajes de Programación|4|IS-410,MM-314', 'CC-201|Contabilidad General|4|'],
      ['IS-511|Bases de Datos II|4|IS-412', 'IS-512|Arquitectura de Computadoras|4|IS-411', 'IS-513|Análisis y Diseño de Sistemas|4|IS-412', 'IO-301|Investigación de Operaciones I|4|MM-402,MM-211', 'IS-514|Programación Orientada a Objetos|4|IS-501'],
      ['IS-601|Sistemas Operativos I|4|IS-512', 'IS-602|Ingeniería de Software|4|IS-513', 'IS-603|Redes de Datos I|4|IS-512', 'IO-302|Investigación de Operaciones II|4|IO-301', 'AE-101|Administración I|4|'],
      ['IS-701|Sistemas Operativos II|4|IS-601', 'IS-702|Redes de Datos II|4|IS-603', 'IS-703|Programación Web|4|IS-511,IS-514', 'IS-704|Inteligencia Artificial|4|IS-501,MM-402', 'EC-101|Economía General|4|'],
      ['IS-801|Seguridad Informática|4|IS-702', 'IS-802|Gestión de Proyectos|4|IS-602,AE-101', 'IS-803|Sistemas Expertos|4|IS-704', 'IS-804|Auditoría Informática|4|IS-602'],
      ['IS-901|Seminario de Investigación|4|IS-802', 'IS-902|Práctica Profesional|6|IS-801,IS-802', 'IS-903|Ética Profesional|3|FF-101', 'IS-904|Teoría de Sistemas|4|IS-602']
    ]
  },
  {
    name: 'Ingeniería Industrial',
    semesters: [
      ['MM-110|Matemática I|5|', 'IN-101|Inglés I|4|', 'EG-011|Español General|4|', 'II-110|Introducción a la Ingeniería Industrial|3|', 'SC-101|Sociología|4|'],
      ['MM-111|Geometría y Trigonometría|5|MM-110', 'MM-201|Cálculo I|5|MM-110', 'IN-102|Inglés II|4|IN-101', 'QQ-103|Química General I|5|', 'FF-101|Filosofía|4|'],
      ['MM-202|Cálculo II|5|MM-201', 'MM-211|Vectores y Matrices|3|MM-111', 'FS-100|Física General I|5|MM-201', 'II-210|Dibujo Técnico|3|', 'IN-103|Inglés III|4|IN-102'],
      ['MM-411|Ecuaciones Diferenciales|3|MM-202', 'FS-200|Física General II|5|FS-100,MM-202', 'MM-401|Estadística I|4|MM-202', 'II-310|Procesos de Manufactura|4|II-210,QQ-103', 'IS-210|Programación I|4|MM-110'],
      ['MM-402|Estadística II|4|MM-401', 'II-410|Ingeniería de Métodos|4|II-310', 'IM-210|Mecánica Estática|4|FS-100,MM-211', 'CC-201|Contabilidad General|4|', 'II-411|Termodinámica|4|FS-200'],
      ['IO-301|Investigación de Operaciones I|4|MM-402,MM-211', 'II-510|Control de Calidad|4|MM-402', 'II-511|Ergonomía|3|II-410', 'AE-101|Administración I|4|', 'II-512|Costos Industriales|4|CC-201'],
      ['IO-302|Investigación de Operaciones II|4|IO-301', 'II-610|Planeación y Control de la Producción|4|IO-301,II-410', 'II-611|Seguridad Industrial|3|II-511', 'EC-101|Economía General|4|', 'II-612|Ingeniería Económica|4|II-512'],
      ['II-710|Simulación de Sistemas|4|IO-302,IS-210', 'II-711|Logística y Cadena de Suministro|4|II-610', 'II-712|Gestión de Mantenimiento|4|II-610', 'II-713|Diseño de Plantas|4|II-610'],
      ['II-810|Formulación de Proyectos|4|II-612', 'II-811|Sistemas de Gestión de Calidad|4|II-510', 'IS-802|Gestión de Proyectos|4|II-612,AE-101', 'II-812|Recursos Humanos|3|AE-101'],
      ['II-910|Seminario de Investigación|4|II-810', 'II-911|Práctica Profesional|6|II-810,II-811', 'IS-903|Ética Profesional|3|FF-101', 'II-912|Manufactura Esbelta|4|II-711']
    ]
  }
];

