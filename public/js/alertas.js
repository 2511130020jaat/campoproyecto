let noticiasTodas = [];
let noticiasCarrusel = [];
let filtroActual = "TODAS";
let indiceSlide = 0;
let intervaloCarrusel = null;

document.addEventListener("DOMContentLoaded", () => {
  if (
    typeof usuarioSesion !== "undefined" &&
    usuarioSesion &&
    usuarioSesion.nombre
  ) {
    const lbl = document.getElementById("lblSubtituloBienvenida");
    if (lbl) {
      lbl.innerText =
        "Bienvenido, " +
        usuarioSesion.nombre +
        ". Consulta los comunicados oficiales de ANA, MIDAGRI e INIA y las novedades del agro.";
    }
  }

  cargarNoticiasAgro(false);
});

// =========================================================================
// 1. SANITIZACIÓN Y CLASIFICACIÓN POR FUENTE INSTITUCIONAL
// =========================================================================

function sanitizarTextoNoticia(texto, fuente) {
  const limpio = (texto || "")
    .replace(/<[^>]*>?/g, " ")
    .replace(/href\s*=\s*["'][^"']*["']?/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (limpio.length < 25) {
    return (
      "Boletín informativo de " +
      (fuente || "Actualidad Agraria") +
      " sobre disponibilidad hídrica, campañas agrícolas y modernización de cultivos."
    );
  }
  return limpio;
}

function clasificarNoticia(n) {
  const texto =
    `${n.fuente || ""} ${n.categoria || ""} ${n.titulo || ""} ${n.resumen || ""}`.toLowerCase();

  if (
    texto.includes("ana") ||
    texto.includes("autoridad nacional del agua") ||
    texto.includes("cuenca") ||
    texto.includes("recurso hídrico") ||
    texto.includes("recursos hídricos")
  ) {
    return {
      grupo: "ANA",
      etiqueta: "💧 ANA • Recursos Hídricos",
      colorBadge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    };
  }

  if (
    texto.includes("midagri") ||
    texto.includes("inia") ||
    texto.includes("ministerio de desarrollo agrario") ||
    texto.includes("campaña agrícola") ||
    texto.includes("sanidad agraria") ||
    texto.includes("senasa")
  ) {
    return {
      grupo: "MIDAGRI",
      etiqueta: "🌾 MIDAGRI / INIA",
      colorBadge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    };
  }

  return {
    grupo: "TECNOLOGIA",
    etiqueta: "🛰️ Riego y Tecnología",
    colorBadge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  };
}

function obtenerBoletinesInstitucionalesBase() {
  const hoy = new Date().toISOString().split("T")[0];
  return [
    {
      titulo:
        "ANA: Recomendaciones para el uso eficiente del agua de riego en cuencas de la costa",
      resumen:
        "La Autoridad Nacional del Agua exhorta a las juntas de usuarios y productores a programar turnos de riego tecnificado para optimizar la disponibilidad hídrica.",
      fuente: "ANA Perú",
      categoria: "Gestión Hídrica",
      fecha: hoy,
      enlace: "https://www.gob.pe/ana",
      imagen:
        "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1200&q=80",
    },
    {
      titulo:
        "MIDAGRI e INIA impulsan paquetes tecnológicos para elevar la productividad en pequeños predios",
      resumen:
        "Nuevas guías de manejo agronómico, semillas certificadas y monitoreo de suelos permiten reducir pérdidas frente a variaciones estacionales.",
      fuente: "MIDAGRI / INIA",
      categoria: "Boletín Oficial",
      fecha: hoy,
      enlace: "https://www.gob.pe/midagri",
      imagen:
        "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1200&q=80",
    },
    {
      titulo:
        "Riego tecnificado y sensores de humedad reducen hasta 35% el consumo de agua por campaña",
      resumen:
        "Medir la humedad directamente en la zona radicular evita riegos innecesarios y protege el cultivo contra el estrés hídrico.",
      fuente: "Boletín Técnico ASIR",
      categoria: "Tecnología Agrícola",
      fecha: hoy,
      enlace: "https://www.gob.pe/inia",
      imagen:
        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80",
    },
  ];
}

// =========================================================================
// 2. CARGA DE NOTICIAS Y BOLETINES
// =========================================================================

async function cargarNoticiasAgro(forzar = false) {
  const badge = document.getElementById("badgeCacheNoticias");
  if (badge && forzar) badge.innerText = "🔄 Actualizando...";

  try {
    const url = forzar ? "/api/noticias-agro?forzar=1" : "/api/noticias-agro";
    const res = await fetch(url);
    const data = await res.json();

    const recibidas = Array.isArray(data.noticias) ? data.noticias : [];
    const baseInstitucional = obtenerBoletinesInstitucionalesBase();

    // Combinar noticias recibidas con boletines institucionales sin duplicar títulos
    const titulosVistos = new Set();
    const combinadas = [];

    [...recibidas, ...baseInstitucional].forEach((n) => {
      const clave = (n.titulo || "").trim().toLowerCase();
      if (!clave || titulosVistos.has(clave)) return;
      titulosVistos.add(clave);

      const clasif = clasificarNoticia(n);
      combinadas.push({
        ...n,
        resumen: sanitizarTextoNoticia(n.resumen, n.fuente),
        grupo: clasif.grupo,
        etiqueta: clasif.etiqueta,
        colorBadge: clasif.colorBadge,
      });
    });

    noticiasTodas = combinadas;
    noticiasCarrusel = noticiasTodas.slice(0, 4);
    indiceSlide = 0;

    if (badge) {
      const horasRest = data.proxima_actualizacion_horas || 72;
      const diasRest = Math.max(1, Math.ceil(horasRest / 24));
      badge.innerText =
        "📰 Próxima renovación en " +
        diasRest +
        (diasRest === 1 ? " día" : " días");
    }

    renderizarCarrusel();
    renderizarTarjetasNoticias();
    iniciarAutoPlayCarrusel();
  } catch (err) {
    console.error("Error cargando noticias:", err);
    noticiasTodas = obtenerBoletinesInstitucionalesBase().map((n) => {
      const clasif = clasificarNoticia(n);
      return { ...n, ...clasif };
    });
    noticiasCarrusel = noticiasTodas.slice(0, 3);
    renderizarCarrusel();
    renderizarTarjetasNoticias();
  }
}

// =========================================================================
// 3. CARRUSEL PRINCIPAL
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
        onerror="this.src='https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80'"
        class="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
      />
      <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/15"></div>

      <div class="absolute inset-0 px-14 sm:px-16 py-7 sm:py-9 flex flex-col justify-end max-w-5xl">
        <div class="flex flex-wrap items-center gap-2.5 mb-3">
          <span class="border text-xs font-bold px-3 py-1 rounded-full ${noticia.colorBadge}">
            ${noticia.etiqueta}
          </span>
          <span class="text-xs text-slate-300 font-medium">
            ${noticia.fuente} • ${noticia.fecha}
          </span>
        </div>

        <h3 class="text-xl sm:text-3xl font-extrabold text-white leading-tight mb-3">
          ${noticia.titulo}
        </h3>

        <p class="text-xs sm:text-sm text-slate-300 line-clamp-2 mb-5 max-w-3xl leading-relaxed">
          ${noticia.resumen}
        </p>

        <div>
          <a
            href="${noticia.enlace}"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-lg"
          >
            <span>Leer comunicado completo</span>
            <span>↗</span>
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
          class="h-2 rounded-full transition-all ${
            i === indiceSlide
              ? "w-7 bg-sky-400"
              : "w-2 bg-slate-500/70 hover:bg-slate-300"
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
// 4. FILTROS Y GRILLA DE BOLETINES / ARTÍCULOS
// =========================================================================

function filtrarNoticias(nuevoFiltro) {
  filtroActual = nuevoFiltro;

  document.querySelectorAll(".btn-filtro-noticia").forEach((btn) => {
    const activo = btn.dataset.filtro === nuevoFiltro;
    btn.className = activo
      ? "btn-filtro-noticia bg-sky-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition"
      : "btn-filtro-noticia bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl transition";
  });

  renderizarTarjetasNoticias();
}

function renderizarTarjetasNoticias() {
  const grid = document.getElementById("gridNoticiasSecundarias");
  if (!grid) return;

  let listaFiltrada =
    filtroActual === "TODAS"
      ? noticiasTodas.slice(4)
      : noticiasTodas.filter((n) => n.grupo === filtroActual);

  if (listaFiltrada.length === 0) {
    listaFiltrada = noticiasTodas.slice(0, 6);
  } else {
    listaFiltrada = listaFiltrada.slice(0, 6);
  }

  grid.innerHTML = listaFiltrada
    .map(
      (n) => `
      <article class="bg-slate-800/90 hover:bg-slate-800 rounded-2xl border border-slate-700/80 overflow-hidden shadow-lg flex flex-col justify-between transition group">
        <div>
          <div class="relative h-40 w-full overflow-hidden bg-slate-900">
            <img
              src="${n.imagen}"
              alt="${n.titulo}"
              onerror="this.src='https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=800&q=80'"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <span class="absolute top-3 left-3 bg-slate-950/85 border text-[10px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-sm ${n.colorBadge}">
              ${n.etiqueta}
            </span>
          </div>

          <div class="p-4 space-y-2">
            <p class="text-[11px] text-slate-400 font-medium">
              ${n.fuente} • ${n.fecha}
            </p>
            <h4 class="text-sm font-bold text-slate-100 leading-snug line-clamp-2 group-hover:text-sky-400 transition">
              ${n.titulo}
            </h4>
            <p class="text-xs text-slate-400 line-clamp-3 leading-relaxed">
              ${n.resumen}
            </p>
          </div>
        </div>

        <div class="px-4 pb-4 pt-2 flex justify-end">
          <a
            href="${n.enlace}"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs font-bold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 transition"
          >
            <span>Leer nota completa</span>
            <span>↗</span>
          </a>
        </div>
      </article>
    `,
    )
    .join("");
}
