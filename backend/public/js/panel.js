let parcelasNodos = [];
let lecturasPorParcela = {};
let parcelaSeleccionadaId = null;
let mapaPanel = null;
let capaMarcadoresNodos = null;
let capaPoligonoPanel = null;
let chartHumedad = null;
let chartTemperatura = null;
let intervaloLive = null;
let actualizandoAhora = false;

document.addEventListener("DOMContentLoaded", () => {
  inicializarSensoresVivo();
});

window.addEventListener("beforeunload", () => {
  if (intervaloLive) clearInterval(intervaloLive);
});

// =========================================================================
// 1. INICIALIZACIÓN Y SINCRONIZACIÓN EN VIVO (CADA 5 SEGUNDOS)
// =========================================================================

async function inicializarSensoresVivo() {
  if (typeof usuarioSesion === "undefined" || !usuarioSesion) return;

  await actualizarTelemetriaVivo();

  if (intervaloLive) clearInterval(intervaloLive);
  intervaloLive = setInterval(() => {
    actualizarTelemetriaVivo(true);
  }, 5000);
}

async function actualizarTelemetriaVivo(silencioso = false) {
  if (
    actualizandoAhora ||
    typeof usuarioSesion === "undefined" ||
    !usuarioSesion
  ) {
    return;
  }

  actualizandoAhora = true;
  const badgeLive = document.getElementById("badgeEstadoLive");
  if (badgeLive && !silencioso) {
    badgeLive.innerText = "🔄 Sincronizando...";
  }

  try {
    const resParcelas = await fetch(
      "/api/parcelas?id_usuario=" + usuarioSesion.id,
    );
    const lista = await resParcelas.json();
    parcelasNodos = Array.isArray(lista) ? lista : [];

    if (parcelasNodos.length === 0) {
      mostrarEstadoSinNodos();
      if (badgeLive) badgeLive.innerText = "⚪ Sin nodos";
      actualizandoAhora = false;
      return;
    }

    // Consultar la telemetría de cada parcela de manera independiente en paralelo
    const promesasTelemetria = parcelasNodos.map(async (p) => {
      try {
        const resTel = await fetch(`/api/telemetria?parcela_id=${p.id}`);
        if (!resTel.ok) return { id: p.id, lecturas: [] };
        const datos = await resTel.json();
        return { id: p.id, lecturas: Array.isArray(datos) ? datos : [] };
      } catch (e) {
        return { id: p.id, lecturas: [] };
      }
    });

    const resultados = await Promise.all(promesasTelemetria);
    resultados.forEach((item) => {
      lecturasPorParcela[item.id] = item.lecturas;
    });

    // Mantener selección actual o elegir la primera parcela por defecto
    if (
      !parcelaSeleccionadaId ||
      !parcelasNodos.some((p) => String(p.id) === String(parcelaSeleccionadaId))
    ) {
      parcelaSeleccionadaId = parcelasNodos[0].id;
    }

    actualizarSelectorParcelasPanel();
    renderizarTarjetasNodosEsp32();
    renderizarDetalleNodoSeleccionado();

    if (badgeLive) {
      badgeLive.className =
        "text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl";
      badgeLive.innerText = "🟢 En vivo (5s)";
    }
  } catch (err) {
    console.error("Error sincronizando sensores en vivo:", err);
    if (badgeLive) {
      badgeLive.className =
        "text-[11px] font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30 px-3 py-1.5 rounded-xl";
      badgeLive.innerText = "⚠️ Sin conexión";
    }
  } finally {
    actualizandoAhora = false;
  }
}

function mostrarEstadoSinNodos() {
  const select = document.getElementById("selFiltroParcelaPanel");
  const grid = document.getElementById("gridNodosEsp32");
  const conteo = document.getElementById("lblConteoNodos");
  const tabla = document.getElementById("tablaTelemetriaVivo");

  if (select) {
    select.innerHTML = '<option value="">Sin parcelas registradas</option>';
  }
  if (conteo) {
    conteo.innerText = "0 nodos registrados";
  }
  if (grid) {
    grid.innerHTML = `
      <div class="col-span-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center space-y-3">
        <span class="text-4xl block">📡</span>
        <h4 class="text-base font-bold text-slate-200">No hay placas ESP32 vinculadas aún</h4>
        <p class="text-xs text-slate-400 max-w-md mx-auto">
          Registra una parcela y asígnale su código MAC (ej. ESP32-001) en Vista de Campo para recibir sus lecturas aquí.
        </p>
        <div class="pt-1">
          <a href="/parcelas.html" class="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition">
            <span>🗺️ Ir a Vista de Campo</span>
          </a>
        </div>
      </div>
    `;
  }
  if (tabla) {
    tabla.innerHTML = `
      <tr>
        <td colspan="6" class="p-6 text-center text-slate-500">
          Sin paquetes telemétricos registrados.
        </td>
      </tr>
    `;
  }
}

