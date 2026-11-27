let mapaGestion = null;
let marcadorSeleccion = null;
let capaSatelite = null;
let capaCalle = null;
let esSatelite = true;
let capaParcelasReferencia = null;
let parcelasCache = [];
let camposCache = [];
let boundsGuardados = [];

// Contornos punteados reales de los Campos registrados (terreno general)
let contornosCamposGuardados = []; // [{ id, nombre, poligono }]

// Modo de registro activo: "PARCELA" o "CAMPO"
let modoRegistro = "PARCELA";
let ultimoCampoCreado = null;

// Variables de dibujo activo
let modoMapa = "POLIGONO";
let verticesActivos = [];
let marcadoresVertices = [];
let poligonoActivoLayer = null;
let areaCalculadaM2 = 0;

const COORD_DEFECTO = [-12.6581, -76.6321];

document.addEventListener("DOMContentLoaded", () => {
  inicializarMapaGestion();
  activarModoRegistro("PARCELA");
  cargarParcelasGestion();
});

function normalizarTexto(valor) {
  return String(valor || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function claveStorageCampos() {
  const uid =
    typeof usuarioSesion !== "undefined" && usuarioSesion?.id
      ? usuarioSesion.id
      : "default";
  return `asir_contornos_campos_${uid}`;
}

function leerContornosCamposLocal() {
  try {
    const raw = localStorage.getItem(claveStorageCampos());
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (item) =>
        item &&
        typeof item.nombre === "string" &&
        item.nombre.trim() !== "" &&
        Array.isArray(item.poligono) &&
        item.poligono.length >= 3,
    );
  } catch (e) {
    return [];
  }
}

function guardarContornosCamposLocal() {
  try {
    localStorage.setItem(
      claveStorageCampos(),
      JSON.stringify(contornosCamposGuardados),
    );
  } catch (e) {
    console.warn("No se pudo guardar contornos de campos en localStorage:", e);
  }
}

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
  const esCampo = modoRegistro === "CAMPO";

  const estiloPuntoInactivo =
    "text-cyan-300 hover:text-cyan-200 border text-xs p-2 rounded-lg transition inline-flex items-center justify-center";

  if (nuevoModo === "POLIGONO") {
    if (btnPol) {
      btnPol.className = esCampo
        ? "bg-rose-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1.5"
        : "bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1.5";
    }
    if (btnPto) {
      btnPto.className = estiloPuntoInactivo;
    }
    if (estado) {
      estado.innerText = esCampo
        ? "Modo: Trazado de perímetro de Campo (rojizo)"
        : "Modo: Trazado de contorno activo";
      estado.className = esCampo
        ? "text-xs font-semibold text-rose-400"
        : "text-xs font-semibold text-emerald-400";
    }
  } else {
    if (btnPto) {
      btnPto.className =
        "ring-1 ring-cyan-300 text-cyan-200 border border-cyan-400/70 text-xs p-2 rounded-lg transition inline-flex items-center justify-center";
    }
    if (btnPol) {
      btnPol.className =
        "bg-transparent hover:bg-white/5 text-slate-300 hover:text-white border border-slate-700/80 text-xs px-3 py-1.5 rounded-lg font-normal transition inline-flex items-center gap-1.5";
    }
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
// 2. CAMBIO DE MODO: REGISTRAR CAMPO vs. REGISTRAR PARCELA
// =========================================================================

function activarModoRegistro(nuevoModo, campoPreseleccionado = null) {
  modoRegistro = nuevoModo === "CAMPO" ? "CAMPO" : "PARCELA";

  if (modoRegistro === "CAMPO") {
    document.getElementById("editParcelaId").value = "";
    document.getElementById("btnCancelarEdicion").classList.add("hidden");
  }

  const tabCampo = document.getElementById("tabModoCampo");
  const tabParcela = document.getElementById("tabModoParcela");
  const grupoCampo = document.getElementById("grupoCamposModoCampo");
  const grupoParcela = document.getElementById("grupoCamposModoParcela");
  const formTitulo = document.getElementById("formTitulo");
  const formSubtitulo = document.getElementById("formSubtitulo");
  const btnGuardar = document.getElementById("btnGuardarParcela");
  const inputNombreParcela = document.getElementById("txtNombreParcela");
  const inputNombreCampo = document.getElementById("txtNombreCampoNuevo");
  const notaSensores = document.getElementById("notaSensoresDiseno");

  if (modoRegistro === "CAMPO") {
    tabCampo.className =
      "bg-rose-600 hover:bg-rose-500 border border-rose-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 shadow";
    tabParcela.className =
      "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2";

    grupoCampo.classList.remove("hidden");
    grupoParcela.classList.add("hidden");

    if (inputNombreParcela) inputNombreParcela.required = false;
    if (inputNombreCampo) inputNombreCampo.required = true;

    formTitulo.innerHTML = "<span>🏡</span> Registrar Nuevo Campo / Fundo";
    formSubtitulo.innerText =
      "Traza el perímetro general del campo en tono rojizo; al guardarlo se marcará con línea punteada y podrás registrar sus parcelas";
    btnGuardar.innerText = "🏡 Guardar Campo";
    btnGuardar.className =
      "flex-grow bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg";

    if (notaSensores) {
      notaSensores.innerHTML =
        "ℹ️ En un <strong class='text-rose-300'>Campo</strong> no se asignan sensores ni cultivos generales; al guardarlo podrás crear sus parcelas y luego configurar nodos en <strong class='text-sky-400'>Diseñador 2D e IO</strong>.";
    }
  } else {
    tabParcela.className =
      "bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 shadow";
    tabCampo.className =
      "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-2";

    grupoCampo.classList.add("hidden");
    grupoParcela.classList.remove("hidden");

    if (inputNombreCampo) inputNombreCampo.required = false;
    if (inputNombreParcela) inputNombreParcela.required = true;

    const esEdicion = document.getElementById("editParcelaId").value !== "";
    formTitulo.innerHTML = esEdicion
      ? `<span>✏️</span> Editando Parcela #${document.getElementById("editParcelaId").value}`
      : "<span>➕</span> Registrar Nueva Parcela";
    formSubtitulo.innerText = campoPreseleccionado
      ? `Registrando parcela dentro del campo "${campoPreseleccionado.nombre}"`
      : "Registra una parcela independiente o dentro de un campo ya marcado";
    btnGuardar.innerText = esEdicion
      ? "💾 Actualizar Parcela"
      : "💾 Guardar Parcela";
    btnGuardar.className = esEdicion
      ? "flex-grow bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg"
      : "flex-grow bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg";

    if (notaSensores) {
      notaSensores.innerHTML =
        "📡 Los sensores ESP32 y nodos se configuran en <strong class='text-sky-400'>Diseñador 2D e IO</strong> una vez definidas las parcelas.";
    }

    if (campoPreseleccionado) {
      const selCampo = document.getElementById("selCampoGeneral");
      const txtCampo = document.getElementById("txtCampoGeneral");
      if (selCampo) {
        const val = campoPreseleccionado.id
          ? String(campoPreseleccionado.id)
          : `__NOMBRE__:${campoPreseleccionado.nombre}`;
        if (Array.from(selCampo.options).some((o) => o.value === val)) {
          selCampo.value = val;
        }
      }
      if (txtCampo) {
        txtCampo.value = campoPreseleccionado.nombre || "";
      }
    }
  }

  cambiarModoMapa(modoMapa);
  redibujarPoligonoActivo();
}

function iniciarParcelaEnUltimoCampo() {
  if (!ultimoCampoCreado) return;
  limpiarPoligonoActual();
  if (marcadorSeleccion && mapaGestion) {
    mapaGestion.removeLayer(marcadorSeleccion);
    marcadorSeleccion = null;
  }
  document.getElementById("txtNombreParcela").value = "";
  document.getElementById("txtCultivo").value = "";
  document.getElementById("txtLatitud").value = "";
  document.getElementById("txtLongitud").value = "";

  activarModoRegistro("PARCELA", ultimoCampoCreado);

  const formEl = document.getElementById("formGestionParcela");
  if (formEl) {
    formEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const inputNombre = document.getElementById("txtNombreParcela");
  if (inputNombre) {
    setTimeout(() => inputNombre.focus(), 150);
  }
}

// =========================================================================
// 3. CÁLCULOS GEOMÉTRICOS DE ÁREA Y PERÍMETRO
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

function redibujarPoligonoActivo() {
  if (!mapaGestion) return;
  marcadoresVertices.forEach((m) => mapaGestion.removeLayer(m));
  marcadoresVertices = [];

  if (poligonoActivoLayer) {
    mapaGestion.removeLayer(poligonoActivoLayer);
    poligonoActivoLayer = null;
  }

  const esCampo = modoRegistro === "CAMPO";
  const colorPunto = esCampo ? "#ef4444" : "#10b981";

  verticesActivos.forEach((coord, idx) => {
    const iconoVertice = L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;background:${colorPunto};border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 6px #000;cursor:move;"></div>`,
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
  if (poligonoActivoLayer && mapaGestion) {
    mapaGestion.removeLayer(poligonoActivoLayer);
    poligonoActivoLayer = null;
  }

  const esCampo = modoRegistro === "CAMPO";
  const colorTrazo = esCampo ? "#ef4444" : "#10b981";

  if (verticesActivos.length >= 2 && mapaGestion) {
    poligonoActivoLayer =
      verticesActivos.length >= 3
        ? L.polygon(verticesActivos, {
            color: colorTrazo,
            weight: 3,
            fillColor: colorTrazo,
            fillOpacity: esCampo ? 0.18 : 0.3,
          }).addTo(mapaGestion)
        : L.polyline(verticesActivos, {
            color: colorTrazo,
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
      .bindPopup("📍 Coordenada seleccionada");

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
// 4. CARGA DE CAMPOS/PARCELAS Y COHERENCIA ENTRE MAPA Y SELECTORES
// =========================================================================

async function cargarParcelasGestion() {
  if (typeof usuarioSesion === "undefined" || !usuarioSesion) return;

  contornosCamposGuardados = leerContornosCamposLocal();

  try {
    const [resParcelas, resCampos] = await Promise.all([
      fetch("/api/parcelas?id_usuario=" + usuarioSesion.id),
      fetch("/api/campos?id_usuario=" + usuarioSesion.id),
    ]);

    const dataParcelas = await resParcelas.json();
    parcelasCache = Array.isArray(dataParcelas) ? dataParcelas : [];

    if (resCampos.ok) {
      const dataCampos = await resCampos.json();
      camposCache = Array.isArray(dataCampos) ? dataCampos : [];

      const nombresBd = new Set(
        camposCache.map((c) => normalizarTexto(c.nombre)),
      );
      const idsBd = new Set(
        camposCache.filter((c) => c.id != null).map((c) => String(c.id)),
      );

      contornosCamposGuardados = contornosCamposGuardados.filter((item) => {
        const porId = item.id != null && idsBd.has(String(item.id));
        const porNombre = nombresBd.has(normalizarTexto(item.nombre));
        return porId || porNombre;
      });

      camposCache.forEach((c) => {
        const pol = parsearPoligonoGuardado(c.poligono_json);
        if (pol.length >= 3) {
          const nombreLimpio = (c.nombre || "").trim().replace(/\s+/g, " ");
          const idx = contornosCamposGuardados.findIndex(
            (item) =>
              (c.id && String(item.id) === String(c.id)) ||
              normalizarTexto(item.nombre) === normalizarTexto(nombreLimpio),
          );
          const entrada = {
            id: c.id || null,
            nombre: nombreLimpio,
            poligono: pol,
          };
          if (idx >= 0) contornosCamposGuardados[idx] = entrada;
          else contornosCamposGuardados.push(entrada);
        }
      });

      guardarContornosCamposLocal();
    }

    actualizarListasCamposGenerales();
    dibujarParcelasReferenciaEnMapa();
    renderizarTablaGestion();

    const params = new URLSearchParams(window.location.search);
    const idEditarUrl = params.get("editar");
    if (idEditarUrl && !document.getElementById("editParcelaId").value) {
      activarModoRegistro("PARCELA");
      editarParcela(idEditarUrl);
    }
  } catch (err) {
    console.error("Error cargando parcelas y campos en gestor:", err);
  }
}

function obtenerCamposConsolidados() {
  const mapaCampos = new Map();

  camposCache.forEach((c) => {
    const nombre = (c.nombre || "").trim().replace(/\s+/g, " ");
    if (!nombre) return;
    const clave = normalizarTexto(nombre);
    mapaCampos.set(clave, {
      id: c.id,
      nombre,
      total_parcelas: Number(c.total_parcelas || 0),
    });
  });

  parcelasCache.forEach((p) => {
    const nombre = (p.campo_general || "").trim().replace(/\s+/g, " ");
    if (!nombre) return;
    const clave = normalizarTexto(nombre);
    if (!mapaCampos.has(clave)) {
      mapaCampos.set(clave, {
        id: p.id_campo || null,
        nombre,
        total_parcelas: 0,
      });
    } else if (!mapaCampos.get(clave).id && p.id_campo) {
      mapaCampos.get(clave).id = p.id_campo;
    }
  });

  return Array.from(mapaCampos.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre),
  );
}

function actualizarListasCamposGenerales() {
  const selCampo = document.getElementById("selCampoGeneral");
  const selFiltro = document.getElementById("selFiltroCampoGestion");
  const txtCampo = document.getElementById("txtCampoGeneral");

  const camposOrdenados = obtenerCamposConsolidados();

  if (selCampo) {
    const previoCampoId = selCampo.value;
    selCampo.innerHTML =
      '<option value="">-- Parcela independiente / Sin campo --</option>';
    camposOrdenados.forEach((c) => {
      const val = c.id ? String(c.id) : `__NOMBRE__:${c.nombre}`;
      const sufijo =
        c.total_parcelas > 0
          ? ` (${c.total_parcelas} parcelas)`
          : " (0 parcelas)";
      selCampo.innerHTML += `<option value="${val}">🏡 ${c.nombre}${sufijo}</option>`;
    });

    if (
      previoCampoId &&
      Array.from(selCampo.options).some((o) => o.value === previoCampoId)
    ) {
      selCampo.value = previoCampoId;
    } else if (txtCampo && txtCampo.value.trim()) {
      sincronizarSelectDesdeTextoCampo();
    }
  }

  if (selFiltro) {
    const previo = selFiltro.value || "TODOS";
    selFiltro.innerHTML = '<option value="TODOS">Todos los campos</option>';
    camposOrdenados.forEach((c) => {
      selFiltro.innerHTML += `<option value="${c.nombre}">🏡 ${c.nombre}</option>`;
    });
    selFiltro.innerHTML +=
      '<option value="__SIN_CAMPO__">🌱 Parcelas independientes</option>';

    if (Array.from(selFiltro.options).some((o) => o.value === previo)) {
      selFiltro.value = previo;
    } else {
      selFiltro.value = "TODOS";
    }
  }
}

function sincronizarCampoDesdeSelect() {
  const selCampo = document.getElementById("selCampoGeneral");
  const txtCampo = document.getElementById("txtCampoGeneral");
  if (!selCampo || !txtCampo) return;

  const val = selCampo.value;
  if (!val) {
    txtCampo.value = "";
    return;
  }

  if (val.startsWith("__NOMBRE__:")) {
    txtCampo.value = val.replace("__NOMBRE__:", "");
    return;
  }

  const encontrado = obtenerCamposConsolidados().find(
    (c) => String(c.id) === String(val),
  );
  if (encontrado) {
    txtCampo.value = encontrado.nombre;
  }
}

function sincronizarSelectDesdeTextoCampo() {
  const selCampo = document.getElementById("selCampoGeneral");
  const txtCampo = document.getElementById("txtCampoGeneral");
  if (!selCampo || !txtCampo) return;

  const texto = normalizarTexto(txtCampo.value);
  if (!texto) {
    selCampo.value = "";
    return;
  }

  const encontrado = obtenerCamposConsolidados().find(
    (c) => normalizarTexto(c.nombre) === texto,
  );
  if (encontrado) {
    selCampo.value = encontrado.id
      ? String(encontrado.id)
      : `__NOMBRE__:${encontrado.nombre}`;
  } else {
    selCampo.value = "";
  }
}

function dibujarParcelasReferenciaEnMapa() {
  if (!capaParcelasReferencia) return;
  capaParcelasReferencia.clearLayers();
  boundsGuardados = [];

  const idEnEdicion = document.getElementById("editParcelaId").value;

  contornosCamposGuardados.forEach((campo) => {
    if (Array.isArray(campo.poligono) && campo.poligono.length >= 3) {
      campo.poligono.forEach((pt) => boundsGuardados.push(pt));
      L.polygon(campo.poligono, {
        color: "#ef4444",
        weight: 2,
        dashArray: "6, 6",
        fillColor: "#ef4444",
        fillOpacity: 0.03,
        interactive: false,
      }).addTo(capaParcelasReferencia);
    }
  });

  parcelasCache.forEach((p) => {
    const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
    const cultivo = p.cultivo || "General";
    const cg = (p.campo_general || "").trim();
    const pol = parsearPoligonoGuardado(p.poligono_json);
    const esLaQueEdito = String(p.id) === String(idEnEdicion);

    if (pol.length >= 3) {
      pol.forEach((pt) => boundsGuardados.push(pt));

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

  if (boundsGuardados.length > 0 && mapaGestion && !idEnEdicion) {
    mapaGestion.fitBounds(boundsGuardados, { padding: [45, 45], maxZoom: 18 });
  }
}

function renderizarTablaGestion() {
  const tbody = document.getElementById("tablaGestionParcelas");
  const contador = document.getElementById("contadorGestionParcelas");
  const textoBusqueda = normalizarTexto(
    document.getElementById("txtBuscarParcela")?.value || "",
  );
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
    const nombre = normalizarTexto(p.parcela || p.nombre || "");
    const cultivo = normalizarTexto(p.cultivo || "");
    return (
      nombre.includes(textoBusqueda) ||
      cultivo.includes(textoBusqueda) ||
      normalizarTexto(cg).includes(textoBusqueda) ||
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
        <td colspan="6" class="p-6 text-center text-slate-500 text-xs">
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
              ? `<span class="inline-flex items-center gap-1 bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-lg font-semibold text-[11px]">🏡 ${cg}</span>`
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
// 5. VALIDACIÓN DE NOMBRES, GUARDADO, EDICIÓN Y ELIMINACIÓN
// =========================================================================

function existeCampoDuplicado(nombreCampo) {
  const clave = normalizarTexto(nombreCampo);
  return obtenerCamposConsolidados().some(
    (c) => normalizarTexto(c.nombre) === clave,
  );
}

function existeParcelaDuplicadaEnMismoAmbito({
  nombreParcela,
  idCampo,
  nombreCampo,
  idExcluir = "",
}) {
  const claveNombre = normalizarTexto(nombreParcela);
  const claveCampo = normalizarTexto(nombreCampo);
  const tieneCampo = Boolean(claveCampo || idCampo != null);

  return parcelasCache.some((p) => {
    if (idExcluir && String(p.id) === String(idExcluir)) return false;
    if (normalizarTexto(p.parcela || p.nombre || "") !== claveNombre) {
      return false;
    }

    const pCampo = normalizarTexto(p.campo_general || "");
    const pTieneCampo = Boolean(pCampo || p.id_campo != null);

    if (!tieneCampo) {
      return !pTieneCampo;
    }

    if (!pTieneCampo) return false;

    if (idCampo != null && p.id_campo != null) {
      return String(idCampo) === String(p.id_campo);
    }
    return claveCampo !== "" && pCampo === claveCampo;
  });
}

function editarParcela(id) {
  const p = parcelasCache.find((item) => String(item.id) === String(id));
  if (!p) return;

  document.getElementById("editParcelaId").value = p.id;
  document.getElementById("txtCampoGeneral").value = p.campo_general || "";
  sincronizarSelectDesdeTextoCampo();
  if (p.id_campo && document.getElementById("selCampoGeneral")) {
    const optExiste = Array.from(
      document.getElementById("selCampoGeneral").options,
    ).some((o) => o.value === String(p.id_campo));
    if (optExiste) {
      document.getElementById("selCampoGeneral").value = String(p.id_campo);
    }
  }

  document.getElementById("txtNombreParcela").value =
    p.parcela || p.nombre || "";
  document.getElementById("txtCultivo").value = p.cultivo || "";
  document.getElementById("txtLatitud").value = p.latitud ?? "";
  document.getElementById("txtLongitud").value = p.longitud ?? "";

  document.getElementById("btnCancelarEdicion").classList.remove("hidden");
  activarModoRegistro("PARCELA");

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
  if (document.getElementById("selCampoGeneral")) {
    document.getElementById("selCampoGeneral").value = "";
  }
  limpiarPoligonoActual();
  document.getElementById("btnCancelarEdicion").classList.add("hidden");

  if (marcadorSeleccion && mapaGestion) {
    mapaGestion.removeLayer(marcadorSeleccion);
    marcadorSeleccion = null;
  }

  if (window.location.search.includes("editar=")) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  activarModoRegistro("PARCELA");
  dibujarParcelasReferenciaEnMapa();
}

async function guardarRegistroActual(e) {
  e.preventDefault();

  if (verticesActivos.length > 0 && verticesActivos.length < 3) {
    alert(
      "Has marcado menos de 3 vértices. Agrega al menos 3 esquinas para cerrar el contorno o presiona 'Limpiar Borde'.",
    );
    return;
  }

  if (modoRegistro === "CAMPO") {
    await guardarCampoDesdeFormulario();
  } else {
    await guardarParcelaDesdeFormulario();
  }
}

async function guardarCampoDesdeFormulario() {
  if (typeof usuarioSesion === "undefined" || !usuarioSesion) return;

  const nombreCampo = document
    .getElementById("txtNombreCampoNuevo")
    .value.trim()
    .replace(/\s+/g, " ");
  const ubicacionRef = document
    .getElementById("txtUbicacionCampo")
    .value.trim();

  if (!nombreCampo) {
    alert("Ingresa el nombre del Campo / Fundo.");
    return;
  }

  if (existeCampoDuplicado(nombreCampo)) {
    alert(`Ya existe un campo registrado con el nombre "${nombreCampo}".`);
    return;
  }

  const poligonoCampo =
    verticesActivos.length >= 3 ? verticesActivos.map((pt) => [...pt]) : null;

  try {
    const res = await fetch("/api/campos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_usuario: usuarioSesion.id,
        nombre: nombreCampo,
        ubicacion_ref: ubicacionRef || null,
        poligono: poligonoCampo,
        area_m2: areaCalculadaM2 > 0 ? areaCalculadaM2.toFixed(2) : null,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert("❌ Error: " + (data.error || "No se pudo registrar el campo."));
      return;
    }

    const campoGuardado = data.campo || {
      id: null,
      nombre: nombreCampo,
    };
    ultimoCampoCreado = campoGuardado;

    if (poligonoCampo) {
      const nombreLimpio = (campoGuardado.nombre || nombreCampo)
        .trim()
        .replace(/\s+/g, " ");
      const idx = contornosCamposGuardados.findIndex(
        (item) =>
          (campoGuardado.id && String(item.id) === String(campoGuardado.id)) ||
          normalizarTexto(item.nombre) === normalizarTexto(nombreLimpio),
      );
      const entrada = {
        id: campoGuardado.id || null,
        nombre: nombreLimpio,
        poligono: poligonoCampo,
      };
      if (idx >= 0) contornosCamposGuardados[idx] = entrada;
      else contornosCamposGuardados.push(entrada);
      guardarContornosCamposLocal();
    }

    const banner = document.getElementById("bannerCampoCreado");
    const textoBanner = document.getElementById("textoBannerCampo");
    if (banner && textoBanner) {
      textoBanner.innerText = `Campo "${campoGuardado.nombre}" guardado${poligonoCampo ? " (contorno punteado)" : ""}.`;
      banner.classList.remove("hidden");
    }

    document.getElementById("txtNombreCampoNuevo").value = "";
    document.getElementById("txtUbicacionCampo").value = "";
    limpiarPoligonoActual();
    await cargarParcelasGestion();

    iniciarParcelaEnUltimoCampo();
  } catch (err) {
    alert("Error de conexión al guardar el campo.");
  }
}

async function guardarParcelaDesdeFormulario() {
  const idEdicion = document.getElementById("editParcelaId").value;
  const selCampoVal = document.getElementById("selCampoGeneral")?.value || "";
  const campo_general = document
    .getElementById("txtCampoGeneral")
    .value.trim()
    .replace(/\s+/g, " ");
  const id_campo =
    selCampoVal && !selCampoVal.startsWith("__NOMBRE__:")
      ? parseInt(selCampoVal, 10)
      : null;

  const nombre = document
    .getElementById("txtNombreParcela")
    .value.trim()
    .replace(/\s+/g, " ");
  const cultivo = document.getElementById("txtCultivo").value.trim();
  const latitud = document.getElementById("txtLatitud").value;
  const longitud = document.getElementById("txtLongitud").value;

  if (!nombre) {
    alert("Ingresa el nombre de la parcela o sector.");
    return;
  }

  if (
    existeParcelaDuplicadaEnMismoAmbito({
      nombreParcela: nombre,
      idCampo: id_campo,
      nombreCampo: campo_general,
      idExcluir: idEdicion,
    })
  ) {
    const detalleAmbito = campo_general
      ? `dentro del campo "${campo_general}"`
      : "entre las parcelas independientes";
    alert(
      `Ya existe una parcela llamada "${nombre}" ${detalleAmbito}. Usa otro nombre para evitar confusiones.`,
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
        id_campo,
        campo_general: campo_general || null,
        nombre,
        cultivo,
        latitud,
        longitud,
        codigo_mac: null,
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
