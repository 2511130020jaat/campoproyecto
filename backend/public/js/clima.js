let parcelasClima = [];
let gruposCampos = [];
let campoGeneralActivo = null;
let objetoClimaActivo = null;

let chartTemp = null;
let chartLluvia = null;

// Mapa y capas
let mapaClima = null;
let capaSateliteClima = null;
let capaCalleClima = null;
let esSateliteClima = true;
let capaCampoYParcelas = null;
let marcadorPinExplorado = null;
let capaRadarRainViewer = null;
let radarActivo = false;

const COORD_FALLBACK_CLIMA = [-12.6581, -76.6321];

document.addEventListener("DOMContentLoaded", () => {
  inicializarMapaClima();
  cargarDatosClima();

  document.addEventListener("click", (e) => {
    const lista = document.getElementById("listaResultadosLugar");
    const input = document.getElementById("txtBuscarLugarClima");
    if (lista && !lista.contains(e.target) && e.target !== input) {
      lista.classList.add("hidden");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarModalCurvas();
  });
});

// =========================================================================
// 1. PESTAÑAS SEPARADAS (POR HORAS VS 7 DÍAS)
// =========================================================================

function cambiarTabPronostico(tab) {
  const btnHoras = document.getElementById("btnTabHoras");
  const btnDias = document.getElementById("btnTab7Dias");
  const panelHoras = document.getElementById("panelTabHoras");
  const panelDias = document.getElementById("panelTab7Dias");
  const sub = document.getElementById("lblSubtituloPronostico");

  if (!btnHoras || !btnDias || !panelHoras || !panelDias) return;

  if (tab === "horas") {
    btnHoras.className =
      "px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition";
    btnDias.className =
      "px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition";
    panelHoras.classList.remove("hidden");
    panelDias.classList.add("hidden");
    if (sub)
      sub.innerText = "Intervalos cada 3 horas para planificación diaria";
  } else {
    btnDias.className =
      "px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-slate-950 transition";
    btnHoras.className =
      "px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition";
    panelDias.classList.remove("hidden");
    panelHoras.classList.add("hidden");
    if (sub) sub.innerText = "Tendencia semanal de temperatura y precipitación";
  }
}

// =========================================================================
// 2. MAPA DE CAMPO GENERAL, PARCELAS Y RADAR RAINVIEWER
// =========================================================================

function inicializarMapaClima() {
  const contenedor = document.getElementById("mapaClima");
  if (!contenedor || typeof L === "undefined") return;

  mapaClima = L.map("mapaClima", {
    maxZoom: 20,
  }).setView(COORD_FALLBACK_CLIMA, 14);

  capaSateliteClima = L.tileLayer(
    "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    {
      maxZoom: 20,
      attribution: "© Google Satélite",
    },
  ).addTo(mapaClima);

  capaCalleClima = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    },
  );

  capaCampoYParcelas = L.layerGroup().addTo(mapaClima);

  mapaClima.on("click", (e) => {
    const lat = parseFloat(e.latlng.lat.toFixed(5));
    const lon = parseFloat(e.latlng.lng.toFixed(5));
    colocarPinExplorado(lat, lon, "Punto explorado en mapa");
  });

  setTimeout(() => {
    if (mapaClima) mapaClima.invalidateSize();
  }, 250);

  cargarCapaRadarRainViewer();
}

