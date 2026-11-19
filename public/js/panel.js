const map = L.map("map").setView([-12.6581, -76.6321], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

let marcadoresMapa = {};
let listaParcelasGlobal = [];
let umbralActualParcela = 35;
let modoActualParcela = "AUTO";

const ctx = document.getElementById("chartTelemetria").getContext("2d");
const chartTelemetria = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Temp (°C)",
        data: [],
        borderColor: "#f59e0b",
        tension: 0.3,
      },
      {
        label: "Hum. Suelo (%)",
        data: [],
        borderColor: "#10b981",
        tension: 0.3,
      },
      {
        label: "Hum. Aire (%)",
        data: [],
        borderColor: "#06b6d4",
        tension: 0.3,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#cbd5e1" } } },
    scales: {
      x: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
    },
  },
});

function actualizarBotoneraModo(modo) {
  const bAuto = document.getElementById("btnModoAuto");
  const bOn = document.getElementById("btnModoOn");
  const bOff = document.getElementById("btnModoOff");

  [bAuto, bOn, bOff].forEach((btn) => {
    btn.className =
      "px-3 py-1.5 rounded-md font-semibold transition text-slate-400 hover:text-white";
  });

  if (modo === "MANUAL_ON") {
    bOn.className =
      "px-3 py-1.5 rounded-md font-semibold transition bg-emerald-600 text-white shadow";
  } else if (modo === "MANUAL_OFF") {
    bOff.className =
      "px-3 py-1.5 rounded-md font-semibold transition bg-rose-600 text-white shadow";
  } else {
    bAuto.className =
      "px-3 py-1.5 rounded-md font-semibold transition bg-sky-600 text-white shadow";
  }
}

function evaluarRiesgoClimatico(temp, humSuelo) {
  const banner = document.getElementById("bannerAlerta");
  const badge = document.getElementById("badgeEstado");
  const diag = document.getElementById("txtDiagnostico");

  if (modoActualParcela === "MANUAL_ON") {
    banner.className =
      "bg-slate-800 border-l-4 border-emerald-500 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg";
    badge.className =
      "bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded font-semibold";
    badge.innerText = "RIEGO FORZADO MANUAL";
    diag.innerText =
      "El riego se encuentra encendido manualmente por el operador.";
    return;
  }

  if (modoActualParcela === "MANUAL_OFF") {
    banner.className =
      "bg-slate-800 border-l-4 border-slate-500 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg";
    badge.className =
      "bg-slate-500/20 text-slate-400 text-xs px-2 py-0.5 rounded font-semibold";
    badge.innerText = "RIEGO BLOQUEADO MANUAL";
    diag.innerText =
      "El sistema automatizado está desactivado manualmente por el operador.";
    return;
  }

  if (temp <= 5) {
    banner.className =
      "bg-slate-800 border-l-4 border-blue-500 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg";
    badge.className =
      "bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-semibold";
    badge.innerText = "RIESGO DE HELADA / FRÍO EXTREMO";
    diag.innerText =
      "Temperatura críticamente baja. Peligro de congelamiento o estrés por frío en tejido vegetal.";
  } else if (humSuelo < umbralActualParcela) {
    banner.className =
      "bg-slate-800 border-l-4 border-red-500 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg";
    badge.className =
      "bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded font-semibold";
    badge.innerText = "ESTRÉS HÍDRICO CRÍTICO";
    diag.innerText = `Suelo seco por debajo del umbral de esta parcela (${umbralActualParcela}%). Se requiere activación de pulso de riego inmediato.`;
  } else if (temp > 32) {
    banner.className =
      "bg-slate-800 border-l-4 border-amber-500 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg";
    badge.className =
      "bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded font-semibold";
    badge.innerText = "OLA DE CALOR DETECTADA";
    diag.innerText =
      "Temperatura elevada. Monitoreando tasa de evapotranspiración acelerada.";
  } else {
    banner.className =
      "bg-slate-800 border-l-4 border-emerald-500 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg";
    badge.className =
      "bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded font-semibold";
    badge.innerText = "CONDICIÓN ÓPTIMA";
    diag.innerText =
      "Parámetros microclimáticos en rangos adecuados para el cultivo.";
  }
}

