let parcelasDisponibles = [];
let nodosPlano = [];
let contornoMetros = [];
let herramientaActiva = "MOVER";
let nodoArrastrado = null;
let aristasPvc = [];
let aristasMesh = [];

// Modo de Fondo: "SATELITE" | "ORTOFOTO" | "NINGUNO"
let modoFondo = "SATELITE";
let ortofotoConfig = null;
let ortofotoImgObj = null;
let sateliteAutoCanvas = null;
let sateliteAutoBoundsM = null;
let opacidadSateliteAuto = 0.65;

// Estado de Cámara (Zoom / Paneo)
let zoomCanvas = 1.0;
let panCanvasX = 40;
let panCanvasY = 30;
let escalaBasePxPorMetro = 6.0;
let arrastrandoFondo = false;
let inicioArrastreFondo = { x: 0, y: 0 };

const ANCHO_REGLA_IZQ = 38;
const ALTO_REGLA_SUP = 24;

const TEXTOS_AYUDA = {
  MOVER:
    "🖐️ Arrastra nodos, mueve el fondo o usa la rueda del ratón para hacer zoom.",
  BOMBA: "⛽ Haz clic en tu terreno para ubicar la Bomba o fuente de agua.",
  VALVULA:
    "💧 Haz clic en tu terreno para añadir una electroválvula o punto de riego.",
  NODO_ESP32:
    "📡 Haz clic en tu terreno para instalar un nodo telemétrico ESP32.",
  REPETIDOR:
    "📶 Haz clic en tu terreno para añadir un repetidor inalámbrico Mesh.",
  BORRAR: "🗑️ Haz clic sobre un nodo existente para eliminarlo del plano.",
};

const ESTILOS_NODO = {
  BOMBA: { color: "#3b82f6", borde: "#dbeafe", icono: "⛽", prefijo: "B" },
  VALVULA: { color: "#06b6d4", borde: "#cffafe", icono: "💧", prefijo: "V" },
  NODO_ESP32: {
    color: "#f59e0b",
    borde: "#fef3c7",
    icono: "📡",
    prefijo: "ESP",
  },
  REPETIDOR: {
    color: "#a855f7",
    borde: "#f3e8ff",
    icono: "📶",
    prefijo: "REP",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  ajustarResolucionCanvas();
  inicializarEventosCanvas();
  cargarParcelasDiseno();
  window.addEventListener("resize", () => {
    ajustarResolucionCanvas();
    redibujarLienzo();
  });
});

function ajustarResolucionCanvas() {
  const contenedor = document.getElementById("contenedorCanvas2d");
  const canvas = document.getElementById("canvasDiseno2d");
  if (!contenedor || !canvas) return;

  const w = contenedor.clientWidth || 900;
  const h = contenedor.clientHeight || 560;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

async function cargarParcelasDiseno() {
  const select = document.getElementById("selParcelaDiseno");
  try {
    const res = await fetch("/api/parcelas?id_usuario=" + usuarioSesion.id);
    parcelasDisponibles = await res.json();

    if (!parcelasDisponibles || parcelasDisponibles.length === 0) {
      select.innerHTML = '<option value="">Sin parcelas registradas</option>';
      generarPlantillaEjemplo();
      resetearVistaCanvas(true);
      return;
    }

    select.innerHTML = "";
    parcelasDisponibles.forEach((p) => {
      const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
      const areaInfo = p.area_m2 ? " (" + Math.round(p.area_m2) + " m²)" : "";
      select.innerHTML +=
        '<option value="' +
        p.id +
        '">📍 #' +
        p.id +
        " - " +
        nombre +
        areaInfo +
        "</option>";
    });

    await cargarDisenoParcela();
  } catch (err) {
    console.error("Error cargando parcelas en diseñador 2D:", err);
  }
}

function proyectarContornoAMetros(poligonoLatLng) {
  if (!Array.isArray(poligonoLatLng) || poligonoLatLng.length < 3) {
    return { puntos: [], anchoTotal: 100, altoTotal: 80, origen: null };
  }

  const lat0 = poligonoLatLng[0][0];
  const lng0 = poligonoLatLng[0][1];
  const mPorLat = 111132.92;
  const mPorLng = 111412.84 * Math.cos((lat0 * Math.PI) / 180);

  const crudos = poligonoLatLng.map((p) => ({
    x: (p[1] - lng0) * mPorLng,
    y: (p[0] - lat0) * mPorLat,
  }));

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  crudos.forEach((pt) => {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  });

  const anchoReal = Math.max(5, maxX - minX);
  const altoReal = Math.max(5, maxY - minY);

  const puntos = crudos.map((pt) => ({
    x: +(pt.x - minX).toFixed(2),
    y: +(maxY - pt.y).toFixed(2),
  }));

  return {
    puntos,
    anchoTotal: +anchoReal.toFixed(1),
    altoTotal: +altoReal.toFixed(1),
    origen: { lat0, lng0, mPorLat, mPorLng, minX, maxY },
  };
}

function lngToTileX(lng, zoom) {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}

function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  );
}