// =========================================================================
// 2. SELECTOR Y TARJETAS INDIVIDUALES POR NODO ESP32
// =========================================================================

function actualizarSelectorParcelasPanel() {
  const select = document.getElementById("selFiltroParcelaPanel");
  if (!select) return;

  select.innerHTML = parcelasNodos
    .map((p) => {
      const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
      const mac = p.codigo_mac ? ` [${p.codigo_mac}]` : " [Sin MAC]";
      return `<option value="${p.id}">📡 ${nombre}${mac}</option>`;
    })
    .join("");

  select.value = String(parcelaSeleccionadaId);
}

function seleccionarParcelaPanel() {
  const select = document.getElementById("selFiltroParcelaPanel");
  if (!select || !select.value) return;
  parcelaSeleccionadaId = select.value;
  renderizarTarjetasNodosEsp32();
  renderizarDetalleNodoSeleccionado();
}

function seleccionarNodoDesdeTarjeta(id) {
  parcelaSeleccionadaId = id;
  const select = document.getElementById("selFiltroParcelaPanel");
  if (select) select.value = String(id);
  renderizarTarjetasNodosEsp32();
  renderizarDetalleNodoSeleccionado();
}

function evaluarEstadoConexionNodo(ultimaLectura) {
  if (!ultimaLectura || !ultimaLectura.fecha_registro) {
    return {
      enLinea: false,
      etiqueta: "⚪ Sin transmisiones",
      claseBadge: "bg-slate-700/70 text-slate-300 border-slate-600",
      haceTexto: "Nunca",
    };
  }

  const diffMs = Math.max(
    0,
    Date.now() - new Date(ultimaLectura.fecha_registro).getTime(),
  );
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 5) {
    return {
      enLinea: true,
      etiqueta: "🟢 En línea",
      claseBadge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      haceTexto: diffMin === 0 ? "Hace unos segundos" : `Hace ${diffMin} min`,
    };
  }

  if (diffMin < 60) {
    return {
      enLinea: false,
      etiqueta: "🟡 En espera",
      claseBadge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      haceTexto: `Hace ${diffMin} min`,
    };
  }

  const diffHoras = Math.floor(diffMin / 60);
  return {
    enLinea: false,
    etiqueta: "🔴 Sin señal",
    claseBadge: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    haceTexto:
      diffHoras < 24
        ? `Hace ${diffHoras} h`
        : `Hace ${Math.floor(diffHoras / 24)} d`,
  };
}

