let parcelasClima = [];
let chartTemp = null;
let chartLluvia = null;

document.addEventListener("DOMContentLoaded", () => {
  cargarDatosClima();
});

function iconoHorarioClima(horaStr, probLluvia, lluviaMm, temp) {
  const horaNum = parseInt((horaStr || "12:00").split(":")[0], 10);
  const esNoche = horaNum < 6 || horaNum >= 19;

  if (probLluvia >= 70 || lluviaMm >= 1.5) return "⛈️";
  if (probLluvia >= 40 || lluviaMm >= 0.3) return "🌧️";
  if (probLluvia >= 20) return esNoche ? "☁️" : "⛅";
  if (esNoche) return "🌙";
  if (temp >= 29) return "☀️";
  return "🌤️";
}

async function cargarDatosClima() {
  if (typeof usuarioSesion === "undefined" || !usuarioSesion) return;

  const select = document.getElementById("selParcelaClima");
  try {
    const res = await fetch("/api/alertas-agro/" + usuarioSesion.id);
    const data = await res.json();
    parcelasClima = Array.isArray(data) ? data : [];

    if (!select) return;

    if (parcelasClima.length === 0) {
      select.innerHTML = '<option value="">Sin campos registrados</option>';
      mostrarEstadoSinCamposClima();
      return;
    }

    const paramsUrl = new URLSearchParams(window.location.search);
    const parcelaUrl = paramsUrl.get("parcela");
    const valorPrevio = select.value || parcelaUrl;

    select.innerHTML = parcelasClima
      .map(
        (p) =>
          `<option value="${p.id}">📍 ${p.parcela} (${p.cultivo || "General"})</option>`,
      )
      .join("");

    if (
      valorPrevio &&
      parcelasClima.some((p) => String(p.id) === String(valorPrevio))
    ) {
      select.value = valorPrevio;
    }

    cambiarParcelaClima();
  } catch (err) {
    console.error("Error cargando pronóstico climático:", err);
  }
}

function mostrarEstadoSinCamposClima() {
  const consejo = document.getElementById("txtConsejoRiegoClima");
  const grid = document.getElementById("gridTarjetasHorarias");
  if (consejo) {
    consejo.innerText =
      "Registra una parcela con ubicación satelital en Vista de Campo para activar su pronóstico horario.";
  }
  if (grid) {
    grid.innerHTML = `
      <div class="col-span-full bg-slate-800 border border-slate-700 rounded-xl p-5 flex items-center justify-between text-xs text-slate-400">
        <span>Aún no tienes campos con coordenadas registradas.</span>
        <a href="/parcelas.html" class="bg-sky-600 hover:bg-sky-500 text-white font-bold px-3.5 py-2 rounded-lg transition">+ Ir a Vista de Campo</a>
      </div>
    `;
  }
}

function cambiarParcelaClima() {
  const select = document.getElementById("selParcelaClima");
  if (!select || parcelasClima.length === 0) return;

  const parcela =
    parcelasClima.find((p) => String(p.id) === String(select.value)) ||
    parcelasClima[0];

  if (!parcela) return;

  actualizarKpisYConsejo(parcela);
  actualizarVigilanciaInstitucional(parcela);
  renderizarTarjetasHorarias(parcela);
  renderizarGraficasSeparadas(parcela);
}

