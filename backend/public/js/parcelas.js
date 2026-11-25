let mapaParcelas = null;
let capaSatelite = null;
let capaCalle = null;
let esSatelite = true;
let capaPoligonosGuardados = null;
let parcelasCache = [];
let pulsoClimaticoMap = {};
let chartDetalle = null;
let ultimoBoundsVista = null;

const COORD_DEFECTO = [-12.6581, -76.6321];

document.addEventListener("DOMContentLoaded", () => {
  inicializarMapa();
  cargarParcelasUsuario();
});

// =========================================================================
// 1. MAPA SATELITAL DE EXPLORACIÓN (SIN DIBUJO ACCIDENTAL)
// =========================================================================

function inicializarMapa() {
  const contenedorMapa = document.getElementById("mapaParcelas");
  if (!contenedorMapa) return;

  mapaParcelas = L.map("mapaParcelas", {
    maxZoom: 22,
  }).setView(COORD_DEFECTO, 15);

  capaSatelite = L.tileLayer(
    "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    {
      maxZoom: 22,
      maxNativeZoom: 20,
      attribution: "© Google Satélite",
    },
  );

  capaCalle = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: "© OpenStreetMap",
    },
  );

  capaSatelite.addTo(mapaParcelas);
  capaPoligonosGuardados = L.layerGroup().addTo(mapaParcelas);
}

function alternarCapaMapa() {
  const btn = document.getElementById("btnCapaMapa");
  if (!mapaParcelas) return;

  if (esSatelite) {
    mapaParcelas.removeLayer(capaSatelite);
    capaCalle.addTo(mapaParcelas);
    if (btn) btn.innerText = "🛰️ Vista Satélite";
    esSatelite = false;
  } else {
    mapaParcelas.removeLayer(capaCalle);
    capaSatelite.addTo(mapaParcelas);
    if (btn) btn.innerText = "🗺️ Vista Calles";
    esSatelite = true;
  }
}

function centrarTodasLasParcelas() {
  if (!mapaParcelas) return;
  if (ultimoBoundsVista && ultimoBoundsVista.length > 0) {
    mapaParcelas.fitBounds(ultimoBoundsVista, {
      padding: [45, 45],
      maxZoom: 18,
    });
  } else {
    mapaParcelas.setView(COORD_DEFECTO, 15);
  }
}

// =========================================================================
// 2. CÁLCULOS GEOMÉTRICOS Y ENVOLTURA DEL CAMPO GENERAL
// =========================================================================

function parsearPoligonoGuardado(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function distanciaHaversineMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcularMetricasPoligono(puntos) {
  if (!puntos || puntos.length === 0) {
    return {
      areaM2: 0,
      perimetroM: 0,
      anchoM: 0,
      altoM: 0,
      centroide: null,
    };
  }

  let sumLat = 0;
  let sumLng = 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  puntos.forEach((p) => {
    sumLat += p[0];
    sumLng += p[1];
    if (p[0] < minLat) minLat = p[0];
    if (p[0] > maxLat) maxLat = p[0];
    if (p[1] < minLng) minLng = p[1];
    if (p[1] > maxLng) maxLng = p[1];
  });

  const lat0 = sumLat / puntos.length;
  const lng0 = sumLng / puntos.length;
  const mPorLat = 111132.92;
  const mPorLng = 111412.84 * Math.cos((lat0 * Math.PI) / 180);

  const anchoM = (maxLng - minLng) * mPorLng;
  const altoM = (maxLat - minLat) * mPorLat;

  if (puntos.length < 3) {
    const perim =
      puntos.length === 2
        ? distanciaHaversineMetros(
            puntos[0][0],
            puntos[0][1],
            puntos[1][0],
            puntos[1][1],
          )
        : 0;
    return {
      areaM2: 0,
      perimetroM: perim,
      anchoM,
      altoM,
      centroide: [lat0, lng0],
    };
  }

  const xy = puntos.map((p) => ({
    x: (p[1] - lng0) * mPorLng,
    y: (p[0] - lat0) * mPorLat,
  }));

  let area2 = 0;
  let perimetroM = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    area2 += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
    perimetroM += distanciaHaversineMetros(
      puntos[i][0],
      puntos[i][1],
      puntos[j][0],
      puntos[j][1],
    );
  }

  return {
    areaM2: Math.abs(area2) / 2,
    perimetroM,
    anchoM,
    altoM,
    centroide: [lat0, lng0],
  };
}

