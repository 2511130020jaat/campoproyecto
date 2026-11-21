let mapaGestion = null;
let marcadorSeleccion = null;
let capaSatelite = null;
let capaCalle = null;
let esSatelite = true;
let capaParcelasReferencia = null;
let parcelasCache = [];
let boundsGuardados = [];

// Variables de dibujo activo
let modoMapa = "POLIGONO";
let verticesActivos = [];
let marcadoresVertices = [];
let poligonoActivoLayer = null;
let areaCalculadaM2 = 0;

const COORD_DEFECTO = [-12.6581, -76.6321];

document.addEventListener("DOMContentLoaded", () => {
  inicializarMapaGestion();
  cargarParcelasGestion();
});

// =========================================================================
// 1. MAPA SATELITAL DE EDICIÓN Y CAPAS DE REFERENCIA
// =========================================================================

function inicializarMapaGestion() {
  const contenedor = document.getElementById("mapaGestionParcelas");
  if (!contenedor) return;

  mapaGestion = L.map("mapaGestionParcelas", {
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

  capaSatelite.addTo(mapaGestion);
  capaParcelasReferencia = L.layerGroup().addTo(mapaGestion);

  mapaGestion.on("click", (e) => {
    const lat = parseFloat(e.latlng.lat.toFixed(7));
    const lng = parseFloat(e.latlng.lng.toFixed(7));

    if (modoMapa === "POLIGONO") {
      agregarVerticePoligono(lat, lng);
    } else {
      fijarPuntoSeleccionado(lat, lng, false);
    }
  });
}

function alternarCapaMapa() {
  const btn = document.getElementById("btnCapaMapa");
  if (!mapaGestion) return;

  if (esSatelite) {
    mapaGestion.removeLayer(capaSatelite);
    capaCalle.addTo(mapaGestion);
    if (btn) btn.innerText = "🛰️ Vista Satélite";
    esSatelite = false;
  } else {
    mapaGestion.removeLayer(capaCalle);
    capaSatelite.addTo(mapaGestion);
    if (btn) btn.innerText = "🗺️ Vista Calles";
    esSatelite = true;
  }
}

function centrarEnParcelasGuardadas() {
  if (!mapaGestion) return;
  if (boundsGuardados.length > 0) {
    mapaGestion.fitBounds(boundsGuardados, { padding: [45, 45], maxZoom: 18 });
  } else {
    mapaGestion.setView(COORD_DEFECTO, 15);
  }
}

function cambiarModoMapa(nuevoModo) {
  modoMapa = nuevoModo;
  const btnPol = document.getElementById("btnModoPoligono");
  const btnPto = document.getElementById("btnModoPunto");
  const estado = document.getElementById("estadoEditorMapa");

  if (nuevoModo === "POLIGONO") {
    btnPol.className =
      "bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow";
    btnPto.className =
      "bg-slate-900 text-slate-300 hover:text-white border border-slate-700 text-xs px-3 py-1.5 rounded-lg font-semibold transition";
    if (estado) {
      estado.innerText = "Modo: Trazado de contorno activo";
      estado.className = "text-xs font-semibold text-emerald-400";
    }
  } else {
    btnPto.className =
      "bg-sky-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow";
    btnPol.className =
      "bg-slate-900 text-slate-300 hover:text-white border border-slate-700 text-xs px-3 py-1.5 rounded-lg font-semibold transition";
    if (estado) {
      estado.innerText = "Modo: Marcador GPS puntual";
      estado.className = "text-xs font-semibold text-sky-400";
    }
  }
}

function agregarVerticePoligono(lat, lng) {
  verticesActivos.push([lat, lng]);
  redibujarPoligonoActivo();
}

function deshacerUltimoVertice() {
  if (verticesActivos.length === 0) return;
  verticesActivos.pop();
  redibujarPoligonoActivo();
}

function limpiarPoligonoActual() {
  verticesActivos = [];
  redibujarPoligonoActivo();
}

// =========================================================================
// 2. CÁLCULOS GEOMÉTRICOS DE ÁREA, PERÍMETRO Y ENVOLTURA
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

function redibujarPoligonoActivo() {
  marcadoresVertices.forEach((m) => mapaGestion.removeLayer(m));
  marcadoresVertices = [];

  if (poligonoActivoLayer) {
    mapaGestion.removeLayer(poligonoActivoLayer);
    poligonoActivoLayer = null;
  }

  verticesActivos.forEach((coord, idx) => {
    const iconoVertice = L.divIcon({
      className: "",
      html: '<div style="width:14px;height:14px;background:#10b981;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 6px #000;cursor:move;"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const mk = L.marker(coord, { draggable: true, icon: iconoVertice }).addTo(
      mapaGestion,
    );
    mk.on("drag", (ev) => {
      const pos = ev.target.getLatLng();
      verticesActivos[idx] = [
        parseFloat(pos.lat.toFixed(7)),
        parseFloat(pos.lng.toFixed(7)),
      ];
      actualizarFormaYMetricas();
    });
    marcadoresVertices.push(mk);
  });

  actualizarFormaYMetricas();
}

function actualizarFormaYMetricas() {
  if (poligonoActivoLayer) {
    mapaGestion.removeLayer(poligonoActivoLayer);
    poligonoActivoLayer = null;
  }

  if (verticesActivos.length >= 2) {
    poligonoActivoLayer =
      verticesActivos.length >= 3
        ? L.polygon(verticesActivos, {
            color: "#10b981",
            weight: 3,
            fillColor: "#10b981",
            fillOpacity: 0.3,
          }).addTo(mapaGestion)
        : L.polyline(verticesActivos, {
            color: "#10b981",
            weight: 3,
            dashArray: "6,6",
          }).addTo(mapaGestion);
  }

  const metricas = calcularMetricasPoligono(verticesActivos);
  areaCalculadaM2 = metricas.areaM2;

  document.getElementById("badgeVertices").innerText =
    verticesActivos.length +
    (verticesActivos.length === 1 ? " vértice" : " vértices");

  const ha = (metricas.areaM2 / 10000).toFixed(2);
  document.getElementById("lblAreaParcela").innerText =
    Math.round(metricas.areaM2).toLocaleString() + " m² (" + ha + " ha)";
  document.getElementById("lblPerimetroParcela").innerText =
    metricas.perimetroM.toFixed(1) + " m";
  document.getElementById("lblDimensionesParcela").innerText =
    metricas.anchoM > 0 && metricas.altoM > 0
      ? `~${Math.round(metricas.anchoM)}m × ${Math.round(metricas.altoM)}m`
      : "--";

  if (metricas.centroide) {
    document.getElementById("txtLatitud").value =
      metricas.centroide[0].toFixed(6);
    document.getElementById("txtLongitud").value =
      metricas.centroide[1].toFixed(6);
  }
}

function fijarPuntoSeleccionado(lat, lng, centrarMapa) {
  document.getElementById("txtLatitud").value = lat;
  document.getElementById("txtLongitud").value = lng;

  if (!mapaGestion) return;

  if (!marcadorSeleccion) {
    marcadorSeleccion = L.marker([lat, lng], { draggable: true })
      .addTo(mapaGestion)
      .bindPopup("📍 Centro de parcela");

    marcadorSeleccion.on("dragend", (ev) => {
      const pos = ev.target.getLatLng();
      document.getElementById("txtLatitud").value = pos.lat.toFixed(6);
      document.getElementById("txtLongitud").value = pos.lng.toFixed(6);
    });
  } else {
    marcadorSeleccion.setLatLng([lat, lng]);
  }

  if (centrarMapa) {
    mapaGestion.setView([lat, lng], 17);
  }
}

function actualizarMarcadorDesdeInputs() {
  const lat = parseFloat(document.getElementById("txtLatitud").value);
  const lng = parseFloat(document.getElementById("txtLongitud").value);

  if (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    fijarPuntoSeleccionado(lat, lng, true);
  }
}

// =========================================================================
// 3. CARGA DE PARCELAS, AUTOCOMPLETADO DE CAMPOS Y TABLA ADMINISTRATIVA
// =========================================================================

async function cargarParcelasGestion() {
  if (typeof usuarioSesion === "undefined" || !usuarioSesion) return;

  try {
    const res = await fetch("/api/parcelas?id_usuario=" + usuarioSesion.id);
    const data = await res.json();
    parcelasCache = Array.isArray(data) ? data : [];

    actualizarListasCamposGenerales();
    dibujarParcelasReferenciaEnMapa();
    renderizarTablaGestion();

    // Si venimos desde "Vista de Campo" con ?editar=<id>, abrir edición directo
    const params = new URLSearchParams(window.location.search);
    const idEditarUrl = params.get("editar");
    if (idEditarUrl && !document.getElementById("editParcelaId").value) {
      editarParcela(idEditarUrl);
    }
  } catch (err) {
    console.error("Error cargando parcelas en gestor:", err);
  }
}

function actualizarListasCamposGenerales() {
  const datalist = document.getElementById("datalistCamposGenerales");
  const selFiltro = document.getElementById("selFiltroCampoGestion");

  const camposSet = new Set();
  parcelasCache.forEach((p) => {
    const cg = (p.campo_general || "").trim();
    if (cg) camposSet.add(cg);
  });

  const camposOrdenados = Array.from(camposSet).sort((a, b) =>
    a.localeCompare(b),
  );

  if (datalist) {
    datalist.innerHTML = camposOrdenados
      .map((cg) => `<option value="${cg}"></option>`)
      .join("");
  }

  if (selFiltro) {
    const previo = selFiltro.value || "TODOS";
    selFiltro.innerHTML = '<option value="TODOS">Todos los campos</option>';
    camposOrdenados.forEach((cg) => {
      selFiltro.innerHTML += `<option value="${cg}">🏡 ${cg}</option>`;
    });
    selFiltro.innerHTML +=
      '<option value="__SIN_CAMPO__">🌱 Sin Campo General</option>';

    if (Array.from(selFiltro.options).some((o) => o.value === previo)) {
      selFiltro.value = previo;
    }
  }
}

function dibujarParcelasReferenciaEnMapa() {
  if (!capaParcelasReferencia) return;
  capaParcelasReferencia.clearLayers();
  boundsGuardados = [];

  const idEnEdicion = document.getElementById("editParcelaId").value;
  const gruposPuntos = new Map();

  parcelasCache.forEach((p) => {
    const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
    const cultivo = p.cultivo || "General";
    const cg = (p.campo_general || "").trim();
    const pol = parsearPoligonoGuardado(p.poligono_json);
    const esLaQueEdito = String(p.id) === String(idEnEdicion);

    if (pol.length >= 3) {
      pol.forEach((pt) => {
        boundsGuardados.push(pt);
        if (cg) {
          if (!gruposPuntos.has(cg)) gruposPuntos.set(cg, []);
          gruposPuntos.get(cg).push(pt);
        }
      });

      if (!esLaQueEdito) {
        const poly = L.polygon(pol, {
          color: "#38bdf8",
          weight: 2,
          fillColor: "#38bdf8",
          fillOpacity: 0.16,
        }).addTo(capaParcelasReferencia);

        poly.bindPopup(`
          <div style="min-width:150px;">
            ${cg ? `<div style="font-size:10px;color:#b45309;font-weight:700;">🏡 ${cg}</div>` : ""}
            <div style="font-weight:800;color:#0f172a;">#${p.id} ${nombre}</div>
            <div style="font-size:11px;color:#475569;">🌱 ${cultivo}</div>
            <button onclick="editarParcela(${p.id})" style="margin-top:6px;width:100%;background:#d97706;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;">
              ✏️ Editar este contorno
            </button>
          </div>
        `);
      }
    } else if (
      p.latitud !== null &&
      p.longitud !== null &&
      p.latitud !== "" &&
      p.longitud !== ""
    ) {
      const pt = [parseFloat(p.latitud), parseFloat(p.longitud)];
      boundsGuardados.push(pt);
      if (cg) {
        if (!gruposPuntos.has(cg)) gruposPuntos.set(cg, []);
        gruposPuntos.get(cg).push(pt);
      }

      if (!esLaQueEdito) {
        L.circleMarker(pt, {
          radius: 7,
          fillColor: "#38bdf8",
          color: "#ffffff",
          weight: 2,
          fillOpacity: 0.85,
        })
          .addTo(capaParcelasReferencia)
          .bindPopup(
            `<b>#${p.id} ${nombre}</b><br><a href="javascript:void(0)" onclick="editarParcela(${p.id})">✏️ Editar</a>`,
          );
      }
    }
  });

  // Dibujar envoltura no-interactiva de cada Campo General para referencia visual
  gruposPuntos.forEach((pts) => {
    if (pts.length >= 3) {
      const hull = calcularEnvolturaConvexa(pts);
      if (hull.length >= 3) {
        L.polygon(hull, {
          color: "#f59e0b",
          weight: 2,
          dashArray: "7, 6",
          fillOpacity: 0.03,
          interactive: false,
        }).addTo(capaParcelasReferencia);
      }
    }
  });

  if (boundsGuardados.length > 0 && mapaGestion && !idEnEdicion) {
    mapaGestion.fitBounds(boundsGuardados, { padding: [45, 45], maxZoom: 18 });
  }
}

function renderizarTablaGestion() {
  const tbody = document.getElementById("tablaGestionParcelas");
  const contador = document.getElementById("contadorGestionParcelas");
  const textoBusqueda = (
    document.getElementById("txtBuscarParcela")?.value || ""
  )
    .toLowerCase()
    .trim();
  const filtroCampo =
    document.getElementById("selFiltroCampoGestion")?.value || "TODOS";

  if (!tbody) return;

  const filtradas = parcelasCache.filter((p) => {
    const cg = (p.campo_general || "").trim();
    if (filtroCampo === "__SIN_CAMPO__" && cg !== "") return false;
    if (
      filtroCampo !== "TODOS" &&
      filtroCampo !== "__SIN_CAMPO__" &&
      cg !== filtroCampo
    ) {
      return false;
    }

    if (!textoBusqueda) return true;
    const nombre = (p.parcela || p.nombre || "").toLowerCase();
    const cultivo = (p.cultivo || "").toLowerCase();
    const macs = (p.lista_macs || p.codigo_mac || "").toLowerCase();
    return (
      nombre.includes(textoBusqueda) ||
      cultivo.includes(textoBusqueda) ||
      macs.includes(textoBusqueda) ||
      cg.toLowerCase().includes(textoBusqueda) ||
      String(p.id).includes(textoBusqueda)
    );
  });

  if (contador) {
    contador.innerText =
      filtradas.length + (filtradas.length === 1 ? " parcela" : " parcelas");
  }

  if (filtradas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-6 text-center text-slate-500 text-xs">
          No hay parcelas que coincidan con el filtro actual.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";
  filtradas.forEach((p) => {
    const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
    const cultivo = p.cultivo || "General";
    const cg = (p.campo_general || "").trim();
    const macs = p.lista_macs || p.codigo_mac || "Sin sensor";
    const pol = parsearPoligonoGuardado(p.poligono_json);
    const met = calcularMetricasPoligono(pol);

    const areaM2 =
      p.area_m2 && parseFloat(p.area_m2) > 0
        ? parseFloat(p.area_m2)
        : met.areaM2;
    const areaTxt =
      areaM2 > 0
        ? `${Math.round(areaM2).toLocaleString()} m² (${(areaM2 / 10000).toFixed(2)} ha)`
        : "Solo punto GPS";

    const modo = p.modo_riego || "AUTO";
    const badgeModo =
      modo === "MANUAL_ON"
        ? '<span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">💧 Manual ON</span>'
        : modo === "MANUAL_OFF"
          ? '<span class="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">🛑 Apagado</span>'
          : `<span class="bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">🤖 Auto (${p.umbral_humedad ?? 35}%)</span>`;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-750/60 transition">
        <td class="p-3.5 font-mono font-bold text-sky-400">#${p.id}</td>
        <td class="p-3.5">
          ${
            cg
              ? `<span class="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-lg font-semibold text-[11px]">🏡 ${cg}</span>`
              : '<span class="text-slate-500 italic">Independiente</span>'
          }
        </td>
        <td class="p-3.5">
          <div class="font-bold text-slate-100">${nombre}</div>
          <div class="text-[11px] text-slate-400">🌱 ${cultivo}</div>
        </td>
        <td class="p-3.5">
          <div class="font-mono font-bold text-emerald-400">${areaTxt}</div>
          <div class="text-[11px] text-slate-400">${pol.length >= 3 ? `${pol.length} vértices GPS` : "Sin polígono"}</div>
        </td>
        <td class="p-3.5 font-mono text-amber-400">${macs}</td>
        <td class="p-3.5">${badgeModo}</td>
        <td class="p-3.5 text-right space-x-1.5 whitespace-nowrap">
          <button
            type="button"
            onclick="enfocarParcelaEnMapa(${p.id})"
            title="Centrar en mapa"
            class="bg-slate-900 hover:bg-sky-500/20 text-sky-300 border border-slate-700 px-2.5 py-1.5 rounded-lg font-semibold transition"
          >
            🎯
          </button>
          <button
            type="button"
            onclick="editarParcela(${p.id})"
            title="Editar parcela y contorno"
            class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2.5 py-1.5 rounded-lg font-semibold transition"
          >
            ✏️ Editar
          </button>
          <button
            type="button"
            onclick="eliminarParcela(${p.id})"
            title="Eliminar parcela"
            class="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 px-2.5 py-1.5 rounded-lg font-semibold transition"
          >
            🗑️
          </button>
        </td>
      </tr>
    `;
  });
}

function enfocarParcelaEnMapa(id) {
  const p = parcelasCache.find((item) => String(item.id) === String(id));
  if (!p || !mapaGestion) return;

  const pol = parsearPoligonoGuardado(p.poligono_json);
  const contenedor = document.getElementById("mapaGestionParcelas");
  if (contenedor) {
    contenedor.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (pol.length >= 3) {
    mapaGestion.fitBounds(pol, { padding: [50, 50], maxZoom: 19 });
  } else if (p.latitud !== null && p.longitud !== null) {
    mapaGestion.setView([parseFloat(p.latitud), parseFloat(p.longitud)], 18);
  }
}

// =========================================================================
// 4. CREACIÓN, EDICIÓN Y ELIMINACIÓN DE PARCELAS
// =========================================================================

function prepararNuevaParcela() {
  cancelarEdicion();
  const sec = document.getElementById("seccionFormularioParcela");
  if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  const inputNombre = document.getElementById("txtNombreParcela");
  if (inputNombre) inputNombre.focus();
}

function editarParcela(id) {
  const p = parcelasCache.find((item) => String(item.id) === String(id));
  if (!p) return;

  document.getElementById("editParcelaId").value = p.id;
  document.getElementById("txtCampoGeneral").value = p.campo_general || "";
  document.getElementById("txtNombreParcela").value =
    p.parcela || p.nombre || "";
  document.getElementById("txtCultivo").value = p.cultivo || "";
  document.getElementById("txtLatitud").value = p.latitud ?? "";
  document.getElementById("txtLongitud").value = p.longitud ?? "";
  document.getElementById("txtMacESP32").value = p.codigo_mac || "";

  document.getElementById("formTitulo").innerHTML =
    "<span>✏️</span> Editando Parcela #" + p.id;
  const btnGuardar = document.getElementById("btnGuardarParcela");
  btnGuardar.innerText = "💾 Actualizar Parcela";
  btnGuardar.className =
    "flex-grow bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg";

  document.getElementById("btnCancelarEdicion").classList.remove("hidden");

  // Redibujar referencias ocultando el polígono azul estático de esta parcela
  dibujarParcelasReferenciaEnMapa();

  const poligono = parsearPoligonoGuardado(p.poligono_json);
  if (poligono.length >= 3) {
    if (marcadorSeleccion && mapaGestion) {
      mapaGestion.removeLayer(marcadorSeleccion);
      marcadorSeleccion = null;
    }
    verticesActivos = poligono;
    cambiarModoMapa("POLIGONO");
    redibujarPoligonoActivo();
    mapaGestion.fitBounds(poligono, { padding: [55, 55], maxZoom: 19 });
  } else {
    limpiarPoligonoActual();
    if (
      p.latitud !== null &&
      p.longitud !== null &&
      p.latitud !== "" &&
      p.longitud !== ""
    ) {
      cambiarModoMapa("PUNTO");
      fijarPuntoSeleccionado(
        parseFloat(p.latitud),
        parseFloat(p.longitud),
        true,
      );
    }
  }

  const mapaEl = document.getElementById("mapaGestionParcelas");
  if (mapaEl) {
    mapaEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function cancelarEdicion() {
  document.getElementById("editParcelaId").value = "";
  document.getElementById("formGestionParcela").reset();
  limpiarPoligonoActual();

  document.getElementById("formTitulo").innerHTML =
    "<span>➕</span> Registrar Nueva Parcela";
  const btnGuardar = document.getElementById("btnGuardarParcela");
  btnGuardar.innerText = "💾 Guardar Parcela";
  btnGuardar.className =
    "flex-grow bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg";

  document.getElementById("btnCancelarEdicion").classList.add("hidden");

  if (marcadorSeleccion && mapaGestion) {
    mapaGestion.removeLayer(marcadorSeleccion);
    marcadorSeleccion = null;
  }

  // Limpiar parámetro ?editar= de la URL si existía
  if (window.location.search.includes("editar=")) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  dibujarParcelasReferenciaEnMapa();
}

async function guardarParcela(e) {
  e.preventDefault();

  const idEdicion = document.getElementById("editParcelaId").value;
  const campo_general = document.getElementById("txtCampoGeneral").value.trim();
  const nombre = document.getElementById("txtNombreParcela").value.trim();
  const cultivo = document.getElementById("txtCultivo").value.trim();
  const latitud = document.getElementById("txtLatitud").value;
  const longitud = document.getElementById("txtLongitud").value;
  const codigo_mac = document.getElementById("txtMacESP32").value.trim();

  if (verticesActivos.length > 0 && verticesActivos.length < 3) {
    alert(
      "Has marcado menos de 3 vértices. Agrega al menos 3 esquinas para cerrar el polígono o presiona 'Limpiar Borde' para guardar solo punto GPS.",
    );
    return;
  }

  const esEdicion = idEdicion !== "";
  const url = esEdicion ? "/api/parcelas/" + idEdicion : "/api/parcelas";
  const metodo = esEdicion ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_usuario: usuarioSesion.id,
        campo_general: campo_general || null,
        nombre,
        cultivo,
        latitud,
        longitud,
        codigo_mac,
        poligono: verticesActivos.length >= 3 ? verticesActivos : null,
        area_m2: areaCalculadaM2 > 0 ? areaCalculadaM2.toFixed(2) : null,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      alert(
        esEdicion
          ? "✅ Parcela y contorno actualizados correctamente"
          : "✅ Parcela y contorno registrados correctamente",
      );
      cancelarEdicion();
      await cargarParcelasGestion();
    } else {
      alert("❌ Error: " + (data.error || "No se pudo guardar la parcela"));
    }
  } catch (err) {
    alert("Error de conexión con el servidor.");
  }
}

async function eliminarParcela(id) {
  const p = parcelasCache.find((item) => String(item.id) === String(id));
  const nombre = p ? p.parcela || p.nombre || "Parcela" : "Parcela";

  const confirmar = confirm(
    '¿Estás seguro de eliminar la parcela "' +
      nombre +
      '" (#' +
      id +
      ")?\n\nSe eliminarán también sus dispositivos, programaciones y lecturas telemétricas asociadas.",
  );
  if (!confirmar) return;

  try {
    const res = await fetch("/api/parcelas/" + id, { method: "DELETE" });
    if (res.ok) {
      if (
        String(document.getElementById("editParcelaId").value) === String(id)
      ) {
        cancelarEdicion();
      }
      await cargarParcelasGestion();
    } else {
      alert("❌ No se pudo eliminar la parcela.");
    }
  } catch (err) {
    alert("Error de conexión al eliminar la parcela.");
  }
}