function generarFondoSatelitalParcela(parcelaObj, poligonoRaw, proyeccion) {
  sateliteAutoCanvas = null;
  sateliteAutoBoundsM = null;
  if (!parcelaObj) return;

  let minLat, maxLat, minLng, maxLng;

  if (Array.isArray(poligonoRaw) && poligonoRaw.length >= 3) {
    minLat = Infinity;
    maxLat = -Infinity;
    minLng = Infinity;
    maxLng = -Infinity;
    poligonoRaw.forEach((pt) => {
      if (pt[0] < minLat) minLat = pt[0];
      if (pt[0] > maxLat) maxLat = pt[0];
      if (pt[1] < minLng) minLng = pt[1];
      if (pt[1] > maxLng) maxLng = pt[1];
    });
    const padLat = Math.max(0.00012, (maxLat - minLat) * 0.35);
    const padLng = Math.max(0.00012, (maxLng - minLng) * 0.35);
    minLat -= padLat;
    maxLat += padLat;
    minLng -= padLng;
    maxLng += padLng;
  } else if (parcelaObj.latitud && parcelaObj.longitud) {
    const cLat = parseFloat(parcelaObj.latitud);
    const cLng = parseFloat(parcelaObj.longitud);
    const anchoM =
      parseFloat(document.getElementById("inpAnchoMetros").value) || 100;
    const altoM =
      parseFloat(document.getElementById("inpAltoMetros").value) || 80;
    const dLat = altoM / 2 / 111132.92;
    const dLng = anchoM / 2 / (111412.84 * Math.cos((cLat * Math.PI) / 180));
    minLat = cLat - dLat;
    maxLat = cLat + dLat;
    minLng = cLng - dLng;
    maxLng = cLng + dLng;
  } else {
    return;
  }

  let zoom = 20;
  while (zoom > 14) {
    const txSpan =
      Math.floor(lngToTileX(maxLng, zoom)) -
      Math.floor(lngToTileX(minLng, zoom)) +
      1;
    const tySpan =
      Math.floor(latToTileY(minLat, zoom)) -
      Math.floor(latToTileY(maxLat, zoom)) +
      1;
    if (txSpan * tySpan <= 36) break;
    zoom--;
  }

  const pxLeft = lngToTileX(minLng, zoom) * 256;
  const pxRight = lngToTileX(maxLng, zoom) * 256;
  const pyTop = latToTileY(maxLat, zoom) * 256;
  const pyBottom = latToTileY(minLat, zoom) * 256;

  const satW = Math.max(10, Math.round(pxRight - pxLeft));
  const satH = Math.max(10, Math.round(pyBottom - pyTop));

  const offCanvas = document.createElement("canvas");
  offCanvas.width = satW;
  offCanvas.height = satH;
  const offCtx = offCanvas.getContext("2d");

  if (proyeccion && proyeccion.origen) {
    const { lat0, lng0, mPorLat, mPorLng, minX, maxY } = proyeccion.origen;
    sateliteAutoBoundsM = {
      x1: (minLng - lng0) * mPorLng - minX,
      y1: maxY - (maxLat - lat0) * mPorLat,
      x2: (maxLng - lng0) * mPorLng - minX,
      y2: maxY - (minLat - lat0) * mPorLat,
    };
  } else {
    const anchoM =
      parseFloat(document.getElementById("inpAnchoMetros").value) || 100;
    const altoM =
      parseFloat(document.getElementById("inpAltoMetros").value) || 80;
    sateliteAutoBoundsM = { x1: 0, y1: 0, x2: anchoM, y2: altoM };
  }

  const txMin = Math.floor(pxLeft / 256);
  const txMax = Math.floor(pxRight / 256);
  const tyMin = Math.floor(pyTop / 256);
  const tyMax = Math.floor(pyBottom / 256);

  for (let tx = txMin; tx <= txMax; tx++) {
    for (let ty = tyMin; ty <= tyMax; ty++) {
      const tileImg = new Image();
      const dx = tx * 256 - pxLeft;
      const dy = ty * 256 - pyTop;

      tileImg.onload = () => {
        offCtx.drawImage(tileImg, dx, dy, 256, 256);
        sateliteAutoCanvas = offCanvas;
        redibujarLienzo();
      };
      tileImg.src =
        "https://mt1.google.com/vt/lyrs=s&x=" + tx + "&y=" + ty + "&z=" + zoom;
    }
  }
}

function cambiarModoFondo(nuevoModo) {
  modoFondo = nuevoModo;

  // Actualizar estilos de los 3 botones
  document.querySelectorAll(".fondo-btn").forEach((btn) => {
    const activo = btn.dataset.fondo === nuevoModo;
    if (activo) {
      const colorActivo =
        nuevoModo === "ORTOFOTO"
          ? "bg-emerald-600 text-white"
          : nuevoModo === "NINGUNO"
            ? "bg-slate-600 text-white"
            : "bg-sky-600 text-white";
      btn.className =
        "fondo-btn " +
        colorActivo +
        " font-bold py-2 px-1 rounded-lg transition shadow text-center";
    } else {
      btn.className =
        "fondo-btn text-slate-400 hover:text-white font-semibold py-2 px-1 rounded-lg transition text-center";
    }
  });

  const panelSubir = document.getElementById("panelSubirOrtofoto");
  const panelControles = document.getElementById("panelControlesFondo");
  const controlesManuales = document.getElementById(
    "controlesManualesOrtofoto",
  );
  const txtBtnSubir = document.getElementById("txtBtnSubirOrto");

  if (nuevoModo === "NINGUNO") {
    panelSubir.classList.add("hidden");
    panelControles.classList.add("hidden");
    controlesManuales.classList.add("hidden");
  } else if (nuevoModo === "SATELITE") {
    panelSubir.classList.add("hidden");
    panelControles.classList.remove("hidden");
    controlesManuales.classList.add("hidden");

    const opPct = Math.round(opacidadSateliteAuto * 100);
    document.getElementById("rngOpacidadOrto").value = opPct;
    document.getElementById("valOpacidadOrto").innerText = opPct + "%";
  } else if (nuevoModo === "ORTOFOTO") {
    panelSubir.classList.remove("hidden");
    txtBtnSubir.innerText = ortofotoImgObj
      ? "Cambiar Ortofoto / Captura HD"
      : "Subir Ortofoto / Captura HD";

    if (ortofotoConfig && ortofotoImgObj) {
      panelControles.classList.remove("hidden");
      controlesManuales.classList.remove("hidden");
      const opPct = Math.round(ortofotoConfig.opacidad * 100);
      document.getElementById("rngOpacidadOrto").value = opPct;
      document.getElementById("valOpacidadOrto").innerText = opPct + "%";
    } else {
      panelControles.classList.add("hidden");
      controlesManuales.classList.add("hidden");
    }
  }

  redibujarLienzo();
}