function renderizarTarjetasNodosEsp32() {
  const grid = document.getElementById("gridNodosEsp32");
  const conteo = document.getElementById("lblConteoNodos");
  if (!grid) return;

  let nodosEnLinea = 0;

  grid.innerHTML = parcelasNodos
    .map((p) => {
      const lecturas = lecturasPorParcela[p.id] || [];
      const ultima = lecturas[0] || null;
      const estado = evaluarEstadoConexionNodo(ultima);
      if (estado.enLinea) nodosEnLinea++;

      const esSeleccionada = String(p.id) === String(parcelaSeleccionadaId);
      const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
      const cultivo = p.cultivo || "General";
      const mac = p.codigo_mac || "MAC NO ASIGNADA";
      const umbral = Number(p.umbral_humedad ?? 35);

      const humSuelo =
        ultima && ultima.humedad_suelo !== undefined
          ? Number(ultima.humedad_suelo).toFixed(1) + "%"
          : "--";
      const temp =
        ultima && ultima.temperatura !== undefined
          ? Number(ultima.temperatura).toFixed(1) + "°C"
          : "--";
      const humAire =
        ultima &&
        ultima.humedad_aire !== null &&
        ultima.humedad_aire !== undefined
          ? Number(ultima.humedad_aire).toFixed(0) + "%"
          : "--";

      const alertaSueloSeco = ultima && Number(ultima.humedad_suelo) < umbral;

      const bordeTarjeta = esSeleccionada
        ? "border-sky-500 ring-2 ring-sky-500/25 bg-slate-800"
        : "border-slate-700/90 bg-slate-800/80 hover:border-slate-600";

      return `
        <div
          onclick="seleccionarNodoDesdeTarjeta(${p.id})"
          class="cursor-pointer rounded-2xl border ${bordeTarjeta} p-4 space-y-3.5 shadow-lg transition"
        >
          <!-- Cabecera Hardware -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs font-extrabold text-amber-400 bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-700">
                  🔌 ${mac}
                </span>
                ${
                  esSeleccionada
                    ? '<span class="text-[10px] font-bold text-sky-400 uppercase">● Inspeccionando</span>'
                    : ""
                }
              </div>
              <h4 class="text-sm font-bold text-slate-100 mt-1.5">
                #${p.id} ${nombre}
              </h4>
              <p class="text-[11px] text-slate-400">🌱 ${cultivo}</p>
            </div>

            <span class="border text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${estado.claseBadge}">
              ${estado.etiqueta}
            </span>
          </div>

          <!-- Lecturas Instantáneas del Nodo -->
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-slate-900/90 p-2.5 rounded-xl border ${alertaSueloSeco ? "border-rose-500/40" : "border-slate-700/70"}">
              <span class="block text-[10px] text-slate-500 uppercase">Suelo</span>
              <span class="text-sm font-black ${alertaSueloSeco ? "text-rose-400" : "text-emerald-400"}">
                ${humSuelo}
              </span>
            </div>
            <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-700/70">
              <span class="block text-[10px] text-slate-500 uppercase">Temp.</span>
              <span class="text-sm font-black text-amber-400">${temp}</span>
            </div>
            <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-700/70">
              <span class="block text-[10px] text-slate-500 uppercase">Aire</span>
              <span class="text-sm font-black text-cyan-400">${humAire}</span>
            </div>
          </div>

          <!-- Pie Técnico -->
          <div class="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Último paquete: <strong class="text-slate-300">${estado.haceTexto}</strong></span>
            <span>${lecturas.length} reg.</span>
          </div>
        </div>
      `;
    })
    .join("");

  if (conteo) {
    conteo.innerText = `${nodosEnLinea} de ${parcelasNodos.length} nodos en línea`;
  }
}

// =========================================================================
// 3. GRÁFICAS SEPARADAS Y TABLA DEL NODO SELECCIONADO
// =========================================================================


function inicializarMapaPanel() {
  const cont = document.getElementById("mapaPanelSensores");
  if (!cont || mapaPanel) return;

  mapaPanel = L.map("mapaPanelSensores", {
    zoomControl: true,
    attributionControl: false
  }).setView([-12.046374, -77.042793], 15);

  L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
    maxZoom: 21,
    subdomains: ["mt0", "mt1", "mt2", "mt3"]
  }).addTo(mapaPanel);

  capaPoligonoPanel = L.layerGroup().addTo(mapaPanel);
  capaMarcadoresNodos = L.layerGroup().addTo(mapaPanel);
}

