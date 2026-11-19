let noticiasCarrusel = [];
let noticiasTarjetas = [];
let indiceSlide = 0;
let intervaloCarrusel = null;

document.addEventListener("DOMContentLoaded", () => {
  if (usuarioSesion && usuarioSesion.nombre) {
    const lbl = document.getElementById("lblSubtituloBienvenida");
    if (lbl) {
      lbl.innerText =
        "Bienvenido, " +
        usuarioSesion.nombre +
        ". Explora las novedades del agro y el pulso climático de tus parcelas.";
    }
  }

  cargarNoticiasAgro(false);
  cargarPulsoMinimalistaParcelas();
});

// =========================================================================
// 1. CARRUSEL PRINCIPAL + TARJETAS DE NOTICIAS SECUNDARIAS
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
      " sobre gestión hídrica, clima y modernización de cultivos."
    );
  }
  return limpio;
}

async function cargarNoticiasAgro(forzar = false) {
  const badge = document.getElementById("badgeCacheNoticias");
  if (badge && forzar) badge.innerText = "🔄 Actualizando...";

  try {
    const url = forzar ? "/api/noticias-agro?forzar=1" : "/api/noticias-agro";
    const res = await fetch(url);
    const data = await res.json();

    const todas = (Array.isArray(data.noticias) ? data.noticias : []).map(
      (n) => ({
        ...n,
        resumen: sanitizarTextoNoticia(n.resumen, n.fuente),
      }),
    );

    // Primeras 4 noticias van al carrusel; abajo siempre filas completas de 3 tarjetas
    noticiasCarrusel = todas.slice(0, 4);
    const restantes = todas.slice(4);

    if (restantes.length >= 6) {
      noticiasTarjetas = restantes.slice(0, 6);
    } else if (restantes.length >= 3) {
      noticiasTarjetas = restantes.slice(0, 3);
    } else {
      const faltantes = 3 - restantes.length;
      noticiasTarjetas = restantes.concat(todas.slice(0, faltantes));
    }

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
  }
}

/////7

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

      <!-- Padding lateral amplio (px-14 sm:px-16) para no chocar con las flechas -->
      <div class="absolute inset-0 px-14 sm:px-16 py-7 sm:py-9 flex flex-col justify-end max-w-5xl">
        <div class="flex flex-wrap items-center gap-2.5 mb-3">
          <span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold px-3 py-1 rounded-full">
            🌱 ${noticia.categoria}
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
            <span>Leer artículo completo</span>
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

function renderizarTarjetasNoticias() {
  const grid = document.getElementById("gridNoticiasSecundarias");
  if (!grid) return;

  if (noticiasTarjetas.length === 0) {
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = noticiasTarjetas
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
            <span class="absolute top-3 left-3 bg-slate-950/80 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-sm">
              ${n.categoria}
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
            <span>Leer nota</span>
            <span>↗</span>
          </a>
        </div>
      </article>
    `,
    )
    .join("");
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
// 2. VISTA MINIMALISTA DE CLIMA Y PARCELAS (PIE DE PÁGINA)
// =========================================================================

function iconoClimaSimple(code) {
  if (code === 0) return "☀️";
  if (code >= 1 && code <= 3) return "⛅";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 82) return "🌧️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}

async function cargarPulsoMinimalistaParcelas() {
  const grid = document.getElementById("gridPulsoMinimalista");
  if (!grid) return;

  try {
    const res = await fetch("/api/alertas-agro/" + usuarioSesion.id);
    const parcelas = await res.json();

    if (!Array.isArray(parcelas) || parcelas.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full bg-slate-800/50 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-xs text-slate-400">
          <span>Aún no tienes parcelas registradas.</span>
          <a href="/parcelas.html" class="text-sky-400 hover:underline font-semibold">+ Registrar campo</a>
        </div>
      `;
      return;
    }

    grid.innerHTML = parcelas
      .map((p) => {
        const puntoEstado =
          p.estado === "CRITICO"
            ? "bg-rose-500"
            : p.estado === "ATENCION"
              ? "bg-amber-400"
              : "bg-emerald-400";

        let climaTxt = "Clima local";
        let icono = "🌤️";
        if (p.clima && p.clima.current) {
          icono = iconoClimaSimple(p.clima.current.weather_code);
          const temp = p.clima.current.temperature_2m.toFixed(0);
          const lluvia =
            p.clima.daily && p.clima.daily.precipitation_probability_max
              ? p.clima.daily.precipitation_probability_max[0]
              : 0;
          climaTxt = `${temp}°C • Lluvia ${lluvia}%`;
        }

        const sueloTxt =
          p.humedad_suelo !== null
            ? `Suelo ${p.humedad_suelo.toFixed(0)}%`
            : p.notaBreve;

        return `
          <a
            href="/riego.html"
            class="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/70 rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition group"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${puntoEstado} shrink-0"></span>
                <p class="text-xs font-bold text-slate-200 truncate group-hover:text-sky-400 transition">
                  ${p.parcela}
                </p>
                <span class="text-[11px] text-slate-500 truncate">• ${p.cultivo}</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-1 pl-4">
                ${sueloTxt}
              </p>
            </div>

            <div class="text-right shrink-0">
              <p class="text-xs font-semibold text-slate-200">
                ${icono} ${climaTxt}
              </p>
              <span class="text-[10px] text-slate-500 group-hover:text-sky-400 transition">
                Ver detalle →
              </span>
            </div>
          </a>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Error cargando pulso de parcelas:", err);
  }
}