async function cargarCapaRadarRainViewer() {
  if (!mapaClima) return;
  try {
    const res = await fetch(
      "https://api.rainviewer.com/public/weather-maps.json",
    );
    const data = await res.json();
    const past = data?.radar?.past || [];
    if (past.length === 0) return;

    const ultimoFrame = past[past.length - 1];
    const host = data.host || "https://tilecache.rainviewer.com";
    const tileUrl = `${host}${ultimoFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;

    if (capaRadarRainViewer) {
      mapaClima.removeLayer(capaRadarRainViewer);
    }

    capaRadarRainViewer = L.tileLayer(tileUrl, {
      maxNativeZoom: 7,
      maxZoom: 20,
      opacity: 0.45,
      zIndex: 25,
      attribution: "RainViewer",
    });

    if (radarActivo) {
      capaRadarRainViewer.addTo(mapaClima);
    }
  } catch (e) {}
}

function alternarRadarLluvia() {
  const btn = document.getElementById("btnToggleRadar");
  radarActivo = !radarActivo;

  if (mapaClima && capaRadarRainViewer) {
    if (radarActivo) {
      capaRadarRainViewer.addTo(mapaClima);
    } else {
      mapaClima.removeLayer(capaRadarRainViewer);
    }
  }

  if (btn) {
    if (radarActivo) {
      btn.className =
        "bg-cyan-600/85 hover:bg-cyan-500 text-white border border-cyan-400/50 text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5";
      btn.innerHTML = "<span>🌧️</span> Radar: ON";
    } else {
      btn.className =
        "asir-subcard hover:border-cyan-400/50 text-slate-300 text-xs px-3 py-1.5 rounded-xl border font-semibold transition flex items-center gap-1.5";
      btn.innerHTML = "<span>🌧️</span> Radar: OFF";
    }
  }
}

function alternarCapaMapaClima() {
  const btn = document.getElementById("btnCapaMapaClima");
  if (!mapaClima) return;

  if (esSateliteClima) {
    mapaClima.removeLayer(capaSateliteClima);
    capaCalleClima.addTo(mapaClima);
    if (btn) btn.innerText = "🛰️ Satélite";
    esSateliteClima = false;
  } else {
    mapaClima.removeLayer(capaCalleClima);
    capaSateliteClima.addTo(mapaClima);
    if (btn) btn.innerText = "🗺️ Calles";
    esSateliteClima = true;
  }
}

function colocarPinExplorado(lat, lon, nombreOrigen) {
  if (mapaClima) {
    if (!marcadorPinExplorado) {
      marcadorPinExplorado = L.circleMarker([lat, lon], {
        radius: 9,
        color: "#22d3ee",
        weight: 3,
        fillColor: "#00E5FF",
        fillOpacity: 0.45,
      }).addTo(mapaClima);
    } else {
      marcadorPinExplorado.setLatLng([lat, lon]);
    }
    marcadorPinExplorado
      .bindTooltip("📍 Punto explorado", {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "asir-map-label",
      })
      .openTooltip();
  }

  const btnLimpiar = document.getElementById("btnLimpiarPin");
  if (btnLimpiar) btnLimpiar.classList.remove("hidden");

  consultarClimaPorCoordenadas(lat, lon, nombreOrigen);
}

function limpiarPinExplorado() {
  if (mapaClima && marcadorPinExplorado) {
    mapaClima.removeLayer(marcadorPinExplorado);
    marcadorPinExplorado = null;
  }
  const btnLimpiar = document.getElementById("btnLimpiarPin");
  if (btnLimpiar) btnLimpiar.classList.add("hidden");

  irAMiCampo();
}

function dibujarCamposYParcelasEnMapa(parcelaResaltadaId = null) {
  if (!capaCampoYParcelas || !mapaClima) return;
  capaCampoYParcelas.clearLayers();

  const grupos = {};
  parcelasClima.forEach((p) => {
    const nombreCampo = p.campo_general || "Campo Principal";
    if (!grupos[nombreCampo]) grupos[nombreCampo] = [];
    grupos[nombreCampo].push(p);
  });

  Object.entries(grupos).forEach(([nombreCampo, listaParcelas]) => {
    const puntosCampo = [];

    listaParcelas.forEach((p) => {
      let pol = [];
      try {
        pol = p.poligono_json
          ? typeof p.poligono_json === "string"
            ? JSON.parse(p.poligono_json)
            : p.poligono_json
          : [];
      } catch (e) {}

      const esSeleccionada =
        parcelaResaltadaId && String(p.id) === String(parcelaResaltadaId);

      let colorBorde = "#00E5FF";
      let motivoTxt = "Óptimo";
      if (p.estado === "CRITICO") {
        colorBorde = "#f43f5e";
        motivoTxt = `Déficit (<${p.umbral_humedad}%)`;
      } else if (p.estado === "ATENCION") {
        colorBorde = "#00b4cc";
        motivoTxt = "Atención";
      }
      if (esSeleccionada) colorBorde = "#22d3ee";

      const humTxt =
        p.humedad_suelo !== null && p.humedad_suelo !== undefined
          ? `${Math.round(p.humedad_suelo)}% hum • ${motivoTxt}`
          : "Sin sensor";

      if (Array.isArray(pol) && pol.length >= 3) {
        pol.forEach((pt) => puntosCampo.push(pt));

        const polyLayer = L.polygon(pol, {
          color: colorBorde,
          weight: esSeleccionada ? 3 : 2,
          fillColor: colorBorde,
          fillOpacity: esSeleccionada ? 0.36 : 0.18,
        }).addTo(capaCampoYParcelas);

        polyLayer.bindTooltip(`🌱 ${p.parcela} (${humTxt})`, {
          permanent: Boolean(esSeleccionada),
          direction: "center",
          className: "asir-map-label",
        });

        polyLayer.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (marcadorPinExplorado) {
            mapaClima.removeLayer(marcadorPinExplorado);
            marcadorPinExplorado = null;
          }
          const btnLimpiar = document.getElementById("btnLimpiarPin");
          if (btnLimpiar) btnLimpiar.classList.add("hidden");

          const sel = document.getElementById("selParcelaClima");
          if (sel) {
            sel.value = `PARCELA:${p.id}`;
            cambiarSeleccionClima();
          }
        });
      } else if (p.latitud !== null && p.longitud !== null) {
        const pt = [parseFloat(p.latitud), parseFloat(p.longitud)];
        puntosCampo.push(pt);
        L.circleMarker(pt, {
          radius: 7,
          color: colorBorde,
          fillColor: colorBorde,
          fillOpacity: 0.6,
        })
          .addTo(capaCampoYParcelas)
          .bindTooltip(`🌱 ${p.parcela} (${humTxt})`, {
            permanent: Boolean(esSeleccionada),
            direction: "top",
            className: "asir-map-label",
          });
      }
    });

    if (puntosCampo.length >= 2) {
      const boundsCampo = L.latLngBounds(puntosCampo).pad(0.18);
      L.rectangle(boundsCampo, {
        color: "#00E5FF",
        weight: 1.5,
        dashArray: "6, 6",
        fillColor: "#00E5FF",
        fillOpacity: 0.03,
        interactive: false,
      })
        .addTo(capaCampoYParcelas)
        .bindTooltip(`🏡 ${nombreCampo}`, {
          permanent: !parcelaResaltadaId,
          direction: "top",
          className: "asir-map-label",
        });
    }
  });
}

function enfocarEnMapa(parcelaId = null, campoNombre = null) {
  if (!mapaClima || parcelasClima.length === 0) return;

  let objetivo = parcelasClima;
  if (parcelaId) {
    objetivo = parcelasClima.filter((p) => String(p.id) === String(parcelaId));
  } else if (campoNombre) {
    objetivo = parcelasClima.filter(
      (p) => (p.campo_general || "Campo Principal") === campoNombre,
    );
  }

  const puntos = [];
  objetivo.forEach((p) => {
    let pol = [];
    try {
      pol = p.poligono_json
        ? typeof p.poligono_json === "string"
          ? JSON.parse(p.poligono_json)
          : p.poligono_json
        : [];
    } catch (e) {}

    if (Array.isArray(pol) && pol.length >= 3) {
      pol.forEach((pt) => puntos.push(pt));
    } else if (p.latitud !== null && p.longitud !== null) {
      puntos.push([parseFloat(p.latitud), parseFloat(p.longitud)]);
    }
  });

  if (puntos.length > 0) {
    const bounds = L.latLngBounds(puntos);
    mapaClima.fitBounds(bounds, { padding: [45, 45], maxZoom: 17 });
  }
}

function irAMiCampo() {
  if (marcadorPinExplorado && mapaClima) {
    mapaClima.removeLayer(marcadorPinExplorado);
    marcadorPinExplorado = null;
  }
  const btnLimpiar = document.getElementById("btnLimpiarPin");
  if (btnLimpiar) btnLimpiar.classList.add("hidden");

  if (parcelasClima.length === 0) {
    usarUbicacionGPS(false);
    return;
  }

  const campoObjetivo =
    campoGeneralActivo || parcelasClima[0].campo_general || "Campo Principal";

  const sel = document.getElementById("selParcelaClima");
  if (sel) {
    const valCampo = `CAMPO:${campoObjetivo}`;
    if (Array.from(sel.options).some((o) => o.value === valCampo)) {
      sel.value = valCampo;
    } else {
      sel.value = `PARCELA:${parcelasClima[0].id}`;
    }
  }

  cambiarSeleccionClima();
}

// =========================================================================
// 3. CARGA DE CAMPOS GENERALES, PARCELAS, GPS Y BÚSQUEDA
// =========================================================================

async function cargarDatosClima() {
  if (typeof usuarioSesion === "undefined" || !usuarioSesion) return;

  const select = document.getElementById("selParcelaClima");
  try {
    const res = await fetch("/api/alertas-agro/" + usuarioSesion.id);
    const data = await res.json();
    parcelasClima = Array.isArray(data) ? data : [];

    const mapaGrupos = new Map();
    parcelasClima.forEach((p) => {
      const cg = p.campo_general || "Campo Principal";
      if (!mapaGrupos.has(cg)) mapaGrupos.set(cg, []);
      mapaGrupos.get(cg).push(p);
    });
    gruposCampos = Array.from(mapaGrupos.entries()).map(
      ([nombre, parcelas]) => ({
        nombre,
        parcelas,
      }),
    );

    dibujarCamposYParcelasEnMapa();

    if (!select) return;

    if (parcelasClima.length === 0) {
      select.innerHTML =
        '<option value="__GPS__">📍 Ubicación GPS / Mapa</option>';
      usarUbicacionGPS(true);
      return;
    }

    let htmlOpciones = "";
    gruposCampos.forEach((g) => {
      htmlOpciones += `<optgroup label="🏡 ${g.nombre}">`;
      htmlOpciones += `<option value="CAMPO:${g.nombre}">🏡 Todo ${g.nombre} (${g.parcelas.length} lotes)</option>`;
      g.parcelas.forEach((p) => {
        htmlOpciones += `<option value="PARCELA:${p.id}">   🌱 ${p.parcela} (${p.cultivo || "Cultivo"})</option>`;
      });
      htmlOpciones += `</optgroup>`;
    });
    select.innerHTML = htmlOpciones;

    const paramsUrl = new URLSearchParams(window.location.search);
    const parcelaUrl = paramsUrl.get("parcela");

    if (
      parcelaUrl &&
      parcelasClima.some((p) => String(p.id) === String(parcelaUrl))
    ) {
      select.value = `PARCELA:${parcelaUrl}`;
    } else {
      select.value = `CAMPO:${gruposCampos[0].nombre}`;
    }

    cambiarSeleccionClima();
  } catch (err) {
    console.error("Error cargando pronóstico climático:", err);
  }
}

function cambiarSeleccionClima() {
  const select = document.getElementById("selParcelaClima");
  if (!select) return;

  const val = select.value;
  if (val === "__GPS__") {
    usarUbicacionGPS(false);
    return;
  }

  if (val.startsWith("CAMPO:")) {
    const nombreCampo = val.slice(6);
    campoGeneralActivo = nombreCampo;
    const grupo =
      gruposCampos.find((g) => g.nombre === nombreCampo) || gruposCampos[0];
    if (!grupo || grupo.parcelas.length === 0) return;

    const pBase = grupo.parcelas[0];
    dibujarCamposYParcelasEnMapa(null);
    enfocarEnMapa(null, nombreCampo);

    renderizarWidgetClima({
      ...pBase,
      fuenteBadge: `🏡 ${nombreCampo} (${grupo.parcelas.length} parcelas)`,
      subtituloCampo: `Lotes: ${grupo.parcelas.map((x) => x.parcela).join(" • ")}`,
    });
    return;
  }

  if (val.startsWith("PARCELA:")) {
    const idP = val.slice(8);
    const parcela =
      parcelasClima.find((p) => String(p.id) === String(idP)) ||
      parcelasClima[0];
    if (!parcela) return;

    campoGeneralActivo = parcela.campo_general || "Campo Principal";
    dibujarCamposYParcelasEnMapa(parcela.id);
    enfocarEnMapa(parcela.id, null);

    renderizarWidgetClima({
      ...parcela,
      fuenteBadge: `🌱 ${parcela.parcela} • ${campoGeneralActivo}`,
      subtituloCampo: `Cultivo: ${parcela.cultivo || "General"} • Umbral mínimo: ${parcela.umbral_humedad}%`,
    });
  }
}

function recargarClimaActual() {
  if (marcadorPinExplorado && objetoClimaActivo?.coordenadas) {
    const { lat, lon } = objetoClimaActivo.coordenadas;
    consultarClimaPorCoordenadas(lat, lon, "Punto explorado en mapa");
  } else {
    cargarDatosClima();
  }
  cargarCapaRadarRainViewer();
}

function usarUbicacionGPS(silencioso = false) {
  if (!navigator.geolocation) {
    if (!silencioso) alert("Tu navegador no soporta GPS.");
    if (parcelasClima.length > 0) irAMiCampo();
    return;
  }

  const lblUbi = document.getElementById("lblUbicacionGeografica");
  if (lblUbi) lblUbi.innerText = "🛰️ Localizando GPS...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = parseFloat(pos.coords.latitude.toFixed(5));
      const lon = parseFloat(pos.coords.longitude.toFixed(5));
      if (mapaClima) mapaClima.setView([lat, lon], 15);
      colocarPinExplorado(lat, lon, "Mi ubicación GPS");
    },
    () => {
      if (!silencioso) {
        alert(
          "No se pudo obtener el GPS. Usa el buscador o haz clic en el mapa.",
        );
      }
      if (parcelasClima.length > 0) {
        irAMiCampo();
      } else {
        consultarClimaPorCoordenadas(
          COORD_FALLBACK_CLIMA[0],
          COORD_FALLBACK_CLIMA[1],
          "Zona de referencia",
        );
      }
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
}

async function consultarClimaPorCoordenadas(lat, lon, nombreOrigen) {
  try {
    const res = await fetch(
      `/api/clima/coordenadas?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error consultando clima");

    renderizarWidgetClima({
      id: null,
      parcela: data.ubicacion?.distrito || nombreOrigen,
      umbral_humedad: 35,
      fuenteBadge: `📍 ${nombreOrigen}`,
      subtituloCampo:
        "Punto externo • Pulsa 'Quitar pin' o 'Ir a Mi Campo' para volver",
      coordenadas: data.coordenadas || { lat, lon },
      ubicacion: data.ubicacion,
      clima: data.clima,
      ultimas_12h: data.ultimas_12h || [],
      proximas_24h: data.proximas_24h || [],
      pronostico_6h: data.pronostico_6h || {},
      microclima: data.microclima || {},
    });
  } catch (err) {
    console.error("Error consultando clima puntual:", err);
  }
}