function calcularEnvolturaConvexa(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 3) return [];

  const unicos = [];
  const vistos = new Set();
  puntos.forEach(([lat, lng]) => {
    const key = `${lat.toFixed(7)},${lng.toFixed(7)}`;
    if (!vistos.has(key)) {
      vistos.add(key);
      unicos.push([lat, lng]);
    }
  });

  if (unicos.length < 3) return [];

  unicos.sort((a, b) => (a[1] === b[1] ? a[0] - b[0] : a[1] - b[1]));

  const cruz = (o, a, b) =>
    (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);

  const inferior = [];
  for (const p of unicos) {
    while (
      inferior.length >= 2 &&
      cruz(inferior[inferior.length - 2], inferior[inferior.length - 1], p) <= 0
    ) {
      inferior.pop();
    }
    inferior.push(p);
  }

  const superior = [];
  for (let i = unicos.length - 1; i >= 0; i--) {
    const p = unicos[i];
    while (
      superior.length >= 2 &&
      cruz(superior[superior.length - 2], superior[superior.length - 1], p) <= 0
    ) {
      superior.pop();
    }
    superior.push(p);
  }

  inferior.pop();
  superior.pop();
  const hull = inferior.concat(superior);
  if (hull.length < 3) return [];

  // Expandir levemente (~5m) desde el centroide para enmarcar sin superponerse al borde verde
  const cLat = hull.reduce((acc, p) => acc + p[0], 0) / hull.length;
  const cLng = hull.reduce((acc, p) => acc + p[1], 0) / hull.length;

  return hull.map(([lat, lng]) => {
    const dLat = lat - cLat;
    const dLng = lng - cLng;
    const dist = Math.hypot(dLat, dLng) || 1e-6;
    const margen = 0.000045;
    return [lat + (dLat / dist) * margen, lng + (dLng / dist) * margen];
  });
}

// =========================================================================
// 3. GENERADOR DE CROQUIS VISUAL SVG POR PARCELA
// =========================================================================

function generarSvgSiluetaParcela(poligono, diseno2d = null) {
  const W = 260;
  const H = 130;
  const pad = 18;

  const cuadriculaSvg = `
    <defs>
      <pattern id="gridCampo" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(148,163,184,0.08)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#gridCampo)" />
  `;

  if (Array.isArray(poligono) && poligono.length >= 3) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    poligono.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });

    const lat0 = (minLat + maxLat) / 2;
    const factorCos = Math.cos((lat0 * Math.PI) / 180) || 1;
    const spanX = Math.max((maxLng - minLng) * factorCos, 1e-7);
    const spanY = Math.max(maxLat - minLat, 1e-7);

    const escala = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
    const anchoDibujo = spanX * escala;
    const altoDibujo = spanY * escala;
    const offsetX = (W - anchoDibujo) / 2;
    const offsetY = (H - altoDibujo) / 2;

    const puntosSvg = poligono.map(([lat, lng]) => {
      const x = offsetX + (lng - minLng) * factorCos * escala;
      const y = offsetY + (maxLat - lat) * escala;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });

    const pointsStr = puntosSvg.map((p) => `${p.x},${p.y}`).join(" ");
    const circulosVertices = puntosSvg
      .map(
        (p) =>
          `<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="#00E5FF" stroke="#0f172a" stroke-width="1.2" />`,
      )
      .join("");

    return `
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-full">
        ${cuadriculaSvg}
        <polygon points="${pointsStr}" fill="rgba(16, 185, 129, 0.22)" stroke="#00E5FF" stroke-width="2.2" stroke-linejoin="round" />
        ${circulosVertices}
      </svg>
    `;
  }

  if (diseno2d && diseno2d.ancho_metros > 0 && diseno2d.alto_metros > 0) {
    const anchoM = diseno2d.ancho_metros;
    const altoM = diseno2d.alto_metros;
    const escala = Math.min((W - pad * 2) / anchoM, (H - pad * 2) / altoM);
    const rw = anchoM * escala;
    const rh = altoM * escala;
    const rx = (W - rw) / 2;
    const ry = (H - rh) / 2;

    const nodosSvg = (diseno2d.nodos || [])
      .map((n) => {
        const nx = rx + (parseFloat(n.x) || 0) * escala;
        const ny = ry + (parseFloat(n.y) || 0) * escala;
        const color =
          n.tipo === "BOMBA"
            ? "#00b4cc"
            : n.tipo === "VALVULA"
              ? "#f59e0b"
              : "#00E5FF";
        return `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="3.5" fill="${color}" />`;
      })
      .join("");

    return `
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-full">
        ${cuadriculaSvg}
        <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" rx="4" fill="rgba(14, 165, 233, 0.16)" stroke="#00b4cc" stroke-width="2" />
        ${nodosSvg}
        <text x="${W / 2}" y="${H - 5}" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="monospace">${anchoM}m × ${altoM}m</text>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-full">
      ${cuadriculaSvg}
      <rect x="65" y="28" width="130" height="74" rx="8" fill="rgba(51, 65, 85, 0.25)" stroke="#475569" stroke-width="1.5" stroke-dasharray="5,4" />
      <circle cx="130" cy="65" r="5" fill="#00E5FF" />
      <text x="130" y="92" text-anchor="middle" fill="#64748b" font-size="9" font-family="sans-serif">Punto GPS sin contorno</text>
    </svg>
  `;
}