function actualizarVigilanciaInstitucional(parcela) {
  const badgeSenamhi = document.getElementById("badgeEstadoSenamhi");
  const txtSenamhi = document.getElementById("txtResumenSenamhi");
  const p6 = parcela.pronostico_6h || {};
  const daily = parcela.clima?.daily || {};
  const tempMax = daily.temperature_2m_max?.[0] ?? 26;
  const tempMin = daily.temperature_2m_min?.[0] ?? 15;

  if (!badgeSenamhi || !txtSenamhi) return;

  if (p6.lluviaInminente) {
    badgeSenamhi.className =
      "bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[11px] font-bold px-2.5 py-0.5 rounded-full";
    badgeSenamhi.innerText = "● Aviso de Precipitación";
    txtSenamhi.innerText = `Se detecta núcleo de lluvia en la zona (${p6.maxProb6h}% de probabilidad y ${p6.totalMm6h} mm acumulados en 6h). Revisa drenajes y evita riegos redundantes.`;
  } else if (tempMax >= 31) {
    badgeSenamhi.className =
      "bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold px-2.5 py-0.5 rounded-full";
    badgeSenamhi.innerText = "● Alerta por Radiación / Calor";
    txtSenamhi.innerText = `Temperatura máxima prevista de ${tempMax.toFixed(0)}°C en el sector. Alta evapotranspiración diurna; prioriza riegos tempranos o nocturnos.`;
  } else if (tempMin <= 6) {
    badgeSenamhi.className =
      "bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[11px] font-bold px-2.5 py-0.5 rounded-full";
    badgeSenamhi.innerText = "● Descenso Térmico Nocturno";
    txtSenamhi.innerText = `Mínima prevista de ${tempMin.toFixed(0)}°C durante la madrugada. Mantén humedad moderada en el suelo para amortiguar el enfriamiento radicular.`;
  } else {
    badgeSenamhi.className =
      "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold px-2.5 py-0.5 rounded-full";
    badgeSenamhi.innerText = "● Tiempo Estable";
    txtSenamhi.innerText = `Condiciones meteorológicas estables para ${parcela.parcela} (rango térmico ${tempMin.toFixed(0)}°C a ${tempMax.toFixed(0)}°C) sin eventos extremos previstos.`;
  }
}

function actualizarKpisYConsejo(parcela) {
  const current = parcela.clima?.current || {};
  const daily = parcela.clima?.daily || {};
  const p6 = parcela.pronostico_6h || {};

  const tempAct =
    current.temperature_2m !== undefined
      ? `${Number(current.temperature_2m).toFixed(1)} °C`
      : "-- °C";
  const tMin =
    daily.temperature_2m_min?.[0] !== undefined
      ? Math.round(daily.temperature_2m_min[0])
      : "--";
  const tMax =
    daily.temperature_2m_max?.[0] !== undefined
      ? Math.round(daily.temperature_2m_max[0])
      : "--";
  const viento =
    current.wind_speed_10m !== undefined
      ? `${Math.round(current.wind_speed_10m)} km/h`
      : "-- km/h";
  const et0 =
    daily.et0_fao_evapotranspiration?.[0] !== undefined
      ? ` • ET0 ${Number(daily.et0_fao_evapotranspiration[0]).toFixed(1)} mm`
      : "";

  document.getElementById("kpiTempActual").innerText = tempAct;
  document.getElementById("kpiTempRango").innerText = `${tMin}° / ${tMax}°`;
  document.getElementById("kpiLluvia6h").innerText = `${p6.maxProb6h || 0} %`;
  document.getElementById("kpiEt0Viento").innerText = `${viento}${et0}`;

  const banner = document.getElementById("bannerRecomendacionClima");
  const badge = document.getElementById("badgeDecisionClima");
  const consejo = document.getElementById("txtConsejoRiegoClima");

  if (p6.lluviaInminente) {
    banner.className =
      "bg-slate-800 border-l-4 border-sky-500 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl";
    badge.className =
      "bg-sky-500/20 text-sky-300 text-xs px-2.5 py-0.5 rounded-full font-bold";
    badge.innerText = "RIEGO EN ESPERA POR LLUVIA";
    consejo.innerText = `Lluvia prevista (${p6.maxProb6h}% en ${p6.horasHastaLluvia}h, ${p6.totalMm6h} mm): el sistema pospondrá el riego automático en ${parcela.parcela} para ahorrar agua.`;
  } else if (typeof tMax === "number" && tMax >= 29) {
    banner.className =
      "bg-slate-800 border-l-4 border-amber-500 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl";
    badge.className =
      "bg-amber-500/20 text-amber-300 text-xs px-2.5 py-0.5 rounded-full font-bold";
    badge.innerText = "EVAPORACIÓN ALTA AL MEDIODÍA";
    consejo.innerText = `Pico térmico de ${tMax}°C sin lluvia prevista (máx. ${p6.maxProb6h || 0}%): evita regar entre 11:00 y 15:00; ventana óptima antes de las 08:00 o después de las 18:00.`;
  } else {
    banner.className =
      "bg-slate-800 border-l-4 border-emerald-500 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl";
    badge.className =
      "bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-bold";
    badge.innerText = "RIEGO AUTOMÁTICO HABILITADO";
    consejo.innerText = `Sin lluvia relevante en las próximas 6h (máx. ${p6.maxProb6h || 0}%): el riego de ${parcela.parcela} operará normalmente cuando la humedad baje de ${parcela.umbral_humedad}%.`;
  }
}