async function buscarLugarClima() {
  const input = document.getElementById("txtBuscarLugarClima");
  const lista = document.getElementById("listaResultadosLugar");
  const q = (input?.value || "").trim();
  if (!q || !lista) return;

  lista.classList.remove("hidden");
  lista.innerHTML =
    '<div class="p-2.5 text-xs text-slate-400">Buscando distrito...</div>';

  try {
    const res = await fetch(
      `/api/clima/buscar-lugar?q=${encodeURIComponent(q)}`,
    );
    const resultados = await res.json();

    if (!Array.isArray(resultados) || resultados.length === 0) {
      lista.innerHTML =
        '<div class="p-2.5 text-xs text-slate-500">Sin resultados.</div>';
      return;
    }

    lista.innerHTML = resultados
      .map(
        (r) => `
        <button
          type="button"
          onclick="seleccionarLugarBuscado(${r.lat}, ${r.lon}, '${r.nombre.replace(/'/g, "\\'")}')"
          class="w-full text-left px-3 py-2 hover:bg-slate-900 transition block"
        >
          <div class="text-xs font-bold text-cyan-300">📍 ${r.nombre}</div>
          <div class="text-[10px] text-slate-400 truncate">${r.etiqueta}</div>
        </button>
      `,
      )
      .join("");
  } catch (e) {
    lista.innerHTML =
      '<div class="p-2.5 text-xs text-rose-400">Error de red.</div>';
  }
}