function aplicarOrtofotoEnUI(config) {
  if (!config || !config.imagen || config.imagen === "NONE") {
    ortofotoConfig = null;
    ortofotoImgObj = null;
    cambiarModoFondo(
      config && config.modo === "NINGUNO" ? "NINGUNO" : "SATELITE",
    );
    return;
  }

  ortofotoConfig = {
    imagen: config.imagen,
    opacidad: config.opacidad ?? 0.75,
    escala: config.escala ?? 1.0,
    rotacion: config.rotacion ?? 0,
    offsetX: config.offsetX ?? 0,
    offsetY: config.offsetY ?? 0,
  };

  document.getElementById("rngEscalaOrto").value = Math.round(
    ortofotoConfig.escala * 100,
  );
  document.getElementById("valEscalaOrto").innerText =
    Math.round(ortofotoConfig.escala * 100) + "%";

  document.getElementById("rngRotacionOrto").value = ortofotoConfig.rotacion;
  document.getElementById("valRotacionOrto").innerText =
    ortofotoConfig.rotacion + "°";

  document.getElementById("inpOffsetXOrto").value = ortofotoConfig.offsetX;
  document.getElementById("inpOffsetYOrto").value = ortofotoConfig.offsetY;

  const img = new Image();
  img.onload = () => {
    ortofotoImgObj = img;
    cambiarModoFondo(config.modo || "ORTOFOTO");
  };
  img.src = ortofotoConfig.imagen;
}

function cargarOrtofotoDesdeArchivo(evento) {
  const archivo = evento.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = (e) => {
    const imgTemp = new Image();
    imgTemp.onload = () => {
      const MAX_LADO = 1600;
      let w = imgTemp.width;
      let h = imgTemp.height;
      if (w > MAX_LADO || h > MAX_LADO) {
        if (w > h) {
          h = Math.round((h * MAX_LADO) / w);
          w = MAX_LADO;
        } else {
          w = Math.round((w * MAX_LADO) / h);
          h = MAX_LADO;
        }
      }

      const offCanvas = document.createElement("canvas");
      offCanvas.width = w;
      offCanvas.height = h;
      const offCtx = offCanvas.getContext("2d");
      offCtx.drawImage(imgTemp, 0, 0, w, h);

      const dataUrlComprimida = offCanvas.toDataURL("image/jpeg", 0.85);
      aplicarOrtofotoEnUI({
        modo: "ORTOFOTO",
        imagen: dataUrlComprimida,
        opacidad: 0.75,
        escala: 1.0,
        rotacion: 0,
        offsetX: 0,
        offsetY: 0,
      });
    };
    imgTemp.src = e.target.result;
  };
  lector.readAsDataURL(archivo);
  evento.target.value = "";
}

function actualizarCalibracionOrtofoto() {
  const opPct =
    parseInt(document.getElementById("rngOpacidadOrto").value, 10) || 65;
  document.getElementById("valOpacidadOrto").innerText = opPct + "%";

  if (modoFondo === "SATELITE") {
    opacidadSateliteAuto = opPct / 100;
    redibujarLienzo();
    return;
  }

  if (!ortofotoConfig) return;

  const escPct =
    parseInt(document.getElementById("rngEscalaOrto").value, 10) || 100;
  const rot =
    parseInt(document.getElementById("rngRotacionOrto").value, 10) || 0;
  const offX = parseFloat(document.getElementById("inpOffsetXOrto").value) || 0;
  const offY = parseFloat(document.getElementById("inpOffsetYOrto").value) || 0;

  ortofotoConfig.opacidad = opPct / 100;
  ortofotoConfig.escala = escPct / 100;
  ortofotoConfig.rotacion = rot;
  ortofotoConfig.offsetX = offX;
  ortofotoConfig.offsetY = offY;

  document.getElementById("valEscalaOrto").innerText = escPct + "%";
  document.getElementById("valRotacionOrto").innerText = rot + "°";

  redibujarLienzo();
}

