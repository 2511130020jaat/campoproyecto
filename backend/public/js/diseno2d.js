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

// Vista del lienzo inferior en ASIR: "2d" o "3d"
let modoVistaEnAsir = "2d";

// Integración ASIR IO (puerto 5000 / 5173)
const ASIR_IO_WEB_URL = "http://localhost:5173";
const ASIR_IO_API_URL = "http://localhost:5000";
let esquemaFinalParcelaActual = null;
let enviandoParcelaAsirIo = false;

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
  inicializarIntegracionAsirIo();
  cargarParcelasDiseno();
  window.addEventListener("resize", () => {
    ajustarResolucionCanvas();
    redibujarLienzo();
  });
});

function obtenerUsuarioActivoAsir() {
  if (typeof usuarioSesion !== "undefined" && usuarioSesion?.id) {
    return usuarioSesion;
  }
  try {
    const raw = localStorage.getItem("usuario_asir");
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

function obtenerParcelaSeleccionadaObj() {
  const idParcela = document.getElementById("selParcelaDiseno")?.value;
  if (!idParcela) return null;
  return (
    parcelasDisponibles.find((p) => String(p.id) === String(idParcela)) || null
  );
}

function escaparHtmlSimple(str) {
  return String(str ?? "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "'");
}

function renderizarResultadoFinalParcela(estadoHtml) {
  const cont = document.getElementById("resultadoFinalAsirIo");
  if (!cont) return;
  cont.innerHTML = estadoHtml;
}

function cambiarVistaEnAsir(modo) {
  modoVistaEnAsir = modo === "3d" ? "3d" : "2d";
  sincronizarResultadoFinalParcelaIo();
  redibujarLienzo();
}

async function sincronizarResultadoFinalParcelaIo() {
  const estadoEl = document.getElementById("asirIoEstadoUsuario");
  const enlaceEl = document.getElementById("enlaceAbrirAsirIo");
  const usuario = obtenerUsuarioActivoAsir();
  const parcelaObj = obtenerParcelaSeleccionadaObj();

  esquemaFinalParcelaActual = null;

  if (enlaceEl) {
    const query = new URLSearchParams();
    if (parcelaObj?.id) query.set("id_parcela", String(parcelaObj.id));
    if (usuario?.id) {
      query.set("id_usuario", String(usuario.id));
      if (usuario.nombre) query.set("usuario_nombre", String(usuario.nombre));
      if (usuario.correo) query.set("usuario_correo", String(usuario.correo));
    }
    enlaceEl.href = query.toString()
      ? `${ASIR_IO_WEB_URL}/?${query.toString()}`
      : ASIR_IO_WEB_URL;
  }

  if (!usuario || !usuario.id) {
    if (estadoEl) {
      estadoEl.textContent =
        "Sin sesión activa en ASIR — inicia sesión para enviar parcelas.";
    }
    renderizarResultadoFinalParcela(
      `<span>Inicia sesión para ver el resultado final de esta parcela en 2D / 3D.</span>`,
    );
    return;
  }

  const nombreMostrar =
    usuario.nombre || usuario.correo || usuario.email || `ID ${usuario.id}`;
  if (estadoEl) {
    estadoEl.textContent = `Usuario: ${nombreMostrar}`;
  }

  if (!parcelaObj || !parcelaObj.id) {
    renderizarResultadoFinalParcela(
      `<span>Selecciona una parcela para ver su resultado final.</span>`,
    );
    return;
  }

  try {
    const url = `${ASIR_IO_API_URL}/api/esquemas?id_usuario=${encodeURIComponent(usuario.id)}&id_parcela=${encodeURIComponent(parcelaObj.id)}`;
    const resp = await fetch(url);
    const data = await resp.json();

    const clase2d =
      modoVistaEnAsir === "2d"
        ? "bg-blue-700 text-white ring-2 ring-blue-400/50"
        : "bg-white/90 hover:bg-white text-blue-800 border border-blue-300";
    const clase3d =
      modoVistaEnAsir === "3d"
        ? "bg-indigo-700 text-white ring-2 ring-indigo-400/50"
        : "bg-white/90 hover:bg-white text-indigo-800 border border-indigo-300";

    const botonesVistaHtml = `
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onclick="cambiarVistaEnAsir('2d')"
          class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${clase2d}"
        >
          2D
        </button>
        <button
          type="button"
          onclick="cambiarVistaEnAsir('3d')"
          class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${clase3d}"
        >
          3D
        </button>
      </div>
    `;

    if (!resp.ok || !data.ok) {
      renderizarResultadoFinalParcela(`
        <div class="flex items-center justify-between gap-2">
          <span>No se pudo consultar el resultado final en ASIR IO.</span>
          ${botonesVistaHtml}
        </div>
      `);
      return;
    }

    const esquemas = Array.isArray(data.esquemas) ? data.esquemas : [];
    if (esquemas.length === 0) {
      renderizarResultadoFinalParcela(`
        <div class="flex items-center justify-between gap-2">
          <span class="truncate">Sin resultado final aún en ASIR IO.</span>
          ${botonesVistaHtml}
        </div>
      `);
      return;
    }

    const finalPlano = esquemas[0];
    esquemaFinalParcelaActual = finalPlano;
    const nombreSeguro = escaparHtmlSimple(finalPlano.nombre || finalPlano.id);

    renderizarResultadoFinalParcela(`
      <div class="flex items-center justify-between gap-2">
        <span class="font-semibold truncate">Resultado final: ${nombreSeguro}</span>
        ${botonesVistaHtml}
      </div>
    `);
  } catch {
    renderizarResultadoFinalParcela(
      `<span>ASIR IO (puerto 5000) no disponible.</span>`,
    );
  }
}

function normalizarPoligonoLatLng(poligonoRaw) {
  if (!Array.isArray(poligonoRaw)) return [];
  return poligonoRaw
    .map((pt) => {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lat = Number(pt[0]);
        const lng = Number(pt[1]);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
      }
      if (pt && typeof pt === "object") {
        const lat = Number(pt.lat ?? pt.latitude);
        const lng = Number(pt.lng ?? pt.lon ?? pt.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
      }
      return null;
    })
    .filter(Boolean);
}

function construirElementosInicialesParaAsirIo(parcelaObj, poligonoRaw) {
  const escalaPxPorMetro = 20;
  const margenPx = 80;
  const poligonoLimpio = normalizarPoligonoLatLng(poligonoRaw);

  let anchoM = Number(document.getElementById("inpAnchoMetros")?.value);
  let altoM = Number(document.getElementById("inpAltoMetros")?.value);
  const areaParcela = Number(parcelaObj?.area_m2);

  let puntosPx = [];

  if (poligonoLimpio.length >= 3) {
    const proy = proyectarContornoAMetros(poligonoLimpio);
    if (Number.isFinite(proy.anchoTotal) && proy.anchoTotal > 0) {
      anchoM = proy.anchoTotal;
    }
    if (Number.isFinite(proy.altoTotal) && proy.altoTotal > 0) {
      altoM = proy.altoTotal;
    }

    puntosPx = proy.puntos.flatMap((pt) => {
      const xM = Number(pt.x);
      const yM = Number(pt.y);
      if (!Number.isFinite(xM) || !Number.isFinite(yM)) return [];
      return [
        Math.round(margenPx + xM * escalaPxPorMetro),
        Math.round(margenPx + yM * escalaPxPorMetro),
      ];
    });
  }

  if (!Number.isFinite(anchoM) || anchoM <= 0) {
    anchoM =
      Number.isFinite(areaParcela) && areaParcela > 0
        ? Math.round(Math.sqrt(areaParcela))
        : 100;
  }
  if (!Number.isFinite(altoM) || altoM <= 0) {
    altoM =
      Number.isFinite(areaParcela) && areaParcela > 0
        ? Math.round(areaParcela / anchoM)
        : 80;
  }

  if (puntosPx.length < 6) {
    const wPx = Math.round(anchoM * escalaPxPorMetro);
    const hPx = Math.round(altoM * escalaPxPorMetro);
    puntosPx = [
      margenPx,
      margenPx,
      margenPx + wPx,
      margenPx,
      margenPx + wPx,
      margenPx + hPx,
      margenPx,
      margenPx + hPx,
    ];
  }

  const areaFinal =
    Number.isFinite(areaParcela) && areaParcela > 0
      ? +areaParcela.toFixed(2)
      : +(anchoM * altoM).toFixed(2);

  return [
    {
      id: `parcela_asir_${parcelaObj.id}_${Date.now()}`,
      id_parcela: String(parcelaObj.id),
      tipo: "parcela",
      nombre:
        parcelaObj.parcela || parcelaObj.nombre || `Parcela #${parcelaObj.id}`,
      cultivo: parcelaObj.cultivo || "General",
      puntos: puntosPx,
      anchoMetros: +anchoM.toFixed(2),
      altoMetros: +altoM.toFixed(2),
      areaM2: areaFinal,
    },
  ];
}

async function enviarParcelaSeleccionadaAAsirIo() {
  if (enviandoParcelaAsirIo) return;

  const usuario = obtenerUsuarioActivoAsir();
  if (!usuario || !usuario.id) {
    alert("Inicia sesión primero en ASIR para enviar la parcela a ASIR IO.");
    return;
  }

  const parcelaObj = obtenerParcelaSeleccionadaObj();
  if (!parcelaObj || !parcelaObj.id) {
    alert("Selecciona una parcela antes de enviarla a ASIR IO.");
    return;
  }

  let poligonoRaw = [];
  if (parcelaObj.poligono_json) {
    try {
      poligonoRaw =
        typeof parcelaObj.poligono_json === "string"
          ? JSON.parse(parcelaObj.poligono_json)
          : parcelaObj.poligono_json;
    } catch {
      poligonoRaw = [];
    }
  }

  const nombreParcela =
    parcelaObj.parcela || parcelaObj.nombre || `Parcela #${parcelaObj.id}`;
  const elementosParcela = construirElementosInicialesParaAsirIo(
    parcelaObj,
    poligonoRaw,
  );
  const elParcela = elementosParcela[0];

  const btnEnviar = document.getElementById("btnEnviarParcelaAsirIo");
  enviandoParcelaAsirIo = true;
  if (btnEnviar) {
    btnEnviar.disabled = true;
    btnEnviar.textContent = "⏳ Enviando...";
  }

  try {
    const payload = {
      id: esquemaFinalParcelaActual?.id || null,
      id_usuario: usuario.id,
      id_parcela: String(parcelaObj.id),
      nombre: `${nombreParcela} — ASIR IO`,
      elementos: elementosParcela,
      resumen: {
        parcelaMarcada: {
          id: parcelaObj.id,
          nombre: nombreParcela,
          anchoMetros: elParcela.anchoMetros,
          altoMetros: elParcela.altoMetros,
          areaM2: elParcela.areaM2,
          poligono: normalizarPoligonoLatLng(poligonoRaw),
        },
      },
    };

    const resp = await fetch(`${ASIR_IO_API_URL}/api/esquemas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();

    if (!resp.ok || !data.ok || !data.id) {
      alert(
        "❌ No se pudo enviar la parcela a ASIR IO: " +
          (data.error || "Error del servidor IO"),
      );
      return;
    }

    await sincronizarResultadoFinalParcelaIo();

    const params = new URLSearchParams({
      plano: String(data.id),
      id_parcela: String(parcelaObj.id),
      id_usuario: String(usuario.id),
      vista: "2d",
    });
    if (usuario.nombre) params.set("usuario_nombre", String(usuario.nombre));
    if (usuario.correo) params.set("usuario_correo", String(usuario.correo));

    window.open(
      `${ASIR_IO_WEB_URL}/?${params.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  } catch {
    alert(
      "⚠️ No se pudo conectar con ASIR IO (puerto 5000). Verifica que el servidor esté encendido.",
    );
  } finally {
    enviandoParcelaAsirIo = false;
    if (btnEnviar) {
      btnEnviar.disabled = false;
      btnEnviar.textContent = "🚀 Enviar parcela a ASIR IO";
    }
  }
}

function inicializarIntegracionAsirIo() {
  const btnEnviar = document.getElementById("btnEnviarParcelaAsirIo");
  btnEnviar?.addEventListener("click", enviarParcelaSeleccionadaAAsirIo);
}

function ajustarResolucionCanvas() {
  const contenedor = document.getElementById("contenedorCanvas2d");
  const canvas = document.getElementById("canvasDiseno2d");
  if (!contenedor || !canvas) return;

  const w = contenedor.clientWidth || 900;
  const h = contenedor.clientHeight || 540;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

async function cargarParcelasDiseno() {
  const select = document.getElementById("selParcelaDiseno");
  const usuario = obtenerUsuarioActivoAsir();
  if (!usuario || !usuario.id) {
    await sincronizarResultadoFinalParcelaIo();
    return;
  }

  try {
    const res = await fetch("/api/parcelas?id_usuario=" + usuario.id);
    parcelasDisponibles = await res.json();

    if (!parcelasDisponibles || parcelasDisponibles.length === 0) {
      select.innerHTML = '<option value="">Sin parcelas registradas</option>';
      nodosPlano = [];
      contornoMetros = [];
      aristasPvc = [];
      aristasMesh = [];
      sateliteAutoCanvas = null;
      sateliteAutoBoundsM = null;
      aplicarOrtofotoEnUI(null);
      resetearVistaCanvas(false);
      recalcularYRedibujar();
      await sincronizarResultadoFinalParcelaIo();
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
  const limpios = normalizarPoligonoLatLng(poligonoLatLng);
  if (limpios.length < 3) {
    return { puntos: [], anchoTotal: 100, altoTotal: 80, origen: null };
  }

  const lat0 = limpios[0][0];
  const lng0 = limpios[0][1];
  const mPorLat = 111132.92;
  const mPorLng = 111412.84 * Math.cos((lat0 * Math.PI) / 180);

  const crudos = limpios.map((p) => ({
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

  const poligonoLimpio = normalizarPoligonoLatLng(poligonoRaw);
  let minLat, maxLat, minLng, maxLng;

  if (poligonoLimpio.length >= 3) {
    minLat = Infinity;
    maxLat = -Infinity;
    minLng = Infinity;
    maxLng = -Infinity;
    poligonoLimpio.forEach((pt) => {
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
    panelSubir?.classList.add("hidden");
    panelControles?.classList.add("hidden");
    controlesManuales?.classList.add("hidden");
  } else if (nuevoModo === "SATELITE") {
    panelSubir?.classList.add("hidden");
    panelControles?.classList.remove("hidden");
    controlesManuales?.classList.add("hidden");

    const opPct = Math.round(opacidadSateliteAuto * 100);
    const rng = document.getElementById("rngOpacidadOrto");
    const lbl = document.getElementById("valOpacidadOrto");
    if (rng) rng.value = opPct;
    if (lbl) lbl.innerText = opPct + "%";
  } else if (nuevoModo === "ORTOFOTO") {
    panelSubir?.classList.remove("hidden");
    if (txtBtnSubir) {
      txtBtnSubir.innerText = ortofotoImgObj
        ? "Cambiar Ortofoto / Captura HD"
        : "Subir Ortofoto / Captura HD";
    }

    if (ortofotoConfig && ortofotoImgObj) {
      panelControles?.classList.remove("hidden");
      controlesManuales?.classList.remove("hidden");
      const opPct = Math.round(ortofotoConfig.opacidad * 100);
      const rng = document.getElementById("rngOpacidadOrto");
      const lbl = document.getElementById("valOpacidadOrto");
      if (rng) rng.value = opPct;
      if (lbl) lbl.innerText = opPct + "%";
    } else {
      panelControles?.classList.add("hidden");
      controlesManuales?.classList.add("hidden");
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

  const rngEsc = document.getElementById("rngEscalaOrto");
  const valEsc = document.getElementById("valEscalaOrto");
  const rngRot = document.getElementById("rngRotacionOrto");
  const valRot = document.getElementById("valRotacionOrto");
  const inpOffX = document.getElementById("inpOffsetXOrto");
  const inpOffY = document.getElementById("inpOffsetYOrto");

  if (rngEsc) rngEsc.value = Math.round(ortofotoConfig.escala * 100);
  if (valEsc) valEsc.innerText = Math.round(ortofotoConfig.escala * 100) + "%";
  if (rngRot) rngRot.value = ortofotoConfig.rotacion;
  if (valRot) valRot.innerText = ortofotoConfig.rotacion + "°";
  if (inpOffX) inpOffX.value = ortofotoConfig.offsetX;
  if (inpOffY) inpOffY.value = ortofotoConfig.offsetY;

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
  const valOp = document.getElementById("valOpacidadOrto");
  if (valOp) valOp.innerText = opPct + "%";

  if (modoFondo === "SATELITE") {
    opacidadSateliteAuto = opPct / 100;
    redibujarLienzo();
    return;
  }

  if (!ortofotoConfig) return;

  const escPct =
    parseInt(document.getElementById("rngEscalaOrto")?.value, 10) || 100;
  const rot =
    parseInt(document.getElementById("rngRotacionOrto")?.value, 10) || 0;
  const offX =
    parseFloat(document.getElementById("inpOffsetXOrto")?.value) || 0;
  const offY =
    parseFloat(document.getElementById("inpOffsetYOrto")?.value) || 0;

  ortofotoConfig.opacidad = opPct / 100;
  ortofotoConfig.escala = escPct / 100;
  ortofotoConfig.rotacion = rot;
  ortofotoConfig.offsetX = offX;
  ortofotoConfig.offsetY = offY;

  const valEsc = document.getElementById("valEscalaOrto");
  const valRot = document.getElementById("valRotacionOrto");
  if (valEsc) valEsc.innerText = escPct + "%";
  if (valRot) valRot.innerText = rot + "°";

  redibujarLienzo();
}

async function cargarDisenoParcela() {
  const idParcela = document.getElementById("selParcelaDiseno").value;
  if (!idParcela) {
    await sincronizarResultadoFinalParcelaIo();
    return;
  }

  const parcelaObj = parcelasDisponibles.find((p) => p.id == idParcela);
  let poligonoRaw = [];
  if (parcelaObj && parcelaObj.poligono_json) {
    try {
      poligonoRaw =
        typeof parcelaObj.poligono_json === "string"
          ? JSON.parse(parcelaObj.poligono_json)
          : parcelaObj.poligono_json;
    } catch {
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
    await sincronizarResultadoFinalParcelaIo();
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
  } catch {
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
        "tool-btn bg-sky-600 text-white font-bold py-2 px-2 rounded-xl border border-sky-400/40 transition flex items-center justify-center gap-1.5 shadow";
    } else {
      const colorTxt =
        btn.dataset.tool === "BORRAR" ? "text-rose-400" : "text-slate-300";
      btn.className =
        "tool-btn bg-slate-900 " +
        colorTxt +
        " hover:text-white font-semibold py-2 px-2 rounded-xl border border-slate-700 transition flex items-center justify-center gap-1.5";
    }
  });
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
  const H = canvas ? canvas.height : 540;

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

function dibujarVista3DEnAsir(
  ctx,
  W,
  H,
  pxPorMetro,
  aPantallaX,
  aPantallaY,
  alcanceMaxMesh,
) {
  const elevacionBasePx = 22;

  const proyectar3D = (xM, yM, alturaM = 0) => {
    const sx = aPantallaX(xM);
    const sy = aPantallaY(yM);
    return {
      x: sx + alturaM * 0.35 * pxPorMetro * 0.45,
      y: sy - alturaM * elevacionBasePx * (pxPorMetro / 6),
    };
  };

  if (contornoMetros.length >= 3) {
    ctx.save();
    ctx.beginPath();
    contornoMetros.forEach((pt, i) => {
      const p3 = proyectar3D(pt.x, pt.y, -0.8);
      if (i === 0) ctx.moveTo(p3.x, p3.y);
      else ctx.lineTo(p3.x, p3.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(6, 78, 59, 0.55)";
    ctx.fill();
    ctx.strokeStyle = "#047857";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (let i = 0; i < contornoMetros.length; i++) {
      const a = contornoMetros[i];
      const b = contornoMetros[(i + 1) % contornoMetros.length];
      const supA = proyectar3D(a.x, a.y, 0);
      const supB = proyectar3D(b.x, b.y, 0);
      const infB = proyectar3D(b.x, b.y, -0.8);
      const infA = proyectar3D(a.x, a.y, -0.8);

      ctx.beginPath();
      ctx.moveTo(supA.x, supA.y);
      ctx.lineTo(supB.x, supB.y);
      ctx.lineTo(infB.x, infB.y);
      ctx.lineTo(infA.x, infA.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(16, 185, 129, 0.22)";
      ctx.fill();
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    contornoMetros.forEach((pt, i) => {
      const p3 = proyectar3D(pt.x, pt.y, 0);
      if (i === 0) ctx.moveTo(p3.x, p3.y);
      else ctx.lineTo(p3.x, p3.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
    ctx.fill();
    ctx.strokeStyle = "#6ee7b7";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  if (document.getElementById("chkCapaPvc")?.checked) {
    aristasPvc.forEach((arista) => {
      const p1 = proyectar3D(arista.origen.x, arista.origen.y, 0.15);
      const p2 = proyectar3D(arista.destino.x, arista.destino.y, 0.15);
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    });
  }

  if (document.getElementById("chkCapaMesh")?.checked) {
    aristasMesh.forEach((arista) => {
      const alt1 = arista.origen.tipo === "REPETIDOR" ? 2.4 : 1.4;
      const alt2 = arista.destino.tipo === "REPETIDOR" ? 2.4 : 1.4;
      const p1 = proyectar3D(arista.origen.x, arista.origen.y, alt1);
      const p2 = proyectar3D(arista.destino.x, arista.destino.y, alt2);
      const fueraRango = arista.distancia > alcanceMaxMesh;

      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = fueraRango ? "#f43f5e" : "#a7f3d0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    });
  }

  nodosPlano.forEach((nodo) => {
    const alturaM =
      nodo.tipo === "REPETIDOR" ? 2.4 : nodo.tipo === "NODO_ESP32" ? 1.4 : 0.6;
    const base = proyectar3D(nodo.x, nodo.y, 0);
    const cima = proyectar3D(nodo.x, nodo.y, alturaM);
    const estilo = ESTILOS_NODO[nodo.tipo] || ESTILOS_NODO.VALVULA;

    ctx.save();
    ctx.strokeStyle = "rgba(226, 232, 240, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(cima.x, cima.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cima.x, cima.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = estilo.color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = estilo.borde;
    ctx.stroke();

    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(estilo.icono, cima.x, cima.y + 1);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(nodo.etiqueta + " (3D)", cima.x, cima.y - 18);
    ctx.restore();
  });

  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.fillRect(W - 155, ALTO_REGLA_SUP + 10, 142, 24);
  ctx.strokeStyle = "#818cf8";
  ctx.lineWidth = 1;
  ctx.strokeRect(W - 155, ALTO_REGLA_SUP + 10, 142, 24);
  ctx.fillStyle = "#c7d2fe";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VISTA 3D — ASIR", W - 84, ALTO_REGLA_SUP + 22);
  ctx.restore();
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

  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, W, H);

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

  ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
  ctx.beginPath();
  ctx.moveTo(aPantallaX(0), ALTO_REGLA_SUP);
  ctx.lineTo(aPantallaX(0), H);
  ctx.moveTo(ANCHO_REGLA_IZQ, aPantallaY(0));
  ctx.lineTo(W, aPantallaY(0));
  ctx.stroke();

  if (modoVistaEnAsir === "3d") {
    dibujarVista3DEnAsir(
      ctx,
      W,
      H,
      pxPorMetro,
      aPantallaX,
      aPantallaY,
      alcanceMaxMesh,
    );
  } else {
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
  }

  if (parcelasDisponibles.length === 0 && nodosPlano.length === 0) {
    ctx.save();
    const centroAreaX = ANCHO_REGLA_IZQ + (W - ANCHO_REGLA_IZQ) / 2;
    const centroAreaY = ALTO_REGLA_SUP + (H - ALTO_REGLA_SUP) / 2;
    ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
    ctx.font = "600 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Lienzo vacío — Registra una parcela para diseñar tu red hidráulica y de sensores",
      centroAreaX,
      centroAreaY,
    );
    ctx.restore();
  }

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