function actualizarUmbralUI(idParcela) {
  const panel = document.getElementById("panelUmbral");
  const input = document.getElementById("inputUmbral");

  if (idParcela === "todas") {
    panel.classList.add("opacity-50", "pointer-events-none");
    input.value = "";
    umbralActualParcela = 35;
    modoActualParcela = "AUTO";
    actualizarBotoneraModo("AUTO");
    return;
  }

  panel.classList.remove("opacity-50", "pointer-events-none");
  const pEncontrada = listaParcelasGlobal.find((p) => p.id == idParcela);
  if (pEncontrada) {
    if (
      pEncontrada.umbral_humedad !== undefined &&
      document.activeElement !== input
    ) {
      umbralActualParcela = parseFloat(pEncontrada.umbral_humedad);
      input.value = umbralActualParcela;
    }
    modoActualParcela = pEncontrada.modo_riego || "AUTO";
    actualizarBotoneraModo(modoActualParcela);
  }
}

async function cambiarModoRiego(nuevoModo) {
  const idSel = document.getElementById("selectParcela").value;
  if (idSel === "todas") {
    alert("Selecciona una parcela específica para cambiar el modo de riego.");
    return;
  }

  try {
    const res = await fetch(`/api/parcelas/${idSel}/modo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo: nuevoModo }),
    });

    if (res.ok) {
      modoActualParcela = nuevoModo;
      actualizarBotoneraModo(nuevoModo);
      await cargarListaParcelas();
      cargarTelemetria();
    }
  } catch (err) {
    console.error("Error al cambiar modo de riego:", err);
  }
}

async function guardarUmbralParcela() {
  const idSel = document.getElementById("selectParcela").value;
  const nuevoUmbral = parseFloat(document.getElementById("inputUmbral").value);

  if (idSel === "todas") {
    alert("Selecciona una parcela específica para modificar su umbral.");
    return;
  }

  if (isNaN(nuevoUmbral) || nuevoUmbral < 5 || nuevoUmbral > 90) {
    alert("Ingresa un porcentaje de humedad válido (entre 5% y 90%).");
    return;
  }

  try {
    const res = await fetch(`/api/parcelas/${idSel}/umbral`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ umbral: nuevoUmbral }),
    });

    if (res.ok) {
      alert(
        `✅ Umbral para la Parcela #${idSel} actualizado a ${nuevoUmbral}%`,
      );
      umbralActualParcela = nuevoUmbral;
      await cargarListaParcelas();
      cargarTelemetria();
    }
  } catch (err) {
    console.error("Error al guardar umbral:", err);
  }
}

async function cargarListaParcelas() {
  try {
    const res = await fetch(`/api/parcelas?id_usuario=${usuarioSesion.id}`);
    listaParcelasGlobal = await res.json();

    const vEmpty = document.getElementById("vistaEmptyState");
    const vDash = document.getElementById("contenedorDashboard");

    if (!listaParcelasGlobal || listaParcelasGlobal.length === 0) {
      vEmpty.classList.remove("hidden");
      vDash.classList.add("hidden");
      return;
    } else {
      vEmpty.classList.add("hidden");
      vDash.classList.remove("hidden");
    }

    const select = document.getElementById("selectParcela");
    const valPrevio = select.value;
    select.innerHTML = '<option value="todas">🌐 Todas las Parcelas</option>';

    listaParcelasGlobal.forEach((p) => {
      select.innerHTML += `<option value="${p.id}">📍 Parcela ${p.id}: ${p.parcela || p.nombre || "Sector"}</option>`;

      const latVal = parseFloat(p.latitud) || -12.6581;
      const lngVal = parseFloat(p.longitud) || -76.6321;

      if (!marcadoresMapa[p.id]) {
        marcadoresMapa[p.id] = L.marker([latVal, lngVal])
          .addTo(map)
          .bindPopup(
            `<b>${p.parcela || p.nombre || "Parcela " + p.id}</b><br>Cultivo: ${p.cultivo || "General"}`,
          );
      }
    });

    if (valPrevio) select.value = valPrevio;
  } catch (e) {
    console.error("Error al obtener lista de parcelas:", e);
  }
}

let ultimaParcelaTelemetria = null;

function obtenerOCrearSelectorNodo() {
  let selectNodo = document.getElementById("selectNodo");
  if (!selectNodo) {
    const selectParcela = document.getElementById("selectParcela");
    if (!selectParcela || !selectParcela.parentNode) return null;

    selectNodo = document.createElement("select");
    selectNodo.id = "selectNodo";
    selectNodo.className = selectParcela.className;
    selectNodo.title = "Filtrar telemetría por nodo/sensor";
    selectNodo.innerHTML = '<option value="todos">📡 Todos los nodos</option>';
    selectParcela.parentNode.insertBefore(
      selectNodo,
      selectParcela.nextSibling,
    );
  }

  if (!selectNodo.dataset.listenerListo) {
    selectNodo.addEventListener("change", () => cargarTelemetria());
    selectNodo.dataset.listenerListo = "1";
  }
  return selectNodo;
}