function seleccionarLugarBuscado(lat, lon, nombre) {
  const lista = document.getElementById("listaResultadosLugar");
  const input = document.getElementById("txtBuscarLugarClima");
  if (lista) lista.classList.add("hidden");
  if (input) input.value = nombre;
  if (mapaClima) mapaClima.setView([lat, lon], 14);
  colocarPinExplorado(lat, lon, `Búsqueda: ${nombre}`);
}

// =========================================================================
// 4. RENDERIZADO LIMPIO DE CLIMA ACTUAL Y PRONÓSTICO
// =========================================================================

function iconoHorarioClima(horaStr, probLluvia, lluviaMm, temp, nube, esGarua) {
  const horaNum = parseInt((horaStr || "12:00").split(":")[0], 10);
  const esNoche = horaNum < 6 || horaNum >= 19;

  if (probLluvia >= 70 || lluviaMm >= 1.5) return "⛈️";
  if (probLluvia >= 40 || lluviaMm >= 0.4) return "🌧️";
  if (esGarua) return "🌦️";
  if (nube >= 75) return "☁️";
  if (nube >= 35 || probLluvia >= 20) return esNoche ? "☁️" : "⛅";
  if (esNoche) return "🌙";
  if (temp >= 29) return "☀️";
  return "🌤️";
}