// =========================================================================
// 4. CARGA Y RENDERIZADO AGRUPADO POR CAMPO GENERAL
// =========================================================================

async function cargarParcelasUsuario() {
  const contenedor = document.getElementById("contenedorVistaCampos");
  if (!contenedor || typeof usuarioSesion === "undefined" || !usuarioSesion)
    return;

  try {
    const [resParcelas, resPulso] = await Promise.all([
      fetch("/api/parcelas?id_usuario=" + usuarioSesion.id),
      fetch("/api/alertas-agro/" + usuarioSesion.id).catch(() => null),
    ]);

    const parcelas = await resParcelas.json();
    parcelasCache = Array.isArray(parcelas) ? parcelas : [];

    pulsoClimaticoMap = {};
    if (resPulso && resPulso.ok) {
      const listaPulso = await resPulso.json();
      if (Array.isArray(listaPulso)) {
        listaPulso.forEach((item) => {
          pulsoClimaticoMap[item.id] = item;
        });
      }
    }

    poblarSelectorCampoGeneral();
    renderizarVistaDeCampo();
  } catch (err) {
    console.error("Error al cargar vista de campo:", err);
  }
}

function poblarSelectorCampoGeneral() {
  const sel = document.getElementById("selFiltroCampoGeneral");
  if (!sel) return;

  const valorActual = sel.value || "TODOS";
  const camposUnicos = new Set();
  let hayIndependientes = false;

  parcelasCache.forEach((p) => {
    const cg = (p.campo_general || "").trim();
    if (cg) camposUnicos.add(cg);
    else hayIndependientes = true;
  });

  sel.innerHTML = '<option value="TODOS">🏡 Todos los campos</option>';
  Array.from(camposUnicos)
    .sort((a, b) => a.localeCompare(b))
    .forEach((cg) => {
      sel.innerHTML += `<option value="${cg}">🏡 ${cg}</option>`;
    });

  if (hayIndependientes && camposUnicos.size > 0) {
    sel.innerHTML +=
      '<option value="__SIN_CAMPO__">🌱 Parcelas Independientes</option>';
  }

  if (Array.from(sel.options).some((opt) => opt.value === valorActual)) {
    sel.value = valorActual;
  }
}

function filtrarPorCampoGeneral() {
  renderizarVistaDeCampo();
}

