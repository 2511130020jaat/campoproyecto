let noticiasTodas = [];
let noticiasInternacionales = [];
let noticiasNacionales = [];
let noticiasAgronomo = [];
let noticiasTecnologico = [];
let noticiasCarrusel = [];

let filtroNacionalActual = "TODAS";
let tabSidebarActual = "AGRONOMO";
let indiceSlide = 0;
let rotacionEdicion = 0;
let intervaloCarrusel = null;
let intervaloReloj = null;

const IMAGEN_RESPALDO_AGRO =
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80";

document.addEventListener("DOMContentLoaded", () => {
  actualizarBarraBienvenidaFecha();
  intervaloReloj = setInterval(actualizarBarraBienvenidaFecha, 1000);
  cargarNoticiasAgro(false);

  const observer = new MutationObserver(() => {
    renderizarColumnaInternacional();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
});

function esModoClaroActivo() {
  if (
    document.documentElement.classList.contains("dark") ||
    document.body.classList.contains("dark") ||
    document.documentElement.dataset.theme === "dark" ||
    document.body.dataset.theme === "dark"
  ) {
    return false;
  }
  if (
    document.documentElement.classList.contains("light") ||
    document.body.classList.contains("light") ||
    document.documentElement.dataset.theme === "light" ||
    document.body.dataset.theme === "light"
  ) {
    return true;
  }
  const bg = window.getComputedStyle(document.body).backgroundColor || "";
  const match = bg.match(/\d+/g);
  if (match && match.length >= 3) {
    const r = parseInt(match[0], 10);
    const g = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    return (r + g + b) / 3 > 160;
  }
  return true;
}

// =========================================================================
// 1. FILA SUPERIOR: BIENVENIDO NOMBRE - FECHA (SIN HORA AQUÍ)
// =========================================================================

function obtenerNombreUsuarioActual() {
  if (typeof usuarioSesion !== "undefined" && usuarioSesion) {
    const raw =
      usuarioSesion.nombre ||
      usuarioSesion.usuario ||
      usuarioSesion.correo ||
      "USUARIO";
    return String(raw).trim().toUpperCase();
  }
  return "USUARIO";
}

function obtenerHoraFormateadaActual() {
  const ahora = new Date();
  const horas = String(ahora.getHours()).padStart(2, "0");
  const minutos = String(ahora.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

function actualizarBarraBienvenidaFecha() {
  const el = document.getElementById("barraBienvenidaFechaHora");
  if (!el) return;

  const nombreUsuario = obtenerNombreUsuarioActual();
  const ahora = new Date();
  const dia = ahora.getDate();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();

  el.textContent = `BIENVENIDO ${nombreUsuario} - fecha (${dia}/${mes}/${anio})`;
}

// =========================================================================
// 2. UTILIDADES, CLASIFICACIÓN Y CATÁLOGO LOCAL SIN DEPENDENCIA EXTERNA
// =========================================================================

function sanitizarTextoNoticia(texto, fuente) {
  const limpio = (texto || "")
    .replace(/<[^>]*>?/g, " ")
    .replace(/href\s*=\s*["'][^"']*["']?/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (limpio.length < 20) {
    return (
      "Actualización de " +
      (fuente || "ASIR") +
      " sobre producción agrícola, clima y gestión del sector."
    );
  }
  return limpio;
}

function formatearFechaCorta(fechaStr) {
  if (!fechaStr) {
    const hoy = new Date();
    const meses = [
      "ENE",
      "FEB",
      "MAR",
      "ABR",
      "MAY",
      "JUN",
      "JUL",
      "AGO",
      "SEP",
      "OCT",
      "NOV",
      "DIC",
    ];
    return {
      dia: String(hoy.getDate()),
      mes: meses[hoy.getMonth()],
      completa: hoy.toISOString().split("T")[0],
    };
  }
  const partes = String(fechaStr).split("-");
  if (partes.length === 3) {
    const meses = [
      "ENE",
      "FEB",
      "MAR",
      "ABR",
      "MAY",
      "JUN",
      "JUL",
      "AGO",
      "SEP",
      "OCT",
      "NOV",
      "DIC",
    ];
    const mesIdx = Math.max(0, Math.min(11, parseInt(partes[1], 10) - 1));
    return {
      dia: String(parseInt(partes[2], 10) || partes[2]),
      mes: meses[mesIdx] || "AGRO",
      completa: fechaStr,
    };
  }
  return { dia: "26", mes: "NOV", completa: fechaStr };
}

function clasificarNoticia(n) {
  const bloque = String(n.bloque || "").toUpperCase();
  if (
    [
      "INTERNACIONAL",
      "NACIONAL_MEDIOS",
      "NACIONAL_BOLETIN",
      "AGRONOMO",
      "TECNOLOGICO",
    ].includes(bloque)
  ) {
    return bloque;
  }

  const texto =
    `${n.fuente || ""} ${n.categoria || ""} ${n.titulo || ""} ${n.resumen || ""}`.toLowerCase();

  if (
    texto.includes("internacional") ||
    texto.includes("global") ||
    texto.includes("latinoamérica") ||
    texto.includes("exportación") ||
    texto.includes("fao") ||
    texto.includes("mundo")
  ) {
    return "INTERNACIONAL";
  }

  if (
    texto.includes("tecnología") ||
    texto.includes("sensor") ||
    texto.includes("satélite") ||
    texto.includes("iot") ||
    texto.includes("telemetría") ||
    texto.includes("dron") ||
    texto.includes("automatización")
  ) {
    return "TECNOLOGICO";
  }

  if (
    texto.includes("ana") ||
    texto.includes("midagri") ||
    texto.includes("inia") ||
    texto.includes("enfen") ||
    texto.includes("boletín")
  ) {
    return "NACIONAL_BOLETIN";
  }

  if (
    texto.includes("rpp") ||
    texto.includes("américa") ||
    texto.includes("latina") ||
    texto.includes("perú") ||
    texto.includes("peru")
  ) {
    return "NACIONAL_MEDIOS";
  }

  return "AGRONOMO";
}

function obtenerCatalogoNoticiasBase() {
  const hoy = new Date().toISOString().split("T")[0];

  return [
    // ── INTERNACIONAL (3 tarjetas alineadas al ras con el carrusel) ──
    {
      titulo:
        "Riego por goteo y reservas hídricas ganan peso en el agro regional",
      resumen:
        "Países vecinos amplían sistemas de conducción eficiente para sostener cultivos clave.",
      fuente: "Panorama Global",
      categoria: "Internacional",
      bloque: "INTERNACIONAL",
      fecha: hoy,
      enlace: "https://www.fao.org/americas",
      imagen:
        "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=900&q=80",
    },
    {
      titulo:
        "Demanda internacional impulsa estándares de calidad y trazabilidad",
      resumen:
        "Mercados externos priorizan inocuidad, manejo responsable y entregas puntuales.",
      fuente: "Comercio Agro",
      categoria: "Internacional",
      bloque: "INTERNACIONAL",
      fecha: hoy,
      enlace: "https://www.fao.org",
      imagen:
        "https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=900&q=80",
    },
    {
      titulo:
        "Conservación de suelos y pronósticos estacionales en valles agrícolas",
      resumen:
        "Programas internacionales combinan cobertura vegetal y alertas climáticas tempranas.",
      fuente: "Crónica Mundial",
      categoria: "Internacional",
      bloque: "INTERNACIONAL",
      fecha: hoy,
      enlace: "https://www.unep.org",
      imagen:
        "https://images.unsplash.com/photo-1500937359365-8b59a04b87b6?auto=format&fit=crop&w=900&q=80",
    },

    // ── NACIONAL: MEDIOS PERÚ Y BOLETINES OFICIALES ──
    {
      titulo:
        "RPP: Productores de la costa y sierra evalúan turnos de riego y caudales de campaña",
      resumen:
        "Juntas de usuarios y especialistas siguen el nivel de ríos y reservorios en los principales valles del país.",
      fuente: "RPP Noticias",
      categoria: "Perú",
      bloque: "NACIONAL_MEDIOS",
      fecha: hoy,
      enlace: "https://rpp.pe",
      imagen:
        "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1000&q=80",
    },
    {
      titulo:
        "ENFEN difunde informe sobre condiciones oceanográficas y climáticas en el litoral",
      resumen:
        "Reporte técnico con seguimiento de temperatura superficial del mar y pautas preventivas para el agro peruano.",
      fuente: "ENFEN Perú",
      categoria: "Boletín Oficial",
      bloque: "NACIONAL_BOLETIN",
      fecha: hoy,
      enlace: "https://www.gob.pe/enfen",
      imagen:
        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80",
    },
    {
      titulo:
        "América Noticias: Abastecimiento en mercados mayoristas y cosechas regionales",
      resumen:
        "Seguimiento del ingreso de frutas, hortalizas y productos de panllevar desde zonas productoras hacia Lima y provincias.",
      fuente: "América Noticias",
      categoria: "Perú",
      bloque: "NACIONAL_MEDIOS",
      fecha: hoy,
      enlace: "https://www.americatv.com.pe/noticias",
      imagen:
        "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1000&q=80",
    },
    {
      titulo:
        "MIDAGRI e INIA promueven semillas certificadas y asistencia técnica en campo",
      resumen:
        "Iniciativas orientadas a elevar rendimientos, mejorar la sanidad de cultivos y fortalecer la agricultura familiar.",
      fuente: "MIDAGRI / INIA",
      categoria: "Boletín Oficial",
      bloque: "NACIONAL_BOLETIN",
      fecha: hoy,
      enlace: "https://www.gob.pe/midagri",
      imagen:
        "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1000&q=80",
    },
    {
      titulo:
        "Latina Noticias: Impacto del clima y rutas de transporte en la producción agrícola",
      resumen:
        "Cobertura sobre condiciones en carreteras, valles productivos y medidas para evitar mermas durante la campaña.",
      fuente: "Latina Noticias",
      categoria: "Perú",
      bloque: "NACIONAL_MEDIOS",
      fecha: hoy,
      enlace: "https://www.latina.pe/noticias",
      imagen:
        "https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=1000&q=80",
    },
    {
      titulo:
        "ANA impulsa uso eficiente del agua y mantenimiento de canales en cuencas agrarias",
      resumen:
        "Lineamientos para optimizar la distribución del recurso hídrico, medir caudales y coordinar el riego en el sector.",
      fuente: "ANA Perú",
      categoria: "Boletín Oficial",
      bloque: "NACIONAL_BOLETIN",
      fecha: hoy,
      enlace: "https://www.gob.pe/ana",
      imagen:
        "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1000&q=80",
    },

    // ── AGRÓNOMO (Pestaña lateral derecha) ──
    {
      titulo:
        "Manejo de humedad radicular para evitar estrés hídrico en cultivos",
      resumen:
        "Ajustar láminas y frecuencias de riego según etapa fenológica protege raíces y calidad de cosecha.",
      fuente: "Guía Agronómica",
      categoria: "Agrónomo",
      bloque: "AGRONOMO",
      fecha: hoy,
      enlace: "https://www.gob.pe/inia",
      imagen:
        "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=600&q=80",
    },
    {
      titulo: "Nutrición balanceada y análisis de suelo antes de cada campaña",
      resumen:
        "Conocer el pH, conductividad y nutrientes disponibles permite aplicar fertilizantes con mayor precisión.",
      fuente: "Campo y Suelo",
      categoria: "Agrónomo",
      bloque: "AGRONOMO",
      fecha: hoy,
      enlace: "https://www.gob.pe/midagri",
      imagen:
        "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=600&q=80",
    },
    {
      titulo: "Monitoreo fitosanitario preventivo en campañas de alta humedad",
      resumen:
        "La revisión temprana de hojas, brotes y ventilación del cultivo reduce riesgos de hongos y plagas.",
      fuente: "Sanidad Vegetal",
      categoria: "Agrónomo",
      bloque: "AGRONOMO",
      fecha: hoy,
      enlace: "https://www.gob.pe/midagri",
      imagen:
        "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=600&q=80",
    },

    // ── TECNOLÓGICO (Pestaña lateral derecha) ──
    {
      titulo: "Sensores de suelo y control automatizado de válvulas en parcela",
      resumen:
        "Leer humedad en tiempo real permite activar el riego por sector y ahorrar agua y energía.",
      fuente: "Agrotech ASIR",
      categoria: "Tecnológico",
      bloque: "TECNOLOGICO",
      fecha: hoy,
      enlace: "https://www.gob.pe/inia",
      imagen:
        "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=600&q=80",
    },
    {
      titulo:
        "Monitoreo satelital y mapas de parcelas para ubicar zonas críticas",
      resumen:
        "La observación remota ayuda a priorizar inspecciones en campo sin recorrer toda la finca a ciegas.",
      fuente: "Telemetría y Campo",
      categoria: "Tecnológico",
      bloque: "TECNOLOGICO",
      fecha: hoy,
      enlace: "https://www.gob.pe/midagri",
      imagen:
        "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    },
    {
      titulo: "Registro continuo de datos y alertas para decisiones rápidas",
      resumen:
        "Centralizar lecturas, estados de riego y reportes facilita comparar campañas y actuar a tiempo.",
      fuente: "Sistemas Agrícolas",
      categoria: "Tecnológico",
      bloque: "TECNOLOGICO",
      fecha: hoy,
      enlace: "https://www.gob.pe/ana",
      imagen:
        "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=600&q=80",
    },
  ];
}

// =========================================================================
// 3. CARGA RÁPIDA Y ORGANIZACIÓN POR BLOQUES
// =========================================================================

async function cargarNoticiasAgro(forzar = false) {
  const badge = document.getElementById("badgeCacheNoticias");
  if (badge && forzar) badge.innerText = "🔄 Actualizando...";

  const catalogoBase = obtenerCatalogoNoticiasBase();
  let recibidas = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const url = forzar ? "/api/noticias-agro?forzar=1" : "/api/noticias-agro";
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.noticias)) {
        recibidas = data.noticias;
      }
    }
  } catch (_) {
    // Respuesta inmediata con el catálogo local sin esperar APIs externas
  }

  const titulosVistos = new Set();
  const normalizadas = [];

  [...recibidas, ...catalogoBase].forEach((n) => {
    const clave = String(n.titulo || "")
      .trim()
      .toLowerCase();
    if (!clave || titulosVistos.has(clave)) return;
    titulosVistos.add(clave);

    normalizadas.push({
      ...n,
      imagen: n.imagen || IMAGEN_RESPALDO_AGRO,
      resumen: sanitizarTextoNoticia(n.resumen, n.fuente),
      bloque: clasificarNoticia(n),
    });
  });

  const rotarLista = (lista) => {
    if (rotacionEdicion > 0 && lista.length > 1) {
      const paso = rotacionEdicion % lista.length;
      return lista.slice(paso).concat(lista.slice(0, paso));
    }
    return lista;
  };

  noticiasInternacionales = rotarLista(
    normalizadas.filter((n) => n.bloque === "INTERNACIONAL"),
  );
  noticiasNacionales = rotarLista(
    normalizadas.filter(
      (n) => n.bloque === "NACIONAL_MEDIOS" || n.bloque === "NACIONAL_BOLETIN",
    ),
  );
  noticiasAgronomo = rotarLista(
    normalizadas.filter((n) => n.bloque === "AGRONOMO"),
  );
  noticiasTecnologico = rotarLista(
    normalizadas.filter((n) => n.bloque === "TECNOLOGICO"),
  );

  noticiasTodas = rotarLista(normalizadas);

  const seleccionCarrusel = [
    noticiasNacionales[0],
    noticiasInternacionales[0],
    noticiasTecnologico[0],
    noticiasAgronomo[0],
    noticiasNacionales[1],
  ].filter(Boolean);

  noticiasCarrusel =
    seleccionCarrusel.length > 0
      ? seleccionCarrusel
      : noticiasTodas.slice(0, 4);
  indiceSlide = 0;

  if (badge) {
    badge.innerText = `⚡ Al día (${obtenerHoraFormateadaActual()})`;
  }

  renderizarColumnaInternacional();
  renderizarCarrusel();
  renderizarGrillaNacional();
  renderizarSidebarPestana();
  iniciarAutoPlayCarrusel();
}

function actualizarNoticiasRapido() {
  rotacionEdicion += 1;
  cargarNoticiasAgro(true);
}

// =========================================================================
// 4. ARRIBA IZQUIERDA: 3 TARJETAS ALINEADAS AL RAS CON BLANCO EN MODO CLARO
// =========================================================================

function renderizarColumnaInternacional() {
  const cont = document.getElementById("columnaInternacionalHero");
  if (!cont) return;

  const lista = noticiasInternacionales.slice(0, 3);
  const claro = esModoClaroActivo();

  if (lista.length === 0) {
    cont.innerHTML = `<div class="rounded-xl p-3 text-xs flex-1 flex items-center justify-center">Sin notas internacionales por mostrar.</div>`;
    return;
  }

  const cardStyle = claro
    ? "background-color: #ffffff; border-color: #cbd5e1;"
    : "background-color: #0f172a; border-color: #334155;";
  const tituloColor = claro ? "#0f172a" : "#f8fafc";
  const resumenColor = claro ? "#475569" : "#94a3b8";

  cont.innerHTML = lista
    .map(
      (n) => `
      <a
        href="${n.enlace}"
        target="_blank"
        rel="noopener noreferrer"
        style="${cardStyle}"
        class="hover:border-amber-400 border rounded-xl p-1.5 flex-1 flex flex-col justify-between transition group min-w-0 shadow-sm overflow-hidden"
      >
        <div class="relative w-full h-16 sm:h-20 rounded-lg overflow-hidden shrink-0">
          <img
            src="${n.imagen}"
            alt="${n.titulo}"
            onerror="this.src='${IMAGEN_RESPALDO_AGRO}'"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <span class="absolute top-1 left-1 bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded shadow">
            ${n.fuente}
          </span>
        </div>

        <div class="pt-1 px-0.5 space-y-0.5">
          <h4 style="color: ${tituloColor};" class="text-xs font-bold group-hover:text-amber-500 transition line-clamp-1 leading-tight">
            ${n.titulo}
          </h4>
          <p style="color: ${resumenColor};" class="text-[11px] line-clamp-1 leading-tight">
            ${n.resumen}
          </p>
        </div>
      </a>
    `,
    )
    .join("");
}

// =========================================================================
// 5. CARRUSEL PRINCIPAL SIN RECTÁNGULO NEGRO
// =========================================================================

function renderizarCarrusel() {
  const contenedor = document.getElementById("slidesCarrusel");
  const indicadores = document.getElementById("indicadoresCarrusel");
  if (!contenedor || noticiasCarrusel.length === 0) return;

  const noticia = noticiasCarrusel[indiceSlide];

  contenedor.innerHTML = `
    <div class="w-full h-full relative group">
      <img
        src="${noticia.imagen}"
        alt="${noticia.titulo}"
        onerror="this.src='${IMAGEN_RESPALDO_AGRO}'"
        class="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
      />
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

      <div class="absolute inset-x-0 bottom-0 px-10 sm:px-14 pb-7 pt-5">
        <div class="flex flex-wrap items-center gap-2 mb-1">
          <span class="bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded">
            ${noticia.categoria || noticia.fuente}
          </span>
          <span style="color: #f1f5f9;" class="text-[11px] font-medium">
            ${noticia.fuente} • ${noticia.fecha}
          </span>
        </div>

        <h3 style="color: #ffffff;" class="text-base sm:text-xl lg:text-2xl font-extrabold leading-tight line-clamp-1 mb-1">
          ${noticia.titulo}
        </h3>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p style="color: #e2e8f0;" class="text-xs line-clamp-1 max-w-2xl">
            ${noticia.resumen}
          </p>
          <a
            href="${noticia.enlace}"
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0 inline-flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold px-3.5 py-1.5 rounded-lg transition self-start sm:self-auto"
          >
            <span>LEER MÁS</span>
            <span>→</span>
          </a>
        </div>
      </div>
    </div>
  `;

  if (indicadores) {
    indicadores.innerHTML = noticiasCarrusel
      .map(
        (_, i) => `
        <button
          type="button"
          onclick="irASlide(${i})"
          aria-label="Ir a diapositiva ${i + 1}"
          class="h-2 rounded-full transition-all cursor-pointer ${
            i === indiceSlide
              ? "w-6 bg-amber-400"
              : "w-2 bg-slate-300/70 hover:bg-white"
          }"
        ></button>
      `,
      )
      .join("");
  }
}

function moverCarrusel(delta) {
  if (noticiasCarrusel.length === 0) return;
  indiceSlide =
    (indiceSlide + delta + noticiasCarrusel.length) % noticiasCarrusel.length;
  renderizarCarrusel();
}

function irASlide(idx) {
  indiceSlide = idx;
  renderizarCarrusel();
}

function iniciarAutoPlayCarrusel() {
  if (intervaloCarrusel) clearInterval(intervaloCarrusel);
  intervaloCarrusel = setInterval(() => moverCarrusel(1), 6500);
}

function pausarCarrusel() {
  if (intervaloCarrusel) clearInterval(intervaloCarrusel);
}

function reanudarCarrusel() {
  iniciarAutoPlayCarrusel();
}

// =========================================================================
// 6. ABAJO IZQUIERDA: NOTICIAS NACIONALES CON CUADRADOS AMARILLOS
// =========================================================================

function filtrarNoticias(nuevoFiltro) {
  filtroNacionalActual = nuevoFiltro;

  document.querySelectorAll(".btn-filtro-noticia").forEach((btn) => {
    const activo = btn.dataset.filtro === nuevoFiltro;
    btn.className = activo
      ? "btn-filtro-noticia bg-amber-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
      : "btn-filtro-noticia bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer";
  });

  renderizarGrillaNacional();
}

function renderizarGrillaNacional() {
  const grid = document.getElementById("gridNoticiasSecundarias");
  if (!grid) return;

  let lista = noticiasNacionales;
  if (filtroNacionalActual === "MEDIOS") {
    lista = noticiasNacionales.filter((n) => n.bloque === "NACIONAL_MEDIOS");
  } else if (filtroNacionalActual === "BOLETINES") {
    lista = noticiasNacionales.filter((n) => n.bloque === "NACIONAL_BOLETIN");
  }

  const mostradas = lista.slice(0, 6);

  grid.innerHTML = mostradas
    .map((n) => {
      const f = formatearFechaCorta(n.fecha);
      return `
        <article class="bg-slate-800/90 hover:bg-slate-800 rounded-xl border border-slate-700/80 overflow-hidden shadow-lg flex flex-col justify-between transition group">
          <div>
            <div class="relative h-36 w-full overflow-hidden bg-slate-900">
              <img
                src="${n.imagen}"
                alt="${n.titulo}"
                onerror="this.src='${IMAGEN_RESPALDO_AGRO}'"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div class="absolute top-2.5 left-2.5 bg-amber-400 text-slate-950 rounded-md px-2 py-1 text-center leading-none shadow">
                <span class="block text-xs font-extrabold">${f.dia}</span>
                <span class="block text-[9px] font-extrabold uppercase">${f.mes}</span>
              </div>
              <span class="absolute bottom-2.5 left-2.5 bg-slate-950/85 text-amber-300 border border-amber-400/40 text-[10px] font-bold px-2 py-0.5 rounded">
                ${n.fuente}
              </span>
            </div>

            <div class="p-3.5 space-y-1.5">
              <p class="text-[11px] text-slate-400 font-medium truncate">
                ${n.categoria || "Perú"} • ${f.completa}
              </p>
              <h4 class="text-sm font-bold text-slate-100 leading-snug line-clamp-2 group-hover:text-amber-500 transition">
                ${n.titulo}
              </h4>
              <p class="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                ${n.resumen}
              </p>
            </div>
          </div>

          <div class="px-3.5 pb-3.5 pt-1.5 flex justify-end border-t border-slate-700/50">
            <a
              href="${n.enlace}"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs font-bold text-amber-500 hover:text-amber-400 inline-flex items-center gap-1 transition"
            >
              <span>Leer nota</span>
              <span>↗</span>
            </a>
          </div>
        </article>
      `;
    })
    .join("");
}

// =========================================================================
// 7. ABAJO DERECHA: PESTAÑAS AGRÓNOMO / TECNOLÓGICO (FONDO OSCURO + BLANCO)
// =========================================================================

function cambiarTabSidebar(nuevaTab) {
  tabSidebarActual = nuevaTab === "TECNOLOGICO" ? "TECNOLOGICO" : "AGRONOMO";

  document.querySelectorAll(".tab-sidebar-noticia").forEach((btn) => {
    const activo = btn.dataset.tabSidebar === tabSidebarActual;
    btn.className = activo
      ? "tab-sidebar-noticia bg-amber-400 text-slate-950 text-xs font-bold py-2 px-3 rounded-lg transition cursor-pointer truncate"
      : "tab-sidebar-noticia text-white/80 hover:text-white text-xs font-semibold py-2 px-3 rounded-lg transition cursor-pointer truncate";
  });

  renderizarSidebarPestana();
}

function renderizarSidebarPestana() {
  const cont = document.getElementById("listaSidebarPestana");
  if (!cont) return;

  const items = (
    tabSidebarActual === "TECNOLOGICO" ? noticiasTecnologico : noticiasAgronomo
  ).slice(0, 4);

  cont.innerHTML = items
    .map(
      (n) => `
      <a
        href="${n.enlace}"
        target="_blank"
        rel="noopener noreferrer"
        style="background-color:#0b110e;border-color:#1e2d24;"
        class="flex items-start gap-3 p-2.5 rounded-xl hover:border-amber-400 border transition group"
      >
        <img
          src="${n.imagen}"
          alt="${n.titulo}"
          onerror="this.src='${IMAGEN_RESPALDO_AGRO}'"
          class="w-16 h-14 object-cover rounded-lg shrink-0 bg-black"
        />
        <div class="min-w-0 flex-grow space-y-1">
          <span class="text-[10px] font-extrabold text-amber-400 block truncate">
            ${n.fuente}
          </span>
          <h5 class="text-xs font-bold !text-white group-hover:text-amber-300 transition line-clamp-2 leading-snug">
            ${n.titulo}
          </h5>
          <p class="text-[11px] !text-slate-200 line-clamp-1">
            ${n.resumen}
          </p>
        </div>
      </a>
    `,
    )
    .join("");
}