function renderizarWidgetClima(datos) {
  objetoClimaActivo = datos;

  const current = datos.clima?.current || {};
  const daily = datos.clima?.daily || {};
  const p6 = datos.pronostico_6h || {};
  const micro = datos.microclima || {};
  const horas = Array.isArray(datos.proximas_24h) ? datos.proximas_24h : [];
  const idxHoy = daily.temperature_2m_max?.length > 1 ? 1 : 0;

  const rawCurrTime = String(current.time || "");
  const horaEstacion = rawCurrTime.includes("T")
    ? rawCurrTime.split("T")[1].slice(0, 5)
    : new Date().toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
      });

  document.getElementById("badgeFuenteUbicacion").innerText =
    datos.fuenteBadge || "🏡 Campo Activo";
  document.getElementById("lblHoraActualizacion").innerText =
    `Hoy ${horaEstacion} hrs`;
  document.getElementById("lblUbicacionGeografica").innerText =
    datos.ubicacion?.etiqueta || datos.parcela || "Sector Agrícola";
  document.getElementById("lblSubtituloCampo").innerText =
    datos.subtituloCampo || "";

  const tempAct =
    current.temperature_2m !== undefined
      ? Math.round(current.temperature_2m)
      : "--";
  const tMin =
    daily.temperature_2m_min?.[idxHoy] !== undefined
      ? Math.round(daily.temperature_2m_min[idxHoy])
      : "--";
  const tMax =
    daily.temperature_2m_max?.[idxHoy] !== undefined
      ? Math.round(daily.temperature_2m_max[idxHoy])
      : "--";
  const hrAct =
    current.relative_humidity_2m !== undefined
      ? Math.round(current.relative_humidity_2m)
      : "--";

  const hora0 = horas[0] || {};
  document.getElementById("iconoHeroClima").innerText = iconoHorarioClima(
    hora0.hora,
    hora0.prob_lluvia ?? 0,
    hora0.lluvia_mm ?? 0,
    Number(current.temperature_2m ?? 22),
    micro.nubosidad_actual ?? 0,
    micro.garua_detectada,
  );
  document.getElementById("kpiTempActual").innerText = tempAct;
  document.getElementById("kpiSubTemp").innerText =
    `Mín ${tMin}° / Máx ${tMax}° • HR ${hrAct}%`;

  const badge = document.getElementById("badgeDecisionClima");
  const alertaCorta = document.getElementById("txtAlertaHeroCorta");
  const consejo = document.getElementById("txtConsejoRiegoClima");

  if (p6.lluviaInminente) {
    badge.className =
      "inline-block bg-cyan-500/20 text-cyan-300 border border-cyan-400/45 text-[11px] font-bold px-3 py-0.5 rounded-full";
    badge.innerText = "🌧️ Lluvia prevista";
    alertaCorta.innerText = `${p6.maxProb6h}% prob. en ${p6.horasHastaLluvia}h`;
    consejo.innerText = `Lluvia en camino (${p6.totalMm6h} mm): riego automático en pausa para ahorrar agua.`;
  } else if (micro.garua_detectada || micro.llovio_madrugada) {
    badge.className =
      "inline-block bg-teal-500/20 text-teal-300 border border-teal-400/45 text-[11px] font-bold px-3 py-0.5 rounded-full";
    badge.innerText = "🌦️ Garúa / Humedad";
    alertaCorta.innerText = micro.llovio_madrugada
      ? `Madrugada: ${micro.lluvia_12h_mm} mm`
      : "Llovizna fina / niebla";
    consejo.innerText = `Humedad ambiental alta (${hrAct}% HR): revisa el sensor del suelo antes de añadir riego manual.`;
  } else if (micro.sol_intermitente) {
    badge.className =
      "inline-block bg-amber-500/20 text-amber-300 border border-amber-400/45 text-[11px] font-bold px-3 py-0.5 rounded-full";
    badge.innerText = "⛅ Sol intermitente";
    alertaCorta.innerText = `Nubosidad ${micro.nubosidad_actual}%`;
    consejo.innerText = `Nubes variables durante el día: el riego automático operará según la humedad real de la raíz.`;
  } else {
    badge.className =
      "inline-block bg-emerald-500/20 text-emerald-300 border border-emerald-400/45 text-[11px] font-bold px-3 py-0.5 rounded-full";
    badge.innerText = "● Riego habilitado";
    alertaCorta.innerText = `Lluvia 6h: ${p6.maxProb6h || 0}%`;
    consejo.innerText = `Sin lluvias próximas: turnos automáticos activos cuando la humedad baje del umbral.`;
  }

  // Pestaña 1: 6 tarjetas horarias amplias a ancho completo (cada 3h)
  const gridH = document.getElementById("gridHorariaWidget");
  if (gridH) {
    const bloquesH = [];
    for (let i = 0; i < horas.length && bloquesH.length < 6; i += 3) {
      bloquesH.push(horas[i]);
    }
    gridH.innerHTML = bloquesH
      .map((h, idx) => {
        const ico = iconoHorarioClima(
          h.hora,
          h.prob_lluvia,
          h.lluvia_mm,
          h.temperatura,
          h.nubosidad,
          h.es_garua,
        );
        return `
          <div class="asir-subcard rounded-2xl py-4 px-3 border ${idx === 0 ? "border-emerald-400/60" : ""}">
            <p class="text-xs font-mono ${idx === 0 ? "text-emerald-300 font-bold" : "text-slate-400"}">
              ${idx === 0 ? "Ahora (" + h.hora + ")" : h.hora}
            </p>
            <div class="text-3xl my-2.5">${ico}</div>
            <p class="text-base font-extrabold text-white">${Math.round(h.temperatura)}°C</p>
            <p class="text-xs text-cyan-300 font-semibold mt-1">💧 ${Math.round(h.prob_lluvia)}%</p>
          </div>
        `;
      })
      .join("");
  }

  // Pestaña 2: 7 tarjetas horizontales de los próximos 7 días
  const lista7 = document.getElementById("lista7DiasLimpia");
  if (lista7 && Array.isArray(daily.time)) {
    const nombresDias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const dias7 = daily.time.slice(idxHoy, idxHoy + 7);

    lista7.innerHTML = dias7
      .map((fStr, off) => {
        const i = idxHoy + off;
        const d = new Date(fStr + "T12:00:00");
        const nom =
          off === 0 ? "Hoy" : `${nombresDias[d.getDay()]} ${d.getDate()}`;
        const maxD = Math.round(daily.temperature_2m_max?.[i] ?? 0);
        const minD = Math.round(daily.temperature_2m_min?.[i] ?? 0);
        const probD = Math.round(daily.precipitation_probability_max?.[i] ?? 0);
        const ico =
          probD >= 65 ? "🌧️" : probD >= 30 ? "⛅" : maxD >= 29 ? "☀️" : "🌤️";

        return `
          <div class="asir-subcard rounded-2xl py-3.5 px-2.5 border ${off === 0 ? "border-cyan-400/55" : ""}">
            <p class="text-xs font-bold ${off === 0 ? "text-cyan-300" : "text-slate-200"}">${nom}</p>
            <div class="text-3xl my-2">${ico}</div>
            <p class="text-sm font-extrabold text-white">
              <span class="text-slate-400 font-normal text-xs">${minD}°</span> / ${maxD}°
            </p>
            <p class="text-xs text-cyan-300 font-semibold mt-1">💧 ${probD}%</p>
          </div>
        `;
      })
      .join("");
  }

  const txtSen = document.getElementById("txtResumenSenamhi");
  if (txtSen) {
    if (p6.lluviaInminente) {
      txtSen.innerHTML = `Aviso de lluvia • <span class="text-cyan-300 font-bold">${p6.maxProb6h}% (${p6.totalMm6h} mm)</span>`;
    } else if (micro.garua_detectada) {
      txtSen.innerHTML = `Garúa costera • <span class="text-teal-300 font-bold">Humedad ${hrAct}%</span>`;
    } else {
      txtSen.innerHTML = `Avisos agrometeorológicos • <span class="text-emerald-300 font-bold">Estable (${tMin}°–${tMax}°C)</span>`;
    }
  }
}