function renderizarTarjetasHorarias(parcela) {
  const grid = document.getElementById("gridTarjetasHorarias");
  if (!grid) return;

  const horas = Array.isArray(parcela.proximas_24h) ? parcela.proximas_24h : [];
  if (horas.length === 0) {
    grid.innerHTML =
      '<div class="col-span-full text-xs text-slate-500 py-3">Sin datos horarios disponibles.</div>';
    return;
  }

  // Tomar 8 bloques espaciados cada 3 horas para una lectura visual limpia
  const bloques = [];
  for (let i = 0; i < horas.length && bloques.length < 8; i += 3) {
    bloques.push(horas[i]);
  }

  grid.innerHTML = bloques
    .map((h, idx) => {
      const icono = iconoHorarioClima(
        h.hora,
        h.prob_lluvia,
        h.lluvia_mm,
        h.temperatura,
      );
      const lluviaAlta = h.prob_lluvia >= 60;
      const bordeCard = lluviaAlta
        ? "border-sky-500/60 bg-sky-950/30"
        : idx === 0
          ? "border-amber-500/50 bg-slate-800"
          : "border-slate-700/80 bg-slate-800/80";

      return `
        <div class="rounded-2xl border ${bordeCard} p-3.5 text-center space-y-1.5 shadow">
          <p class="text-xs font-mono font-bold ${idx === 0 ? "text-amber-400" : "text-slate-400"}">
            ${idx === 0 ? "Ahora (" + h.hora + ")" : h.hora}
          </p>
          <div class="text-3xl py-1">${icono}</div>
          <p class="text-lg font-black text-slate-100">
            ${Math.round(h.temperatura)}°C
          </p>
          <p class="text-xs font-bold ${lluviaAlta ? "text-sky-300" : "text-sky-400/80"}">
            💧 ${Math.round(h.prob_lluvia)}%
          </p>
          <p class="text-[10px] text-slate-500">
            ${h.lluvia_mm > 0 ? h.lluvia_mm.toFixed(1) + " mm" : "Seco"}
          </p>
        </div>
      `;
    })
    .join("");
}

function renderizarGraficasSeparadas(parcela) {
  const horas = (parcela.proximas_24h || []).slice(0, 24);
  const labels = horas.map((h) => h.hora);
  const temps = horas.map((h) => h.temperatura);
  const probs = horas.map((h) => h.prob_lluvia);

  const canvasTemp = document.getElementById("chartTemperatura24h");
  const canvasLluvia = document.getElementById("chartLluvia24h");

  if (canvasTemp) {
    if (chartTemp) chartTemp.destroy();
    const ctxT = canvasTemp.getContext("2d");
    const gradienteTemp = ctxT.createLinearGradient(0, 0, 0, 220);
    gradienteTemp.addColorStop(0, "rgba(245, 158, 11, 0.35)");
    gradienteTemp.addColorStop(1, "rgba(245, 158, 11, 0.0)");

    chartTemp = new Chart(ctxT, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Temperatura (°C)",
            data: temps,
            borderColor: "#f59e0b",
            backgroundColor: gradienteTemp,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: "#fbbf24",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Temperatura: ${ctx.parsed.y}°C`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#94a3b8",
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
            },
            grid: { color: "rgba(51, 65, 85, 0.4)" },
          },
          y: {
            suggestedMin: 12,
            suggestedMax: 34,
            ticks: { color: "#fbbf24", callback: (v) => v + "°C" },
            grid: { color: "rgba(51, 65, 85, 0.4)" },
          },
        },
      },
    });
  }

  if (canvasLluvia) {
    if (chartLluvia) chartLluvia.destroy();
    const ctxL = canvasLluvia.getContext("2d");

    chartLluvia = new Chart(ctxL, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Probabilidad de Lluvia (%)",
            data: probs,
            backgroundColor: probs.map((v) =>
              v >= 65 ? "rgba(14, 165, 233, 0.85)" : "rgba(56, 189, 248, 0.45)",
            ),
            borderColor: "#38bdf8",
            borderWidth: 1,
            borderRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Probabilidad de lluvia: ${ctx.parsed.y}%`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#94a3b8",
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
            },
            grid: { color: "rgba(51, 65, 85, 0.4)" },
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: "#38bdf8", stepSize: 25, callback: (v) => v + "%" },
            grid: { color: "rgba(51, 65, 85, 0.4)" },
          },
        },
      },
    });
  }
}