async function actualizarOpcionesNodos(selectNodo, idParcela, datosTelemetria) {
  if (!selectNodo) return "todos";

  // Si el usuario cambió de parcela, volver a la vista general de nodos
  if (ultimaParcelaTelemetria !== idParcela) {
    selectNodo.value = "todos";
    ultimaParcelaTelemetria = idParcela;
  }

  const seleccionPrevia = selectNodo.value || "todos";
  const macsSet = new Set();

  // 1. Nodos registrados en la topología real de la parcela (Página Principal + Web IO)
  if (idParcela && idParcela !== "todas") {
    try {
      const resTopo = await fetch(`/api/parcelas/${idParcela}/topologia`);
      if (resTopo.ok) {
        const topo = await resTopo.json();
        if (Array.isArray(topo.nodos)) {
          topo.nodos.forEach((n) => {
            if (n.id && n.tipo !== "GATEWAY_POZO") macsSet.add(String(n.id));
          });
        }
      }
    } catch (e) {
      // Si falla topología, continúa con los nodos presentes en telemetría
    }
  }

  // 2. Nodos presentes en el historial reciente de telemetría
  if (Array.isArray(datosTelemetria)) {
    datosTelemetria.forEach((d) => {
      if (d.codigo_mac) macsSet.add(String(d.codigo_mac));
    });
  }

  const listaMacs = Array.from(macsSet);
  selectNodo.innerHTML = '<option value="todos">📡 Todos los nodos</option>';
  listaMacs.forEach((mac) => {
    const opt = document.createElement("option");
    opt.value = mac;
    opt.textContent = `Sensor: ${mac}`;
    selectNodo.appendChild(opt);
  });

  if (seleccionPrevia !== "todos" && listaMacs.includes(seleccionPrevia)) {
    selectNodo.value = seleccionPrevia;
  } else {
    selectNodo.value = "todos";
  }

  return selectNodo.value;
}