function actualizarMapaParcelaYNodos(parcela, lecturas) {
  if (!mapaPanel) {
    inicializarMapaPanel();
  }
  if (!mapaPanel) return;

  capaPoligonoPanel.clearLayers();
  capaMarcadoresNodos.clearLayers();

  let bounds = null;

  // 1. Dibujar polígono de la parcela si existe
  if (parcela && parcela.poligono_json) {
    try {
      const geo = typeof parcela.poligono_json === "string" ? JSON.parse(parcela.poligono_json) : parcela.poligono_json;
      if (Array.isArray(geo) && geo.length >= 3) {
        const poly = L.polygon(geo, {
          color: "#2CC56A",
          weight: 2.5,
          fillColor: "#2CC56A",
          fillOpacity: 0.18
        }).addTo(capaPoligonoPanel);

        bounds = poly.getBounds();
        mapaPanel.fitBounds(bounds, { padding: [25, 25], maxZoom: 18 });
      }
    } catch(e) {}
  }

  // 2. Si tiene coordenadas centrales o de lat/lng
  if (!bounds && parcela && parcela.latitud && parcela.longitud) {
    const lat = parseFloat(parcela.latitud);
    const lng = parseFloat(parcela.longitud);
    if (!isNaN(lat) && !isNaN(lng)) {
      mapaPanel.setView([lat, lng], 17);
    }
  }

  // 3. Crear marcador del nodo/ESP32
  let posMarker = null;
  if (bounds) {
    posMarker = bounds.getCenter();
  } else if (parcela && parcela.latitud && parcela.longitud) {
    posMarker = [parseFloat(parcela.latitud), parseFloat(parcela.longitud)];
  } else {
    posMarker = [-12.046374, -77.042793];
  }

  const ultima = lecturas && lecturas.length > 0 ? lecturas[0] : null;
  const hum = ultima && ultima.humedad_suelo !== undefined ? Number(ultima.humedad_suelo).toFixed(1) + "%" : "--";
  const temp = ultima && ultima.temperatura !== undefined ? Number(ultima.temperatura).toFixed(1) + "°C" : "--";
  const mac = parcela.codigo_mac || "ESP32";

  const customIcon = L.divIcon({
    className: "custom-esp32-pin",
    html: `<div style="background:#0a110d;border:2px solid #2CC56A;border-radius:12px;padding:3px 7px;box-shadow:0 2px 10px rgba(0,0,0,0.6);font-size:10px;font-weight:800;color:#2CC56A;display:flex;align-items:center;gap:4px;white-space:nowrap;cursor:pointer;">
      <span style="font-size:12px;">📡</span>
      <span>${mac}: ${hum}</span>
    </div>`,
    iconSize: [90, 26],
    iconAnchor: [45, 13]
  });

  const marker = L.marker(posMarker, { icon: customIcon }).addTo(capaMarcadoresNodos);
  marker.bindPopup(`<b>${parcela.parcela || parcela.nombre}</b><br>Nodo: ${mac}<br>Humedad Suelo: ${hum}<br>Temperatura: ${temp}`);

  setTimeout(() => {
    if (mapaPanel) mapaPanel.invalidateSize();
  }, 200);
}
function renderizarDetalleNodoSeleccionado() {
  const parcela =
    parcelasNodos.find((p) => String(p.id) === String(parcelaSeleccionadaId)) ||
    parcelasNodos[0];

  if (!parcela) return;

  const nombre = parcela.parcela || parcela.nombre || "Parcela #" + parcela.id;
  const mac = parcela.codigo_mac || "Sin MAC";
  const lecturas = lecturasPorParcela[parcela.id] || [];

  const titulo = document.getElementById("lblNodoSeleccionadoTitulo");
  if (titulo) {
    titulo.innerHTML = `<span>📈</span> Curvas en Tiempo Real — ${nombre} <span class="font-mono text-xs text-amber-400">(${mac})</span>`;
  }

    const lblCampoGen = document.getElementById("lblCampoGeneralPanel");
  const lblTitParc = document.getElementById("lblTituloParcelaPanel");
  if (lblCampoGen) lblCampoGen.innerText = parcela.campo_general ? `🏡 ${parcela.campo_general}` : "🏡 Parcela";
  if (lblTitParc) lblTitParc.innerText = `#${parcela.id} - ${nombre}`;

  const ultima = lecturas[0] || null;
  const estado = evaluarEstadoConexionNodo(ultima);
  const lblMacDetalle = document.getElementById("lblDetalleNodoMac");
  const lblEstadoDetalle = document.getElementById("lblDetalleNodoEstado");
  const valSuelo = document.getElementById("valDetalleSuelo");
  const valTemp = document.getElementById("valDetalleTemp");
  const valAire = document.getElementById("valDetalleAire");

  if (lblMacDetalle) lblMacDetalle.innerText = `🔌 ${mac} (${parcela.cultivo || "Cultivo"})`;
  if (lblEstadoDetalle) {
    lblEstadoDetalle.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${estado.claseBadge}`;
    lblEstadoDetalle.innerText = estado.etiqueta;
  }
  if (valSuelo) valSuelo.innerText = ultima && ultima.humedad_suelo !== undefined ? Number(ultima.humedad_suelo).toFixed(1) + "%" : "--";
  if (valTemp) valTemp.innerText = ultima && ultima.temperatura !== undefined ? Number(ultima.temperatura).toFixed(1) + "°C" : "--";
  if (valAire) valAire.innerText = ultima && ultima.humedad_aire ? Number(ultima.humedad_aire).toFixed(0) + "%" : "--";

  actualizarMapaParcelaYNodos(parcela, lecturas);
  renderizarGraficasNodo(lecturas);
  renderizarTablaPaquetesNodo(parcela, lecturas);
}

function renderizarGraficasNodo(lecturas) {
  const serie = lecturas.slice(0, 20).reverse();
  const labels = serie.map((d) =>
    new Date(d.fecha_registro).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  );

  const datosSuelo = serie.map((d) => Number(d.humedad_suelo));
  const datosAire = serie.map((d) =>
    d.humedad_aire !== null && d.humedad_aire !== undefined
      ? Number(d.humedad_aire)
      : null,
  );
  const datosTemp = serie.map((d) => Number(d.temperatura));

  const canvasHum = document.getElementById("chartSensorHumedad");
  const canvasTemp = document.getElementById("chartSensorTemperatura");

  if (canvasHum) {
    if (chartHumedad) chartHumedad.destroy();
    const ctxH = canvasHum.getContext("2d");
    const gradSuelo = ctxH.createLinearGradient(0, 0, 0, 220);
    gradSuelo.addColorStop(0, "rgba(0, 229, 255, 0.18)");
    gradSuelo.addColorStop(1, "rgba(0, 229, 255, 0.0)");

    chartHumedad = new Chart(ctxH, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Hum. Suelo (%)",
            data: datosSuelo,
            borderColor: "#00E5FF",
            backgroundColor: gradSuelo,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: "Hum. Aire (%)",
            data: datosAire,
            borderColor: "#00b4cc",
            borderDash: [5, 4],
            tension: 0.3,
            pointRadius: 2.5,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { labels: { color: "#8fa8b8", font: { size: 11 } } },
        },
        scales: {
          x: {
            ticks: { color: "#4a6878", maxRotation: 0, maxTicksLimit: 6 },
            grid: { color: "rgba(26, 45, 58, 0.7)" },
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: "#00E5FF", callback: (v) => v + "%" },
            grid: { color: "rgba(26, 45, 58, 0.7)" },
          },
        },
      },
    });
  }

  if (canvasTemp) {
    if (chartTemperatura) chartTemperatura.destroy();
    const ctxT = canvasTemp.getContext("2d");
    const gradTemp = ctxT.createLinearGradient(0, 0, 0, 220);
    gradTemp.addColorStop(0, "rgba(245, 158, 11, 0.32)");
    gradTemp.addColorStop(1, "rgba(245, 158, 11, 0.0)");

    chartTemperatura = new Chart(ctxT, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Temperatura (°C)",
            data: datosTemp,
            borderColor: "#f59e0b",
            backgroundColor: gradTemp,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: "#fbbf24",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { labels: { color: "#8fa8b8", font: { size: 11 } } },
        },
        scales: {
          x: {
            ticks: { color: "#4a6878", maxRotation: 0, maxTicksLimit: 6 },
            grid: { color: "rgba(26, 45, 58, 0.7)" },
          },
          y: {
            suggestedMin: 10,
            suggestedMax: 38,
            ticks: { color: "#fbbf24", callback: (v) => v + "°C" },
            grid: { color: "rgba(26, 45, 58, 0.7)" },
          },
        },
      },
    });
  }
}

function renderizarTablaPaquetesNodo(parcela, lecturas) {
  const tbody = document.getElementById("tablaTelemetriaVivo");
  const lblTotal = document.getElementById("lblTotalPaquetes");
  if (!tbody) return;

  const recientes = lecturas.slice(0, 15);
  if (lblTotal) {
    lblTotal.innerText = `${recientes.length} paquetes recientes`;
  }

  if (recientes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-6 text-center text-slate-500">
          El nodo ${parcela.codigo_mac || "de esta parcela"} aún no ha enviado paquetes telemétricos.
        </td>
      </tr>
    `;
    return;
  }

  const nombre = parcela.parcela || parcela.nombre || "Parcela #" + parcela.id;
  const mac = parcela.codigo_mac || "Sin MAC";
  const umbral = Number(parcela.umbral_humedad ?? 35);

  tbody.innerHTML = recientes
    .map((reg) => {
      const fechaStr = new Date(reg.fecha_registro).toLocaleString([], {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const humSuelo = Number(reg.humedad_suelo);
      const bajoUmbral = humSuelo < umbral;

      return `
        <tr class="hover:bg-slate-700/40 transition">
          <td class="p-3 font-mono text-slate-400">${fechaStr}</td>
          <td class="p-3 font-semibold text-slate-200">
            ${nombre} <span class="font-mono text-[11px] text-amber-400">(${mac})</span>
          </td>
          <td class="p-3 font-mono font-bold ${bajoUmbral ? "text-rose-400" : "text-emerald-400"}">
            ${humSuelo.toFixed(1)} %
          </td>
          <td class="p-3 font-mono text-amber-300">
            ${Number(reg.temperatura).toFixed(1)} °C
          </td>
          <td class="p-3 font-mono text-cyan-300">
            ${reg.humedad_aire !== null && reg.humedad_aire !== undefined ? Number(reg.humedad_aire).toFixed(0) + " %" : "--"}
          </td>
          <td class="p-3 text-right">
            ${
              bajoUmbral
                ? `<span class="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">⚠️ Suelo Seco (<${umbral}%)</span>`
                : `<span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">✅ Óptimo</span>`
            }
          </td>
        </tr>
      `;
    })
    .join("");
}