function renderizarVistaDeCampo() {
  const contenedor = document.getElementById("contenedorVistaCampos");
  const contador = document.getElementById("contadorParcelas");
  const lblResumenArea = document.getElementById("lblResumenAreaCampo");
  const selFiltro = document.getElementById("selFiltroCampoGeneral");
  const filtroCampo = selFiltro ? selFiltro.value : "TODOS";

  if (!contenedor) return;

  const parcelasFiltradas = parcelasCache.filter((p) => {
    const cg = (p.campo_general || "").trim();
    if (filtroCampo === "TODOS") return true;
    if (filtroCampo === "__SIN_CAMPO__") return cg === "";
    return cg === filtroCampo;
  });

  if (contador) {
    contador.innerText =
      parcelasFiltradas.length +
      (parcelasFiltradas.length === 1 ? " parcela" : " parcelas");
  }

  if (capaPoligonosGuardados) {
    capaPoligonosGuardados.clearLayers();
  }

  if (parcelasFiltradas.length === 0) {
    if (lblResumenArea)
      lblResumenArea.innerText = "Superficie total mapeada: 0 m²";
    contenedor.innerHTML = `
      <div class="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center space-y-3">
        <span class="text-4xl block">🌱</span>
        <h4 class="text-base font-bold text-slate-200">No hay parcelas registradas en esta vista</h4>
        <p class="text-xs text-slate-400 max-w-md mx-auto">
          Ve al <strong>Gestor de Parcelas</strong> para crear un campo general, delimitar sus parcelas en el mapa y vincular tus sensores.
        </p>
        <a href="/gestion-parcelas.html" class="inline-block bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition">
          🧭 Ir al Gestor de Parcelas
        </a>
      </div>
    `;
    return;
  }

  // Agrupar por Campo General (Fundo)
  const gruposMap = new Map();
  parcelasFiltradas.forEach((p) => {
    const clave = (p.campo_general || "").trim() || "__INDEPENDIENTES__";
    if (!gruposMap.has(clave)) {
      gruposMap.set(clave, []);
    }
    gruposMap.get(clave).push(p);
  });

  const todosLosPuntos = [];
  let areaGlobalM2 = 0;
  contenedor.innerHTML = "";

  gruposMap.forEach((listaGrupo, claveGrupo) => {
    const esCampoNombrado = claveGrupo !== "__INDEPENDIENTES__";
    const tituloGrupo = esCampoNombrado
      ? claveGrupo
      : "Parcelas Independientes";

    let areaGrupoM2 = 0;
    const puntosGrupo = [];

    listaGrupo.forEach((p) => {
      const pol = parsearPoligonoGuardado(p.poligono_json);
      const met = calcularMetricasPoligono(pol);
      const a =
        p.area_m2 && parseFloat(p.area_m2) > 0
          ? parseFloat(p.area_m2)
          : met.areaM2;
      areaGrupoM2 += a;
      areaGlobalM2 += a;

      if (pol.length >= 3) {
        pol.forEach((pt) => {
          puntosGrupo.push(pt);
          todosLosPuntos.push(pt);
        });
      } else if (
        p.latitud !== null &&
        p.longitud !== null &&
        p.latitud !== "" &&
        p.longitud !== ""
      ) {
        const pt = [parseFloat(p.latitud), parseFloat(p.longitud)];
        puntosGrupo.push(pt);
        todosLosPuntos.push(pt);
      }
    });

    // Dibujar envoltura del Campo General en el mapa si tiene nombre y >=3 puntos
    if (esCampoNombrado && puntosGrupo.length >= 3 && capaPoligonosGuardados) {
      const hull = calcularEnvolturaConvexa(puntosGrupo);
      if (hull.length >= 3) {
        const hullLayer = L.polygon(hull, {
          color: "#f59e0b",
          weight: 2.5,
          dashArray: "8, 6",
          fillColor: "#f59e0b",
          fillOpacity: 0.06,
        }).addTo(capaPoligonosGuardados);

        hullLayer.bindPopup(
          `<b>🏡 Campo General: ${tituloGrupo}</b><br>Parcelas: ${listaGrupo.length}<br>Área acumulada: ${Math.round(areaGrupoM2).toLocaleString()} m² (${(areaGrupoM2 / 10000).toFixed(2)} ha)`,
        );
      }
    }

    // Dibujar cada parcela individual en el mapa
    listaGrupo.forEach((p) => {
      const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
      const cultivo = p.cultivo || "General";
      const pol = parsearPoligonoGuardado(p.poligono_json);
      const met = calcularMetricasPoligono(pol);
      const areaM2 =
        p.area_m2 && parseFloat(p.area_m2) > 0
          ? parseFloat(p.area_m2)
          : met.areaM2;

      if (pol.length >= 3 && capaPoligonosGuardados) {
        const polyLayer = L.polygon(pol, {
          color: "#00E5FF",
          weight: 2.5,
          fillColor: "#00E5FF",
          fillOpacity: 0.26,
        }).addTo(capaPoligonosGuardados);

        polyLayer.on("mouseover", () =>
          polyLayer.setStyle({ fillOpacity: 0.42, weight: 3.5 }),
        );
        polyLayer.on("mouseout", () =>
          polyLayer.setStyle({ fillOpacity: 0.26, weight: 2.5 }),
        );

        polyLayer.bindPopup(`
          <div style="min-width:165px;">
            ${esCampoNombrado ? `<div style="font-size:10px;color:#b45309;font-weight:700;">🏡 ${tituloGrupo}</div>` : ""}
            <div style="font-size:13px;font-weight:800;color:#0f172a;">#${p.id} ${nombre}</div>
            <div style="font-size:11px;color:#334155;">🌱 ${cultivo} • ${Math.round(areaM2).toLocaleString()} m²</div>
            <button onclick="verDetalleParcela(${p.id})" style="margin-top:6px;width:100%;background:#0284c7;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;">
              🔍 Ver ficha completa
            </button>
          </div>
        `);
      } else if (
        p.latitud !== null &&
        p.longitud !== null &&
        p.latitud !== "" &&
        p.longitud !== "" &&
        capaPoligonosGuardados
      ) {
        L.circleMarker([parseFloat(p.latitud), parseFloat(p.longitud)], {
          radius: 8,
          fillColor: "#00b4cc",
          color: "#ffffff",
          weight: 2,
          fillOpacity: 0.9,
        })
          .addTo(capaPoligonosGuardados)
          .bindPopup(
            `<b>#${p.id} ${nombre}</b><br>Cultivo: ${cultivo}<br><a href="javascript:void(0)" onclick="verDetalleParcela(${p.id})">🔍 Ver más</a>`,
          );
      }
    });

    // Construir bloque visual del Campo General + Tarjetas de sus parcelas
    const areaGrupoTxt =
      areaGrupoM2 > 0
        ? `${Math.round(areaGrupoM2).toLocaleString()} m² (${(areaGrupoM2 / 10000).toFixed(2)} ha)`
        : "Sin superficie mapeada";

    let tarjetasHtml = "";
    listaGrupo.forEach((p) => {
      const nombre = p.parcela || p.nombre || "Sector";
      const cultivo = p.cultivo || "General";
      const macs = p.lista_macs || p.codigo_mac || "Sin sensor";
      const poligono = parsearPoligonoGuardado(p.poligono_json);
      const metricas = calcularMetricasPoligono(poligono);
      const pulso = pulsoClimaticoMap[p.id] || null;

      const areaM2 =
        p.area_m2 && parseFloat(p.area_m2) > 0
          ? parseFloat(p.area_m2)
          : metricas.areaM2;
      const areaTexto =
        areaM2 > 0
          ? `${Math.round(areaM2).toLocaleString()} m² (${(areaM2 / 10000).toFixed(2)} ha)`
          : "Sin contorno";

      const dimTexto =
        metricas.anchoM > 0 && metricas.altoM > 0
          ? `~${Math.round(metricas.anchoM)}m × ${Math.round(metricas.altoM)}m`
          : "Solo punto GPS";

      const humSueloTxt =
        pulso && pulso.humedad_suelo !== null
          ? `${Number(pulso.humedad_suelo).toFixed(0)}% suelo`
          : "Sin lectura";

      const colorEstado =
        pulso?.estado === "CRITICO"
          ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
          : pulso?.estado === "ATENCION"
            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";

      const svgCroquis = generarSvgSiluetaParcela(poligono);

      tarjetasHtml += `
        <article class="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl flex flex-col justify-between hover:border-slate-500 transition group">
          <div>
            <div class="relative h-36 bg-slate-950 border-b border-slate-700/80 p-2">
              ${svgCroquis}
              <span class="absolute top-3 left-3 bg-slate-900/90 border border-slate-700 text-sky-400 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-lg">
                #${p.id}
              </span>
              <span class="absolute top-3 right-3 border text-[10px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-sm ${colorEstado}">
                💧 ${humSueloTxt}
              </span>
            </div>

            <div class="p-4 space-y-3">
              <div>
                <h4 class="text-base font-bold text-slate-100 group-hover:text-sky-400 transition truncate">
                  ${nombre}
                </h4>
                <p class="text-xs text-slate-400 mt-0.5">
                  🌱 Cultivo: <span class="text-slate-200 font-semibold">${cultivo}</span>
                </p>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/70">
                  <span class="block text-[10px] text-slate-500 uppercase">Superficie</span>
                  <span class="font-mono font-bold text-emerald-400 text-xs">${areaTexto}</span>
                </div>
                <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/70">
                  <span class="block text-[10px] text-slate-500 uppercase">Dimensiones</span>
                  <span class="font-mono font-bold text-slate-200 text-xs">${dimTexto}</span>
                </div>
              </div>

              <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1 gap-2">
                <span class="truncate">📡 <strong class="font-mono text-amber-400">${macs}</strong></span>
                <span class="shrink-0">Umbral: <strong class="text-slate-200">${p.umbral_humedad ?? 35}%</strong></span>
              </div>
            </div>
          </div>

          <div class="px-4 pb-4 pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2">
            <button
              type="button"
              onclick="verDetalleParcela(${p.id})"
              class="flex-grow bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold py-2 px-3 rounded-xl transition shadow flex items-center justify-center gap-1.5"
            >
              <span>🔍 Ver más</span>
            </button>

            <a
              href="/gestion-parcelas.html?editar=${p.id}"
              title="Editar contorno y datos en Gestor de Parcelas"
              class="bg-slate-900 hover:bg-amber-500/20 text-amber-300 border border-slate-700 text-xs font-semibold py-2 px-3 rounded-xl transition"
            >
              ✏️
            </a>
          </div>
        </article>
      `;
    });

    contenedor.innerHTML += `
      <div class="bg-slate-800/45 border ${esCampoNombrado ? "border-amber-500/30" : "border-slate-700/80"} rounded-2xl p-4 md:p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="text-xl">${esCampoNombrado ? "🏡" : "🌱"}</span>
            <div>
              <h4 class="text-base font-extrabold ${esCampoNombrado ? "text-amber-300" : "text-slate-200"}">
                ${tituloGrupo}
              </h4>
              <p class="text-[11px] text-slate-400">
                ${listaGrupo.length} ${listaGrupo.length === 1 ? "parcela integrada" : "parcelas integradas"} • Superficie acumulada: <strong class="text-emerald-400 font-mono">${areaGrupoTxt}</strong>
              </p>
            </div>
          </div>

          <a
            href="/gestion-parcelas.html"
            class="text-[11px] bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg font-semibold transition"
          >
            + Agregar parcela aquí
          </a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          ${tarjetasHtml}
        </div>
      </div>
    `;
  });

  if (lblResumenArea) {
    lblResumenArea.innerText =
      areaGlobalM2 > 0
        ? `Superficie total mapeada: ${Math.round(areaGlobalM2).toLocaleString()} m² (${(areaGlobalM2 / 10000).toFixed(2)} ha)`
        : "Superficie total mapeada: sin contornos definidos";
  }

  ultimoBoundsVista = todosLosPuntos;
  if (todosLosPuntos.length > 0 && mapaParcelas) {
    mapaParcelas.fitBounds(todosLosPuntos, {
      padding: [45, 45],
      maxZoom: 18,
    });
  }
}