// =========================================================================
// 5. MODAL DE CURVAS HORARIAS Y DATOS TÉCNICOS FECHADOS
// =========================================================================

function abrirModalCurvas() {
  const modal = document.getElementById("modalCurvasClima");
  if (!modal || !objetoClimaActivo) return;

  modal.classList.remove("hidden");

  const current = objetoClimaActivo.clima?.current || {};
  const daily = objetoClimaActivo.clima?.daily || {};
  const micro = objetoClimaActivo.microclima || {};
  const ultimas12 = objetoClimaActivo.ultimas_12h || [];
  const idxHoy = daily.temperature_2m_max?.length > 1 ? 1 : 0;

  const rawCurrTime = String(current.time || "");
  const horaRef = rawCurrTime.includes("T")
    ? rawCurrTime.split("T")[1].slice(0, 5)
    : "Actual";
  const fechaHoy = daily.time?.[idxHoy] || "Hoy";
  const horaInicio12h = ultimas12[0]?.hora || "hace 12h";

  const titulo = document.getElementById("tituloModalCurvas");
  if (titulo) {
    titulo.innerText = `📊 Detalle Técnico — ${objetoClimaActivo.ubicacion?.etiqueta || objetoClimaActivo.parcela}`;
  }

  document.getElementById("modalValLluvia12h").innerText =
    `${micro.lluvia_12h_mm ?? 0} mm`;
  document.getElementById("modalLblLluvia12h").innerText =
    `De ${horaInicio12h} a ${horaRef} hrs`;

  document.getElementById("modalValRadiacion").innerText =
    `${micro.radiacion_actual ?? 0} W/m²`;
  document.getElementById("modalLblRadiacion").innerText =
    `Medición ${fechaHoy} (${horaRef})`;

  const et0 =
    daily.et0_fao_evapotranspiration?.[idxHoy] !== undefined
      ? `${Number(daily.et0_fao_evapotranspiration[idxHoy]).toFixed(1)} mm/día`
      : "-- mm/día";
  document.getElementById("modalValEt0").innerText = et0;
  document.getElementById("modalLblEt0").innerText =
    `Proyección del día (${fechaHoy})`;

  const viento =
    current.wind_speed_10m !== undefined
      ? `${Math.round(current.wind_speed_10m)} km/h`
      : "-- km/h";
  document.getElementById("modalValViento").innerText = viento;
  document.getElementById("modalLblViento").innerText =
    `Medición ${fechaHoy} (${horaRef})`;

  const horas = (objetoClimaActivo.proximas_24h || []).slice(0, 24);
  const labels = horas.map((h) => h.hora);
  const temps = horas.map((h) => h.temperatura);
  const probs = horas.map((h) => h.prob_lluvia);
  const nubes = horas.map((h) => h.nubosidad ?? 0);

  const canvasTemp = document.getElementById("chartTemperatura24h");
  const canvasLluvia = document.getElementById("chartLluvia24h");

  if (canvasTemp) {
    if (chartTemp) chartTemp.destroy();
    const ctxT = canvasTemp.getContext("2d");
    const grad = ctxT.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, "rgba(0, 229, 255, 0.18)");
    grad.addColorStop(1, "rgba(0, 229, 255, 0.0)");

    chartTemp = new Chart(ctxT, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Temperatura (°C)",
            data: temps,
            borderColor: "#00E5FF",
            backgroundColor: grad,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: "#00E5FF",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#4a6878", maxRotation: 0, maxTicksLimit: 8 },
            grid: { color: "rgba(148, 163, 184, 0.15)" },
          },
          y: {
            ticks: { color: "#00E5FF", callback: (v) => v + "°C" },
            grid: { color: "rgba(148, 163, 184, 0.15)" },
          },
        },
      },
    });
  }

  if (canvasLluvia) {
    if (chartLluvia) chartLluvia.destroy();
    const ctxL = canvasLluvia.getContext("2d");

    chartLluvia = new Chart(ctxL, {
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Lluvia (%)",
            data: probs,
            backgroundColor: "rgba(0, 229, 255, 0.55)",
            borderColor: "#00E5FF",
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            type: "line",
            label: "Nubosidad (%)",
            data: nubes,
            borderColor: "#4a6878",
            borderWidth: 1.5,
            borderDash: [4, 4],
            tension: 0.35,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#4a6878", maxRotation: 0, maxTicksLimit: 8 },
            grid: { color: "rgba(148, 163, 184, 0.15)" },
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: "#00E5FF", stepSize: 25, callback: (v) => v + "%" },
            grid: { color: "rgba(148, 163, 184, 0.15)" },
          },
        },
      },
    });
  }
}

function cerrarModalCurvas() {
  const modal = document.getElementById("modalCurvasClima");
  if (modal) modal.classList.add("hidden");
}