async function cargarDisenoParcela() {
  const idParcela = document.getElementById("selParcelaDiseno").value;
  if (!idParcela) return;

  const parcelaObj = parcelasDisponibles.find((p) => p.id == idParcela);
  let poligonoRaw = [];
  if (parcelaObj && parcelaObj.poligono_json) {
    try {
      poligonoRaw =
        typeof parcelaObj.poligono_json === "string"
          ? JSON.parse(parcelaObj.poligono_json)
          : parcelaObj.poligono_json;
    } catch (e) {
      poligonoRaw = [];
    }
  }

  const proyeccion = proyectarContornoAMetros(poligonoRaw);
  contornoMetros = proyeccion.puntos;

  try {
    const res = await fetch("/api/diseno2d/" + idParcela);
    const data = await res.json();

    if (contornoMetros.length >= 3) {
      document.getElementById("inpAnchoMetros").value = proyeccion.anchoTotal;
      document.getElementById("inpAltoMetros").value = proyeccion.altoTotal;
    } else if (data.existe && data.diseno) {
      document.getElementById("inpAnchoMetros").value =
        data.diseno.ancho_metros;
      document.getElementById("inpAltoMetros").value = data.diseno.alto_metros;
    }

    generarFondoSatelitalParcela(parcelaObj, poligonoRaw, proyeccion);

    if (data.existe && data.diseno) {
      document.getElementById("inpCostoPvc").value =
        data.diseno.costo_metro_pvc;
      document.getElementById("inpAlcanceMesh").value =
        data.diseno.alcance_mesh_metros;
      nodosPlano = Array.isArray(data.diseno.nodos) ? data.diseno.nodos : [];
      aplicarOrtofotoEnUI(data.diseno.ortofoto);
    } else {
      nodosPlano = [];
      aplicarOrtofotoEnUI(null);
    }

    resetearVistaCanvas(false);
    recalcularYRedibujar();
  } catch (err) {
    console.error("Error cargando plano 2D:", err);
  }
}

async function guardarDisenoActual() {
  const idParcela = document.getElementById("selParcelaDiseno").value;
  if (!idParcela) {
    alert("Primero crea y selecciona una parcela en el Gestor de Parcelas.");
    return;
  }

  let ortofotoPayload = null;
  if (modoFondo === "ORTOFOTO" && ortofotoConfig && ortofotoConfig.imagen) {
    ortofotoPayload = {
      modo: "ORTOFOTO",
      imagen: ortofotoConfig.imagen,
      opacidad: ortofotoConfig.opacidad,
      escala: ortofotoConfig.escala,
      rotacion: ortofotoConfig.rotacion,
      offsetX: ortofotoConfig.offsetX,
      offsetY: ortofotoConfig.offsetY,
    };
  } else if (modoFondo === "NINGUNO") {
    ortofotoPayload = {
      modo: "NINGUNO",
      imagen: "NONE",
    };
  }

  const payload = {
    ancho_metros:
      parseFloat(document.getElementById("inpAnchoMetros").value) || 100,
    alto_metros:
      parseFloat(document.getElementById("inpAltoMetros").value) || 80,
    costo_metro_pvc:
      parseFloat(document.getElementById("inpCostoPvc").value) || 4.5,
    alcance_mesh_metros:
      parseFloat(document.getElementById("inpAlcanceMesh").value) || 50,
    nodos: nodosPlano,
    ortofoto: ortofotoPayload,
  };

  try {
    const res = await fetch("/api/diseno2d/" + idParcela, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      alert("✅ Plano 2D y topología guardados correctamente.");
    } else {
      alert("❌ Error: " + (data.error || "No se pudo guardar el plano"));
    }
  } catch (err) {
    alert("Error de conexión al guardar el diseño 2D.");
  }
}

function seleccionarHerramienta(herramienta) {
  herramientaActiva = herramienta;
  document.getElementById("lblAyudaHerramienta").innerText =
    TEXTOS_AYUDA[herramienta] || "";

  document.querySelectorAll(".tool-btn").forEach((btn) => {
    const esActiva = btn.dataset.tool === herramienta;
    if (esActiva) {
      btn.className =
        "tool-btn bg-sky-600 text-white font-bold py-2.5 px-2 rounded-xl border border-sky-400/40 transition flex items-center justify-center gap-1.5 shadow";
    } else {
      const colorTxt =
        btn.dataset.tool === "BORRAR" ? "text-rose-400" : "text-slate-300";
      btn.className =
        "tool-btn bg-slate-900 " +
        colorTxt +
        " hover:text-white font-semibold py-2.5 px-2 rounded-xl border border-slate-700 transition flex items-center justify-center gap-1.5";
    }
  });
}

function generarPlantillaEjemplo() {
  const ancho =
    parseFloat(document.getElementById("inpAnchoMetros").value) || 100;
  const alto = parseFloat(document.getElementById("inpAltoMetros").value) || 80;

  nodosPlano = [
    {
      id: 1,
      tipo: "BOMBA",
      etiqueta: "B-1",
      x: +(ancho * 0.25).toFixed(1),
      y: +(alto * 0.5).toFixed(1),
    },
    {
      id: 2,
      tipo: "VALVULA",
      etiqueta: "V-1",
      x: +(ancho * 0.42).toFixed(1),
      y: +(alto * 0.3).toFixed(1),
    },
    {
      id: 3,
      tipo: "VALVULA",
      etiqueta: "V-2",
      x: +(ancho * 0.45).toFixed(1),
      y: +(alto * 0.7).toFixed(1),
    },
    {
      id: 4,
      tipo: "VALVULA",
      etiqueta: "V-3",
      x: +(ancho * 0.7).toFixed(1),
      y: +(alto * 0.35).toFixed(1),
    },
    {
      id: 5,
      tipo: "NODO_ESP32",
      etiqueta: "ESP-1",
      x: +(ancho * 0.5).toFixed(1),
      y: +(alto * 0.5).toFixed(1),
    },
    {
      id: 6,
      tipo: "NODO_ESP32",
      etiqueta: "ESP-2",
      x: +(ancho * 0.75).toFixed(1),
      y: +(alto * 0.55).toFixed(1),
    },
  ];

  recalcularYRedibujar();
}