// =========================================================================
// 5. MODAL DE DETALLE PROFUNDO ("VER MÁS")
// =========================================================================

async function verDetalleParcela(id) {
  const p = parcelasCache.find((item) => item.id == id);
  if (!p) return;

  const modal = document.getElementById("modalDetalleParcela");
  if (!modal) return;

  const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
  const cultivo = p.cultivo || "General";
  const poligono = parsearPoligonoGuardado(p.poligono_json);
  const metricas = calcularMetricasPoligono(poligono);

  document.getElementById("detalleBadgeId").innerText = `#${p.id}`;

  const badgeCampo = document.getElementById("detalleBadgeCampo");
  if (badgeCampo) {
    if (p.campo_general && p.campo_general.trim() !== "") {
      badgeCampo.innerText = `🏡 ${p.campo_general.trim()}`;
      badgeCampo.classList.remove("hidden");
    } else {
      badgeCampo.classList.add("hidden");
    }
  }

  document.getElementById("detalleTituloParcela").innerText = nombre;
  document.getElementById("detalleSubtituloParcela").innerText =
    `Cultivo: ${cultivo} • Coordenadas: ${p.latitud ?? "--"}, ${p.longitud ?? "--"}`;

  const areaM2 =
    p.area_m2 && parseFloat(p.area_m2) > 0
      ? parseFloat(p.area_m2)
      : metricas.areaM2;
  document.getElementById("detalleArea").innerText =
    areaM2 > 0
      ? `${Math.round(areaM2).toLocaleString()} m² (${(areaM2 / 10000).toFixed(2)} ha)`
      : "No definida";

  document.getElementById("detalleDimensiones").innerText =
    metricas.anchoM > 0
      ? `${Math.round(metricas.anchoM)}m × ${Math.round(metricas.altoM)}m (Perím. ${metricas.perimetroM.toFixed(0)}m)`
      : "Sin contorno poligonal";

  document.getElementById("detalleMac").innerText =
    p.lista_macs || p.codigo_mac || "Sin vincular";

  const modo = p.modo_riego || "AUTO";
  const umbral = p.umbral_humedad ?? 35;
  document.getElementById("detalleModoRiego").innerText =
    modo === "MANUAL_ON"
      ? "💧 Manual Activo"
      : modo === "MANUAL_OFF"
        ? "🛑 Apagado"
        : `🤖 Inteligente (${umbral}%)`;

  const btnClima = document.getElementById("btnIrClimaParcela");
  if (btnClima) btnClima.href = `/clima.html?parcela=${p.id}`;

  const btnEditar = document.getElementById("btnIrEditarParcela");
  if (btnEditar) btnEditar.href = `/gestion-parcelas.html?editar=${p.id}`;

  document.getElementById("detalleSvgContorno").innerHTML =
    generarSvgSiluetaParcela(poligono);
  document.getElementById("detalleBadgePlano2D").innerText =
    poligono.length >= 3 ? `${poligono.length} vértices GPS` : "Punto GPS";

  document.getElementById("detalleHumSuelo").innerText = "-- %";
  document.getElementById("detalleTemp").innerText = "-- °C";
  document.getElementById("detalleHumAire").innerText = "-- %";

  modal.classList.remove("hidden");

  try {
    const [resDiseno, resTel] = await Promise.all([
      fetch(`/api/diseno2d/${p.id}`).catch(() => null),
      fetch(`/api/telemetria?parcela_id=${p.id}`).catch(() => null),
    ]);

    if (resDiseno && resDiseno.ok) {
      const dataD = await resDiseno.json();
      if (dataD.existe && dataD.diseno) {
        document.getElementById("detalleSvgContorno").innerHTML =
          generarSvgSiluetaParcela(poligono, dataD.diseno);
        document.getElementById("detalleBadgePlano2D").innerText =
          `Plano 2D: ${dataD.diseno.ancho_metros}m × ${dataD.diseno.alto_metros}m (${(dataD.diseno.nodos || []).length} nodos)`;
        if (areaM2 <= 0) {
          const area2d = dataD.diseno.ancho_metros * dataD.diseno.alto_metros;
          document.getElementById("detalleArea").innerText =
            `${Math.round(area2d).toLocaleString()} m² (Plano 2D)`;
          document.getElementById("detalleDimensiones").innerText =
            `${dataD.diseno.ancho_metros}m × ${dataD.diseno.alto_metros}m`;
        }
      }
    }

    const lecturas = resTel && resTel.ok ? await resTel.json() : [];
    renderizarGraficaDetalleParcela(Array.isArray(lecturas) ? lecturas : []);
  } catch (e) {
    console.error("Error cargando detalle profundo:", e);
  }
}