function agruparSeriePorVentana(registros, ventanaMs = 5000) {
  const buckets = new Map();

  registros.forEach((d) => {
    const ts = new Date(d.fecha_registro).getTime();
    const clave = Math.floor(ts / ventanaMs) * ventanaMs;

    if (!buckets.has(clave)) {
      buckets.set(clave, {
        ts: clave,
        sumTemp: 0,
        sumHumSuelo: 0,
        sumHumAire: 0,
        countTemp: 0,
        countHumSuelo: 0,
        countHumAire: 0,
      });
    }

    const b = buckets.get(clave);
    const t = parseFloat(d.temperatura);
    const hs = parseFloat(d.humedad_suelo);
    const ha =
      d.humedad_aire !== null && d.humedad_aire !== undefined
        ? parseFloat(d.humedad_aire)
        : NaN;

    if (!isNaN(t)) {
      b.sumTemp += t;
      b.countTemp++;
    }
    if (!isNaN(hs)) {
      b.sumHumSuelo += hs;
      b.countHumSuelo++;
    }
    if (!isNaN(ha)) {
      b.sumHumAire += ha;
      b.countHumAire++;
    }
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.ts - b.ts)
    .map((b) => ({
      fecha_registro: new Date(b.ts).toISOString(),
      temperatura:
        b.countTemp > 0 ? Number((b.sumTemp / b.countTemp).toFixed(1)) : null,
      humedad_suelo:
        b.countHumSuelo > 0
          ? Number((b.sumHumSuelo / b.countHumSuelo).toFixed(1))
          : null,
      humedad_aire:
        b.countHumAire > 0
          ? Number((b.sumHumAire / b.countHumAire).toFixed(1))
          : null,
    }));
}

async function cargarTelemetria() {
  try {
    const idSel = document.getElementById("selectParcela").value;
    const selectNodo = obtenerOCrearSelectorNodo();
    actualizarUmbralUI(idSel);

    if (idSel !== "todas") {
      const pSel = listaParcelasGlobal.find((p) => p.id == idSel);
      if (pSel && pSel.latitud && pSel.longitud) {
        map.setView([parseFloat(pSel.latitud), parseFloat(pSel.longitud)], 14);
        if (marcadoresMapa[idSel]) marcadoresMapa[idSel].openPopup();
      }
    } else {
      map.setView([-12.6581, -76.6321], 12);
    }

    const res = await fetch(`/api/telemetria?parcela_id=${idSel}`);
    const datosCrudos = await res.json();

    const nodoSel = await actualizarOpcionesNodos(
      selectNodo,
      idSel,
      datosCrudos,
    );
    const datos =
      nodoSel !== "todos"
        ? (datosCrudos || []).filter((d) => String(d.codigo_mac) === nodoSel)
        : datosCrudos || [];

    if (!datos || datos.length === 0) {
      document.getElementById("valTemp").innerText = "-- °C";
      document.getElementById("valHumSuelo").innerText = "-- %";
      document.getElementById("valHumAire").innerText = "-- %";
      document.getElementById("lblParcela").innerText = "Parcela: Sin datos";
      document.getElementById("lblCultivo").innerText = "Cultivo: --";
      document.getElementById("lblMac").innerText =
        nodoSel !== "todos" ? `Nodo: ${nodoSel} (sin lecturas)` : "Nodo: --";
      document.getElementById("tablaCuerpo").innerHTML =
        '<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay registros de telemetría para la selección actual</td></tr>';
      chartTelemetria.data.labels = [];
      chartTelemetria.data.datasets.forEach((ds) => (ds.data = []));
      chartTelemetria.update();
      return;
    }

    const u = datos[0];
    const nodosUnicosEnDatos = new Set(datos.map((d) => d.codigo_mac)).size;

    document.getElementById("valTemp").innerText = `${u.temperatura} °C`;
    document.getElementById("valHumSuelo").innerText = `${u.humedad_suelo} %`;
    document.getElementById("valHumAire").innerText =
      `${u.humedad_aire ?? "--"} %`;
    document.getElementById("lblParcela").innerText =
      `Parcela: ${u.parcela || "N/A"}`;
    document.getElementById("lblCultivo").innerText =
      `Cultivo: ${u.cultivo || "N/A"}`;
    document.getElementById("lblMac").innerText =
      nodoSel !== "todos"
        ? `Nodo: ${nodoSel}`
        : nodosUnicosEnDatos > 1
          ? `Nodos activos: ${nodosUnicosEnDatos} (último: ${u.codigo_mac})`
          : `Nodo: ${u.codigo_mac}`;

    evaluarRiesgoClimatico(u.temperatura, u.humedad_suelo);

    const badgeRiego = document.getElementById("badgeRiego");
    if (badgeRiego) {
      let activo = false;
      if (modoActualParcela === "MANUAL_ON") activo = true;
      else if (modoActualParcela === "MANUAL_OFF") activo = false;
      else activo = parseFloat(u.humedad_suelo) < umbralActualParcela;

      if (activo) {
        badgeRiego.className =
          "inline-flex items-center gap-1.5 bg-cyan-500/20 text-cyan-400 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-cyan-500/30 animate-pulse";
        badgeRiego.innerHTML = "💧 Riego Activo";
      } else {
        badgeRiego.className =
          "inline-flex items-center gap-1.5 bg-slate-700 text-slate-400 text-xs px-2.5 py-0.5 rounded-full font-semibold";
        badgeRiego.innerHTML = "🛑 Riego Inactivo";
      }
    }

    const tabla = document.getElementById("tablaCuerpo");
    tabla.innerHTML = "";
    datos.slice(0, 10).forEach((row) => {
      tabla.innerHTML += `
        <tr class="hover:bg-slate-750 transition">
          <td class="p-3 font-mono text-sky-400">#${row.id}</td>
          <td class="p-3 font-semibold">${row.codigo_mac}</td>
          <td class="p-3 text-slate-400">${row.parcela} (${row.cultivo})</td>
          <td class="p-3 font-bold text-amber-400">${row.temperatura} °C</td>
          <td class="p-3 font-bold text-emerald-400">${row.humedad_suelo} %</td>
          <td class="p-3 font-bold text-cyan-400">${row.humedad_aire ?? "--"} %</td>
          <td class="p-3 text-xs text-slate-400">${new Date(row.fecha_registro).toLocaleString()}</td>
        </tr>
      `;
    });

    // Si está en vista general con varios nodos, agrupa por ventana de 5s para evitar zig-zag en la gráfica
    const serieHistoria =
      nodoSel === "todos" && nodosUnicosEnDatos > 1
        ? agruparSeriePorVentana(datos, 5000).slice(-12)
        : datos.slice(0, 12).reverse();

    chartTelemetria.data.labels = serieHistoria.map((d) =>
      new Date(d.fecha_registro).toLocaleTimeString(),
    );
    chartTelemetria.data.datasets[0].data = serieHistoria.map(
      (d) => d.temperatura,
    );
    chartTelemetria.data.datasets[1].data = serieHistoria.map(
      (d) => d.humedad_suelo,
    );
    chartTelemetria.data.datasets[2].data = serieHistoria.map(
      (d) => d.humedad_aire,
    );
    chartTelemetria.update();
  } catch (err) {
    console.error("Error al obtener telemetría:", err);
  }
}

cargarListaParcelas().then(() => cargarTelemetria());
setInterval(cargarTelemetria, 5000);