function limpiarLienzo() {
  if (nodosPlano.length === 0) return;
  if (!confirm("¿Limpiar todos los nodos del lienzo 2D?")) return;
  nodosPlano = [];
  recalcularYRedibujar();
}

function cambiarZoomCanvas(delta) {
  const canvas = document.getElementById("canvasDiseno2d");
  if (!canvas) return;

  const centroX = (canvas.width + ANCHO_REGLA_IZQ) / 2;
  const centroY = (canvas.height + ALTO_REGLA_SUP) / 2;
  const nuevoZoom = Math.max(
    0.25,
    Math.min(6.0, +(zoomCanvas + delta).toFixed(2)),
  );

  panCanvasX = centroX - (centroX - panCanvasX) * (nuevoZoom / zoomCanvas);
  panCanvasY = centroY - (centroY - panCanvasY) * (nuevoZoom / zoomCanvas);
  zoomCanvas = nuevoZoom;

  document.getElementById("lblNivelZoom").innerText =
    Math.round(zoomCanvas * 100) + "%";
  redibujarLienzo();
}

function resetearVistaCanvas(redibujar = true) {
  ajustarResolucionCanvas();
  const canvas = document.getElementById("canvasDiseno2d");
  const W = canvas ? canvas.width : 900;
  const H = canvas ? canvas.height : 560;

  const anchoMetros =
    parseFloat(document.getElementById("inpAnchoMetros").value) || 100;
  const altoMetros =
    parseFloat(document.getElementById("inpAltoMetros").value) || 80;

  const areaUtilW = Math.max(200, W - ANCHO_REGLA_IZQ - 80);
  const areaUtilH = Math.max(200, H - ALTO_REGLA_SUP - 80);

  escalaBasePxPorMetro = Math.min(
    areaUtilW / anchoMetros,
    areaUtilH / altoMetros,
  );
  zoomCanvas = 1.0;

  const dibujoW = anchoMetros * escalaBasePxPorMetro;
  const dibujoH = altoMetros * escalaBasePxPorMetro;

  panCanvasX = ANCHO_REGLA_IZQ + (W - ANCHO_REGLA_IZQ - dibujoW) / 2;
  panCanvasY = ALTO_REGLA_SUP + (H - ALTO_REGLA_SUP - dibujoH) / 2;

  const lbl = document.getElementById("lblNivelZoom");
  if (lbl) lbl.innerText = "100%";
  if (redibujar) redibujarLienzo();
}

function obtenerPosicionMetros(evento) {
  const canvas = document.getElementById("canvasDiseno2d");
  const rect = canvas.getBoundingClientRect();

  const canvasX = ((evento.clientX - rect.left) / rect.width) * canvas.width;
  const canvasY = ((evento.clientY - rect.top) / rect.height) * canvas.height;

  const pxPorMetroActual = escalaBasePxPorMetro * zoomCanvas;
  const x = +((canvasX - panCanvasX) / pxPorMetroActual).toFixed(1);
  const y = +((canvasY - panCanvasY) / pxPorMetroActual).toFixed(1);

  return { x, y };
}

function buscarNodoCercano(xMetros, yMetros) {
  const pxPorMetroActual = escalaBasePxPorMetro * zoomCanvas;
  const radioDeteccionMetros = 18 / pxPorMetroActual;

  let masCercano = null;
  let distMin = Infinity;

  nodosPlano.forEach((n) => {
    const d = Math.hypot(n.x - xMetros, n.y - yMetros);
    if (d <= radioDeteccionMetros && d < distMin) {
      distMin = d;
      masCercano = n;
    }
  });

  return masCercano;
}