function renderizarGraficaDetalleParcela(lecturas) {
  const canvas = document.getElementById("chartDetalleParcela");
  if (!canvas) return;

  if (chartDetalle) {
    chartDetalle.destroy();
    chartDetalle = null;
  }

  if (lecturas.length > 0) {
    const ultima = lecturas[0];
    document.getElementById("detalleHumSuelo").innerText =
      `${ultima.humedad_suelo} %`;
    document.getElementById("detalleTemp").innerText =
      `${ultima.temperatura} °C`;
    document.getElementById("detalleHumAire").innerText =
      `${ultima.humedad_aire ?? "--"} %`;
  }

  const serie = lecturas.slice(0, 12).reverse();
  chartDetalle = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: serie.map((d) =>
        new Date(d.fecha_registro).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      ),
      datasets: [
        {
          label: "Hum. Suelo (%)",
          data: serie.map((d) => d.humedad_suelo),
          borderColor: "#00E5FF",
          tension: 0.35,
          pointRadius: 2.5,
        },
        {
          label: "Temp (°C)",
          data: serie.map((d) => d.temperatura),
          borderColor: "#f59e0b",
          tension: 0.35,
          pointRadius: 2.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#cbd5e1", font: { size: 10 } } },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", font: { size: 9 } },
          grid: { color: "#1e293b" },
        },
        y: {
          ticks: { color: "#94a3b8", font: { size: 9 } },
          grid: { color: "#1e293b" },
        },
      },
    },
  });
}

function cerrarModalDetalle() {
  const modal = document.getElementById("modalDetalleParcela");
  if (modal) modal.classList.add("hidden");
}
