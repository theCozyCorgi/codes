const StatsModule = (function () {

  const noAdd = ["Black Wave", "Wolfsbane", "Asphodel", "Belladonna", "Gillyweed", "The Familiars"];

  const forums = {
    "escocia": "/f15-escocia",
    "hogwarts": "/f19-hogwarts",
    "hogsmeade": "/f22-hogsmeade",
    "gales": "/f31-gales",
    "reserva natural de flint": "/f32-reserva-natural-de-flint",
    "inglaterra": "/f14-inglaterra",
    "callejón diagon": "/f21-callejon-diagon",
    "ministerio de magia": "/f20-ministerio-de-magia",
    "museo de mirabilia": "/f39-museo-de-mirabilia",
    "valle de godric": "/f24-valle-de-godric",
    "irlanda": "/f16-irlanda",
    "san mungo": "/f23-san-mungo",
    "irlanda del norte": "/f17-irlanda-del-norte",
    "biblioteca hollowshade castle": "/f33-biblioteca-hollowshade-castle",
    "resto del mundo": "/f18-resto-del-mundo",
    "el pensadero": "/f7-el-pensadero",
    "club de duelos": "/f37-club-de-duelos",
    "prácticas del sistema": "/f35-practicas-del-sistema",
  };

  let stats = {
    dices: []
  };

  function getTextAfterBracket(text) {
    const match = text.match(/\]\s*(.*)/);
    return match ? match[1] : text;
  }

  function ajaxPromise(url) {
    console.log("Entrando en ajaxPromise");
    return new Promise((resolve, reject) => {
      $.ajax({
        url,
        success: data => resolve(data),
        error: err => reject(err)
      });
    });
  }

  async function processPageByType(type, url, pendingTopics = 0, simpleTitle = '', replies = '') {
    console.log("Entrando en processPageByType",type,':',url);
    const data = await ajaxPromise(url);
    const $data = $(data);
    const nextPageLink = $data.find('.pagination .sprite-arrow_prosilver_right').parent('a').attr('href');

    if (type === 'topics') {
      const topics = $data.find('.topics .topic');
      let localPendingTopics = topics.length;

      for (let topic of topics) {
        const link = $(topic).find('a.topictitle').attr('href');
        simpleTitle = $(topic).find('a.topictitle').text().toLowerCase();
        const title = getTextAfterBracket($(topic).find('a.topictitle').text()).toLowerCase();
        const location = $(topic).find('.topic-location a').text().toLowerCase();
        replies = parseInt($(topic).find('.topic-replies').text().split(' ')[0]);
        let state = 'abierto';

        if (location === 'el pensadero') state = 'cerrado';
        if (location === 'temas inactivos') state = 'inactivo';

        if (simpleTitle.includes('[')) {
          await processPageByType('posts', link, localPendingTopics, simpleTitle, replies);
        } else {
          localPendingTopics--;
        }
      }

      if (nextPageLink) {
        await processPageByType(type, nextPageLink);
      }
    }

    if (type === 'posts') {
      const titlesArray = [];
      const posters = $data.find('.poster-list .poster:not(poster-more)');

      if ($data.find('.poster-more').length > 0) {
        titlesArray.push('Grupal');
      } else {
        $(posters).each(function () {
          const postUser = $(this).attr('title');
          if (postUser) titlesArray.push(postUser);
        });
      }

      const party = titlesArray.filter(poster => !noAdd.includes(poster));

      let state = 'abierto';
      if ((party.length === 0) && (replies > 0)) {
        state = 'abandonado';
        party.push('invitado');
      }
      if ((party.length === 0) && (replies === 0)) {
        party.push('pendiente');
      }

      const match = simpleTitle.match(/^\s*\[(\d{4}\/\d{2}\/\d{2})\]/);
      const date = normalizeDate(match?.[1] || $data.find('fecha').first().text());

      const [dia, mes, anio] = date.split('/');
      const keyDate = `${anio}/${mes}/${dia}`;

      const roles = $data.find('.post-content div');
      for (let rol of roles) {
        if ($(rol).text().includes('ha efectuado la acción siguiente')) {
          const res = $(rol).find('strong').map(function () { return $(this).text().trim(); }).get();
          const pitcher = res[0];
          res.shift(); // quito el lanzador
          res.shift(); // quito el texto de lanzada

          const inters = res.map(str => parseInt(str, 10));
          const obj = { pitcher, spread: inters };
          stats.dices.push(obj);
        }
      }

      pendingTopics--;
    }

    if (nextPageLink && type === 'posts') {
      await processPageByType('posts', nextPageLink, pendingTopics, simpleTitle, replies);
    }

    return stats;
  }

  async function readTopicsByForum(forum) {
    console.log("Entrnado a readTopicsByForum");
    const url = forums[forum];
    if (!url) return {};
    return await processPageByType('topics', url);
  }

  function completeDiceStats($box, diceResults) {
    console.log(diceResults);
    const prom = diceResults.reduce((acc, num) => acc + num, 0) / diceResults.length;
    const blunder = diceResults.filter(num => num === 1).length;
    const critical = diceResults.filter(num => num === 20).length;
    const success = diceResults.filter(num => num > 10).length;
    const perSuccess = (success / diceResults.length) * 100;

    $box.append('<span class="title-metrics">Resultado de los dados</span>');
    $box.append('<div class="character-metrics dice-metrics"><count>' + diceResults.length +
      '</count><prom>' + prom.toFixed(2) +
      '%</prom><blunder>' + blunder +
      '</blunder><critical>' + critical +
      '</critical><perSuccess>' + perSuccess.toFixed(2) +
      '%</perSuccess></div>');
  }

  function normalizeDate(fechaTexto) {
    const meses = {
      enero: '01', ene: '01',
      febrero: '02', feb: '01',
      marzo: '03', mar: '03',
      abril: '04', abr: '04',
      mayo: '05', may: '05',
      junio: '06', jun: '06',
      julio: '07', jul: '07',
      agosto: '08', ago: '08',
      septiembre: '09', sep: '09',
      octubre: '10', oct: '10',
      noviembre: '11', nov: '11',
      diciembre: '12', dic: '12'
    };
  
    const texto = fechaTexto.toLowerCase().replace(/,/g, '').trim();
    let dia, mes, anio = '1952';
  
    // Formato: 3 de Octubre
    let match = texto.match(/^(\d{1,2})\s+de\s+([a-z]+)$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2]];
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: 1952/09/07 → aaaa/mm/dd
    match = texto.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (match) {
      anio = match[1];
      mes = match[2].padStart(2, '0');
      dia = match[3].padStart(2, '0');
      return `${dia}/${mes}/${anio}`;
    }
  
    // Formato: Octubre 3
    match = texto.match(/^([a-z]+)\s+(\d{1,2})$/i);
    if (match) {
      mes = meses[match[1]];
      dia = match[2].padStart(2, '0');
      return `${dia}/${mes}/${anio}`;
    }
  
    // Formato: Oct 3
    match = texto.match(/^([a-z]{3})\s+(\d{1,2})$/i);
    if (match) {
      mes = meses[match[1]];
      dia = match[2].padStart(2, '0');
      return `${dia}/${mes}/${anio}`;
    }
  
    // Formato: 3.octubre.1952
    match = texto.match(/^(\d{1,2})\.([a-z]+)\.(\d{4})$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2]];
      anio = match[3];
      return `${dia}/${mes}/${anio}`;
    }
  
    // Formato: 3/10/1952 o 03/10/52
    match = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = match[2].padStart(2, '0');
      anio = match[3].length === 2 ? `19${match[3]}` : match[3];
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: 20 de Septiembre 1952
    match = texto.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+(\d{4})$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2]];
      anio = match[3];
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: Octubre, 1952 → 01/10/1952
    match = texto.match(/^([a-z]+),?\s+(\d{4})$/i);
    if (match) {
      dia = '01';
      mes = meses[match[1]];
      anio = match[2];
      return `${dia}/${mes}/${anio}`;
    }
  
    // Formato: 5 Septiembre 1952
    match = texto.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2]];
      anio = match[3];
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: 20 de septiembre de 1952
    match = texto.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2]];
      anio = match[3];
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: 03.09.52
    match = texto.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = match[2].padStart(2, '0');
      anio = `19${match[3]}`;
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: 20/09 (sin año, se asume 1952)
    match = texto.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = match[2].padStart(2, '0');
      anio = '1952';
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: Jue 19 Jun 2025
    match = texto.match(/^\w{3}\s+(\d{1,2})\s+([a-z]{3})\s+(\d{4})$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2]]; // ejemplo: "Jun" → "06"
      anio = match[3];
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: Hoy a las hh:mm
    if (texto.startsWith('hoy')) {
      const today = new Date();
      dia = String(today.getDate()).padStart(2, '0');
      mes = String(today.getMonth() + 1).padStart(2, '0');
      anio = today.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: Ayer a las hh:mm
    if (texto.startsWith('ayer')) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dia = String(yesterday.getDate()).padStart(2, '0');
      mes = String(yesterday.getMonth() + 1).padStart(2, '0');
      anio = yesterday.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
    
    // Formato: Lun 16 Jun 2025, 14:10
    match = texto.match(/^\w{3}\s+(\d{1,2})\s+([a-z]{3})\s+(\d{4})(?:,\s*\d{1,2}:\d{2})?$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2].toLowerCase()];
      anio = match[3];
      if (dia && mes && anio) {
        return `${dia}/${mes}/${anio}`;
      }
    }
    
    // Formato: mar 01 jul 2025 04:28
    match = texto.match(/^\w{3}\s+(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+\d{1,2}:\d{2}$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2].toLowerCase()];
      anio = match[3];
      if (dia && mes && anio) {
        return `${dia}/${mes}/${anio}`;
      }
    }
    
    // Formato: Dom 25 Mayo 2025, 13:06
    match = texto.match(/^\w{3}\s+(\d{1,2})\s+([a-záéíóúñ]+)\s+(\d{4})(?:,\s*\d{1,2}:\d{2})?$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2].toLowerCase()];
      anio = match[3];
      if (dia && mes && anio) {
        return `${dia}/${mes}/${anio}`;
      }
    }
    
    // Formato: Miér 04 Jun 2025, 22:14 (día con tilde y coma opcional)
    match = texto.match(/^[a-záéí]{3,}\s+(\d{2})\s+([a-záéí]{3})\s+(\d{4}),\s*(\d{2}):(\d{2})$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2].toLowerCase()];
      anio = match[3];
      if (dia && mes && anio) {
        return `${dia}/${mes}/${anio}`;
      }
    }
    
    // Formato: Sábado 26 Julio 1952
    match = texto.match(/^[a-záéíóúñ]+[\s,]+(\d{1,2})[\s,]+([a-záéíóúñ]+)[\s,]+(\d{4})$/i);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = meses[match[2].toLowerCase()];
      anio = match[3];
      if (dia && mes && anio) {
        return `${dia}/${mes}/${anio}`;
      }
    }
    
    // Formato: septiembre 3, 1952
    match = texto.match(/^([a-záéíóúñ]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (match) {
      mes = meses[match[1].toLowerCase()];
      dia = match[2].padStart(2, '0');
      anio = match[3];
      if (dia && mes && anio) {
        return `${dia}/${mes}/${anio}`;
      }
    }
    
    // Formato: 9/7/2025, 22:15
    match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{2}):(\d{2})$/);
    if (match) {
      dia = match[1].padStart(2, '0');
      mes = match[2].padStart(2, '0');
      anio = match[3];
      const hora = match[4];
      const minutos = match[5];
      return `${dia}/${mes}/${anio} ${hora}:${minutos}`;
    }
  }

  return {
    readTopicsByForum,
    completeDiceStats
  };
})();

$(document).ready(async function () {
  $('.character-stats').each(async function () {
    console.log('Completando stats');
    const $box = $(this);
    const $dice = $box.find('.dice-stats');
    const $rol = $box.find('.rol-stats');

    const userID = ($box.closest('.viewtopic-replies').find('.poster-name a').attr('href') || null);
    const userName = ($box.closest('.viewtopic-replies').find('.poster-name a').text() || '');

    const familiars = "/spa/u6";
    const diceResults = [];

    const completed = await StatsModule.readTopicsByForum('el pensadero');
    console.log('Stats completadas:', completed);
  });
});