function inicializarEventosCanvas() {
  const canvas = document.getElementById("canvasDiseno2d");
  if (!canvas) return;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const nuevoZoom = Math.max(
      0.25,
      Math.min(6.0, +(zoomCanvas * factor).toFixed(2)),
    );

    panCanvasX = mouseX - (mouseX - panCanvasX) * (nuevoZoom / zoomCanvas);
    panCanvasY = mouseY - (mouseY - panCanvasY) * (nuevoZoom / zoomCanvas);
    zoomCanvas = nuevoZoom;

    document.getElementById("lblNivelZoom").innerText =
      Math.round(zoomCanvas * 100) + "%";
    redibujarLienzo();
  });

  canvas.addEventListener("mousemove", (e) => {
    const pos = obtenerPosicionMetros(e);
    document.getElementById("lblCoordsCursor").innerText =
      "X: " + pos.x.toFixed(1) + " m | Y: " + pos.y.toFixed(1) + " m";

    if (nodoArrastrado) {
      nodoArrastrado.x = pos.x;
      nodoArrastrado.y = pos.y;
      recalcularYRedibujar();
      return;
    }

    if (arrastrandoFondo) {
      const rect = canvas.getBoundingClientRect();
      const escalaX = canvas.width / rect.width;
      const escalaY = canvas.height / rect.height;
      panCanvasX += (e.clientX - inicioArrastreFondo.x) * escalaX;
      panCanvasY += (e.clientY - inicioArrastreFondo.y) * escalaY;
      inicioArrastreFondo = { x: e.clientX, y: e.clientY };
      redibujarLienzo();
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    const pos = obtenerPosicionMetros(e);
    const nodoClic = buscarNodoCercano(pos.x, pos.y);

    if (herramientaActiva === "MOVER") {
      if (nodoClic) {
        nodoArrastrado = nodoClic;
      } else {
        arrastrandoFondo = true;
        inicioArrastreFondo = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    if (herramientaActiva === "BORRAR") {
      if (nodoClic) {
        nodosPlano = nodosPlano.filter((n) => n.id !== nodoClic.id);
        recalcularYRedibujar();
      }
      return;
    }

    const estilo = ESTILOS_NODO[herramientaActiva];
    if (!estilo) return;

    const cantidadTipo =
      nodosPlano.filter((n) => n.tipo === herramientaActiva).length + 1;
    nodosPlano.push({
      id: Date.now(),
      tipo: herramientaActiva,
      etiqueta: estilo.prefijo + "-" + cantidadTipo,
      x: pos.x,
      y: pos.y,
    });
    recalcularYRedibujar();
  });

  window.addEventListener("mouseup", () => {
    nodoArrastrado = null;
    arrastrandoFondo = false;
  });
}

function calcularArbolExpansionMinima(listaNodos) {
  if (!listaNodos || listaNodos.length < 2) return [];

  const visitados = new Set([listaNodos[0].id]);
  const aristas = [];

  while (visitados.size < listaNodos.length) {
    let mejorOrigen = null;
    let mejorDestino = null;
    let menorDistancia = Infinity;

    listaNodos.forEach((origen) => {
      if (!visitados.has(origen.id)) return;
      listaNodos.forEach((destino) => {
        if (visitados.has(destino.id)) return;
        const dist = Math.hypot(origen.x - destino.x, origen.y - destino.y);
        if (dist < menorDistancia) {
          menorDistancia = dist;
          mejorOrigen = origen;
          mejorDestino = destino;
        }
      });
    });

    if (mejorOrigen && mejorDestino) {
      visitados.add(mejorDestino.id);
      aristas.push({
        origen: mejorOrigen,
        destino: mejorDestino,
        distancia: menorDistancia,
      });
    } else {
      break;
    }
  }

  return aristas;
}

function recalcularYRedibujar() {
  const costoPorMetro =
    parseFloat(document.getElementById("inpCostoPvc").value) || 0;
  const alcanceMaxMesh =
    parseFloat(document.getElementById("inpAlcanceMesh").value) || 50;

  const nodosHidraulicos = nodosPlano.filter(
    (n) => n.tipo === "BOMBA" || n.tipo === "VALVULA",
  );
  const hayBomba = nodosHidraulicos.some((n) => n.tipo === "BOMBA");
  aristasPvc = hayBomba ? calcularArbolExpansionMinima(nodosHidraulicos) : [];

  const totalMetrosPvc = aristasPvc.reduce((acc, a) => acc + a.distancia, 0);
  const costoTotalPvc = totalMetrosPvc * costoPorMetro;

  document.getElementById("kpiMetrosPvc").innerText =
    totalMetrosPvc.toFixed(1) + " m";
  document.getElementById("kpiTramosPvc").innerText = hayBomba
    ? aristasPvc.length +
      (aristasPvc.length === 1 ? " tramo conectado" : " tramos conectados")
    : "Agrega una Bomba para trazar red";
  document.getElementById("kpiCostoPvc").innerText =
    "S/ " + costoTotalPvc.toFixed(2);

  const nodosMesh = nodosPlano.filter(
    (n) =>
      n.tipo === "BOMBA" || n.tipo === "NODO_ESP32" || n.tipo === "REPETIDOR",
  );
  aristasMesh = calcularArbolExpansionMinima(nodosMesh);

  const enlacesFueraRango = aristasMesh.filter(
    (a) => a.distancia > alcanceMaxMesh,
  ).length;
  document.getElementById("kpiEnlacesMesh").innerText =
    aristasMesh.length + (aristasMesh.length === 1 ? " enlace" : " enlaces");

  const lblMesh = document.getElementById("kpiEstadoMesh");
  if (enlacesFueraRango > 0) {
    lblMesh.className = "text-[11px] text-rose-400 font-bold mt-0.5";
    lblMesh.innerText =
      "⚠️ " + enlacesFueraRango + " enlace(s) fuera de alcance";
  } else {
    lblMesh.className = "text-[11px] text-emerald-400 mt-0.5";
    lblMesh.innerText = "Cobertura inalámbrica óptima";
  }

  const cBombas = nodosPlano.filter((n) => n.tipo === "BOMBA").length;
  const cValvulas = nodosPlano.filter((n) => n.tipo === "VALVULA").length;
  const cEsp = nodosPlano.filter(
    (n) => n.tipo === "NODO_ESP32" || n.tipo === "REPETIDOR",
  ).length;

  document.getElementById("kpiTotalNodos").innerText =
    nodosPlano.length + (nodosPlano.length === 1 ? " nodo" : " nodos");
  document.getElementById("kpiDetalleNodos").innerText =
    cBombas + " bombas • " + cValvulas + " válvulas • " + cEsp + " radio";

  redibujarLienzo();
}

function obtenerPasoCuadricula(pxPorMetro) {
  const objetivoPx = 85;
  const metrosAprox = objetivoPx / pxPorMetro;
  const pasos = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  for (let i = 0; i < pasos.length; i++) {
    if (pasos[i] >= metrosAprox) return pasos[i];
  }
  return 500;
}

function redibujarLienzo() {
  ajustarResolucionCanvas();
  const canvas = document.getElementById("canvasDiseno2d");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = canvas.width;
  const H = canvas.height;
  const anchoMetros =
    parseFloat(document.getElementById("inpAnchoMetros").value) || 100;
  const altoMetros =
    parseFloat(document.getElementById("inpAltoMetros").value) || 80;
  const alcanceMaxMesh =
    parseFloat(document.getElementById("inpAlcanceMesh").value) || 50;

  const pxPorMetro = escalaBasePxPorMetro * zoomCanvas;
  const aPantallaX = (xM) => xM * pxPorMetro + panCanvasX;
  const aPantallaY = (yM) => yM * pxPorMetro + panCanvasY;

  // 1. Fondo completo del viewport
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, W, H);

  // 2. CAPA AÉREA según el modo seleccionado (SATELITE | ORTOFOTO | NINGUNO)
  let hayImagenActiva = false;

  if (modoFondo === "ORTOFOTO" && ortofotoConfig && ortofotoImgObj) {
    hayImagenActiva = true;
    ctx.save();
    ctx.globalAlpha = ortofotoConfig.opacidad;

    let centroM_X = anchoMetros / 2;
    let centroM_Y = altoMetros / 2;
    let refAnchoM = anchoMetros;

    if (contornoMetros.length >= 3) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      contornoMetros.forEach((pt) => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
      centroM_X = (minX + maxX) / 2;
      centroM_Y = (minY + maxY) / 2;
      refAnchoM = Math.max(maxX - minX, maxY - minY);
    }

    const cx = aPantallaX(centroM_X + ortofotoConfig.offsetX);
    const cy = aPantallaY(centroM_Y + ortofotoConfig.offsetY);
    const drawW = refAnchoM * pxPorMetro * ortofotoConfig.escala;
    const drawH = drawW * (ortofotoImgObj.height / ortofotoImgObj.width);

    ctx.translate(cx, cy);
    ctx.rotate((ortofotoConfig.rotacion * Math.PI) / 180);
    ctx.drawImage(ortofotoImgObj, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  } else if (
    modoFondo === "SATELITE" &&
    sateliteAutoCanvas &&
    sateliteAutoBoundsM
  ) {
    hayImagenActiva = true;
    ctx.save();
    ctx.globalAlpha = opacidadSateliteAuto;
    const sx = aPantallaX(sateliteAutoBoundsM.x1);
    const sy = aPantallaY(sateliteAutoBoundsM.y1);
    const sw = aPantallaX(sateliteAutoBoundsM.x2) - sx;
    const sh = aPantallaY(sateliteAutoBoundsM.y2) - sy;
    ctx.drawImage(sateliteAutoCanvas, sx, sy, sw, sh);
    ctx.restore();
  }

  // 3. Cuadrícula Infinita
  const pasoGrid = obtenerPasoCuadricula(pxPorMetro);
  const minX_M = (ANCHO_REGLA_IZQ - panCanvasX) / pxPorMetro;
  const maxX_M = (W - panCanvasX) / pxPorMetro;
  const minY_M = (ALTO_REGLA_SUP - panCanvasY) / pxPorMetro;
  const maxY_M = (H - panCanvasY) / pxPorMetro;

  const inicioX = Math.floor(minX_M / pasoGrid) * pasoGrid;
  const inicioY = Math.floor(minY_M / pasoGrid) * pasoGrid;

  ctx.strokeStyle = hayImagenActiva
    ? "rgba(148, 163, 184, 0.14)"
    : "rgba(30, 41, 59, 0.85)";
  ctx.lineWidth = 1;

  let lineasX = 0;
  for (
    let xM = inicioX;
    xM <= maxX_M && lineasX < 250;
    xM += pasoGrid, lineasX++
  ) {
    const sx = aPantallaX(xM);
    ctx.beginPath();
    ctx.moveTo(sx, ALTO_REGLA_SUP);
    ctx.lineTo(sx, H);
    ctx.stroke();
  }

  let lineasY = 0;
  for (
    let yM = inicioY;
    yM <= maxY_M && lineasY < 250;
    yM += pasoGrid, lineasY++
  ) {
    const sy = aPantallaY(yM);
    ctx.beginPath();
    ctx.moveTo(ANCHO_REGLA_IZQ, sy);
    ctx.lineTo(W, sy);
    ctx.stroke();
  }

  // Ejes principales 0m
  ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
  ctx.beginPath();
  ctx.moveTo(aPantallaX(0), ALTO_REGLA_SUP);
  ctx.lineTo(aPantallaX(0), H);
  ctx.moveTo(ANCHO_REGLA_IZQ, aPantallaY(0));
  ctx.lineTo(W, aPantallaY(0));
  ctx.stroke();

  // 4. Contorno Real de la Parcela
  if (contornoMetros.length >= 3) {
    ctx.save();
    ctx.beginPath();
    contornoMetros.forEach((pt, i) => {
      const sx = aPantallaX(pt.x);
      const sy = aPantallaY(pt.y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();

    ctx.fillStyle = hayImagenActiva
      ? "rgba(16, 185, 129, 0.05)"
      : "rgba(16, 185, 129, 0.14)";
    ctx.fill();

    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (let i = 0; i < contornoMetros.length; i++) {
      const p1 = contornoMetros[i];
      const p2 = contornoMetros[(i + 1) % contornoMetros.length];
      const distLado = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      const mx = (aPantallaX(p1.x) + aPantallaX(p2.x)) / 2;
      const my = (aPantallaY(p1.y) + aPantallaY(p2.y)) / 2;

      ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
      ctx.fillRect(mx - 23, my - 8, 46, 15);
      ctx.fillStyle = "#34d399";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(distLado.toFixed(1) + "m", mx, my + 3);

      ctx.beginPath();
      ctx.arc(aPantallaX(p1.x), aPantallaY(p1.y), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#6ee7b7";
      ctx.fill();
    }
    ctx.restore();
  }

  // 5. Capa Tuberías PVC Óptimas
  if (document.getElementById("chkCapaPvc").checked) {
    aristasPvc.forEach((arista) => {
      const x1 = aPantallaX(arista.origen.x);
      const y1 = aPantallaY(arista.origen.y);
      const x2 = aPantallaX(arista.destino.x);
      const y2 = aPantallaY(arista.destino.y);

      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(mx - 22, my - 9, 44, 16);
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(arista.distancia.toFixed(1) + "m", mx, my + 3);
      ctx.restore();
    });
  }

  // 6. Capa Enlaces Inalámbricos Mesh
  if (document.getElementById("chkCapaMesh").checked) {
    aristasMesh.forEach((arista) => {
      const x1 = aPantallaX(arista.origen.x);
      const y1 = aPantallaY(arista.origen.y);
      const x2 = aPantallaX(arista.destino.x);
      const y2 = aPantallaY(arista.destino.y);
      const fueraRango = arista.distancia > alcanceMaxMesh;

      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = fueraRango ? "#f43f5e" : "#a7f3d0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 + 13;
      ctx.fillStyle = fueraRango ? "#f43f5e" : "#6ee7b7";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        (fueraRango ? "⚠️ " : "") + arista.distancia.toFixed(0) + "m",
        mx,
        my,
      );
      ctx.restore();
    });
  }

  // 7. Nodos
  nodosPlano.forEach((nodo) => {
    const sx = aPantallaX(nodo.x);
    const sy = aPantallaY(nodo.y);
    const estilo = ESTILOS_NODO[nodo.tipo] || ESTILOS_NODO.VALVULA;
    const radio = 15;

    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, radio, 0, Math.PI * 2);
    ctx.fillStyle = estilo.color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = estilo.borde;
    ctx.stroke();

    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(estilo.icono, sx, sy + 1);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(
      nodo.etiqueta + " (" + nodo.x + "," + nodo.y + ")",
      sx,
      sy + radio + 11,
    );
    ctx.restore();
  });

  // 8. Reglas Fijas Superior e Izquierda
  ctx.save();

  ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
  ctx.fillRect(ANCHO_REGLA_IZQ, 0, W - ANCHO_REGLA_IZQ, ALTO_REGLA_SUP);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ANCHO_REGLA_IZQ, ALTO_REGLA_SUP);
  ctx.lineTo(W, ALTO_REGLA_SUP);
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  lineasX = 0;
  for (
    let xM = inicioX;
    xM <= maxX_M && lineasX < 250;
    xM += pasoGrid, lineasX++
  ) {
    const sx = aPantallaX(xM);
    if (sx < ANCHO_REGLA_IZQ + 14 || sx > W - 14) continue;
    ctx.beginPath();
    ctx.moveTo(sx, ALTO_REGLA_SUP - 5);
    ctx.lineTo(sx, ALTO_REGLA_SUP);
    ctx.stroke();
    ctx.fillText(Math.round(xM) + "m", sx, 14);
  }

  ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
  ctx.fillRect(0, ALTO_REGLA_SUP, ANCHO_REGLA_IZQ, H - ALTO_REGLA_SUP);
  ctx.beginPath();
  ctx.moveTo(ANCHO_REGLA_IZQ, ALTO_REGLA_SUP);
  ctx.lineTo(ANCHO_REGLA_IZQ, H);
  ctx.stroke();

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  lineasY = 0;
  for (
    let yM = inicioY;
    yM <= maxY_M && lineasY < 250;
    yM += pasoGrid, lineasY++
  ) {
    const sy = aPantallaY(yM);
    if (sy < ALTO_REGLA_SUP + 10 || sy > H - 10) continue;
    ctx.beginPath();
    ctx.moveTo(ANCHO_REGLA_IZQ - 5, sy);
    ctx.lineTo(ANCHO_REGLA_IZQ, sy);
    ctx.stroke();
    ctx.fillText(Math.round(yM) + "m", ANCHO_REGLA_IZQ - 7, sy);
  }

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, ANCHO_REGLA_IZQ, ALTO_REGLA_SUP);
  ctx.strokeRect(0, 0, ANCHO_REGLA_IZQ, ALTO_REGLA_SUP);
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("m", ANCHO_REGLA_IZQ / 2, ALTO_REGLA_SUP / 2);

  ctx.restore();
}
