// =========================================================================
// CONFIGURACIÓN PERSONALIZABLE DEL PDF (EDITA AQUÍ COLORES Y TEXTOS)
// =========================================================================
const CONFIG_PDF = {
  nombrePlataforma: "ASIR — AGRO SIN RIESGO",
  subtituloSistema:
    "Plataforma SaaS de Telemetría Agrícola y Riego Tecnificado",
  colorCabeceraRGB: [15, 23, 42],
  colorAcentoRGB: [2, 132, 199],
  colorTablaTelemetria: [16, 185, 129],
  colorTablaIngenieria: [2, 132, 199],
  colorTablaRiego: [245, 158, 11],
  mostrarBloqueFirma: true,
  textoFirma: "Firma / V°B° Responsable Técnico o Productor",
};

let categoriaSeleccionada = "integral";
let datosCargados = false;
let datosReporte = {
  ingenieria: [],
  telemetria: [],
  programaciones: [],
  historial_riego: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  aplicarRangoRapido(7, false);
  await cargarListaParcelasFiltro();
  await cargarDatosReporte();
});

function formatearFechaISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatearFechaHora(fechaStr) {
  if (!fechaStr) return "-";
  const d = new Date(fechaStr);
  if (isNaN(d.getTime())) return String(fechaStr);
  return d.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function aplicarRangoRapido(diasAtras, recargar = true) {
  const hoy = new Date();
  const inicio = new Date();
  inicio.setDate(hoy.getDate() - diasAtras);

  document.getElementById("filtroFechaInicio").value =
    formatearFechaISO(inicio);
  document.getElementById("filtroFechaFin").value = formatearFechaISO(hoy);

  document.querySelectorAll(".btn-rango").forEach((btn) => {
    const activo = parseInt(btn.dataset.rango, 10) === diasAtras;
    btn.className = activo
      ? "btn-rango flex-1 bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[11px] font-bold py-2.5 rounded-xl transition"
      : "btn-rango flex-1 bg-slate-900 text-slate-400 hover:text-white border border-slate-700 text-[11px] font-semibold py-2.5 rounded-xl transition";
  });

  if (recargar) cargarDatosReporte();
}

function marcarRangoPersonalizado() {
  document.querySelectorAll(".btn-rango").forEach((btn) => {
    btn.className =
      "btn-rango flex-1 bg-slate-900 text-slate-400 hover:text-white border border-slate-700 text-[11px] font-semibold py-2.5 rounded-xl transition";
  });
}

async function cargarListaParcelasFiltro() {
  const sel = document.getElementById("filtroParcela");
  if (!sel || !usuarioSesion) return;

  try {
    const res = await fetch("/api/parcelas?id_usuario=" + usuarioSesion.id);
    const parcelas = await res.json();

    const unicas = new Map();
    parcelas.forEach((p) => {
      if (!unicas.has(p.id)) unicas.set(p.id, p);
    });

    sel.innerHTML =
      '<option value="todas">Todas las parcelas</option>' +
      Array.from(unicas.values())
        .map(
          (p) =>
            `<option value="${p.id}">📍 ${p.parcela} (${p.cultivo || "General"})</option>`,
        )
        .join("");
  } catch (err) {
    console.error("Error cargando parcelas en filtro:", err);
  }
}

function seleccionarCategoria(cat) {
  categoriaSeleccionada = cat;

  document.querySelectorAll(".btn-categoria").forEach((btn) => {
    const activo = btn.dataset.cat === cat;
    btn.className = activo
      ? "btn-categoria text-left p-4 rounded-2xl border-2 border-sky-500 bg-sky-500/10 transition"
      : "btn-categoria text-left p-4 rounded-2xl border border-slate-700 bg-slate-800/70 hover:border-slate-600 transition";
  });

  const estructuras = {
    integral: {
      titulo: "Contenido del Informe Ejecutivo Integral",
      items: [
        "Encabezado corporativo y datos del titular de la cuenta",
        "Ficha técnica de parcelas, dimensiones m² y presupuesto PVC",
        "Estadísticas y tabla cronológica de sensores ESP32",
        "Cronogramas activos y bitácora de eventos de riego",
      ],
    },
    telemetria: {
      titulo: "Contenido del Reporte de Telemetría y Microclima",
      items: [
        "Encabezado corporativo y periodo de monitoreo seleccionado",
        "Cálculo de promedios, mínimos y máximos de humedad y temperatura",
        "Tabla detallada de lecturas registradas por cada nodo ESP32",
      ],
    },
    ingenieria: {
      titulo: "Contenido de la Memoria de Ingeniería 2D y Presupuesto",
      items: [
        "Encabezado corporativo y alcance de parcelas",
        "Dimensiones en m², cantidad de nodos y metros lineales de red PVC",
        "Presupuesto consolidado de infraestructura hidráulica en soles (S/)",
      ],
    },
    riego: {
      titulo: "Contenido del Reporte Operativo y Bitácora de Riego",
      items: [
        "Encabezado corporativo y periodo auditado",
        "Tabla de horarios automáticos configurados por día y duración",
        "Historial cronológico de activaciones manuales y automáticas",
      ],
    },
  };

  const info = estructuras[cat];
  document.getElementById("tituloEstructuraDoc").innerText = info.titulo;
  document.getElementById("listaCapitulosDoc").innerHTML = info.items
    .map((txt) => `<li>${txt}</li>`)
    .join("");
}

async function cargarDatosReporte() {
  if (!usuarioSesion) return;

  const badge = document.getElementById("badgeEstadoPaquete");
  if (badge) badge.innerText = "Sincronizando registros...";

  const idParcela = document.getElementById("filtroParcela").value;
  const fInicio = document.getElementById("filtroFechaInicio").value;
  const fFin = document.getElementById("filtroFechaFin").value;

  const params = new URLSearchParams({
    id_usuario: usuarioSesion.id,
    id_parcela: idParcela,
    fecha_inicio: fInicio,
    fecha_fin: fFin,
  });

  try {
    const res = await fetch("/api/reportes/consolidado?" + params.toString());
    datosReporte = await res.json();
    datosCargados = true;

    const nParc = (datosReporte.ingenieria || []).length;
    const nTel = (datosReporte.telemetria || []).length;
    const nRiego = (datosReporte.historial_riego || []).length;

    if (badge) {
      badge.innerText = `✓ Listo para compilar (${nParc} parcelas • ${nTel} lecturas • ${nRiego} eventos)`;
    }
  } catch (err) {
    console.error("Error cargando datos del reporte:", err);
    if (badge) badge.innerText = "⚠️ Error al sincronizar datos";
  }
}

function calcularMetricasResumen() {
  const tel = datosReporte.telemetria || [];
  const ing = datosReporte.ingenieria || [];
  const hist = datosReporte.historial_riego || [];

  let promHumSuelo = null;
  let minHumSuelo = null;
  let maxHumSuelo = null;
  let promTemp = null;

  if (tel.length > 0) {
    const hums = tel
      .map((t) => parseFloat(t.humedad_suelo))
      .filter((v) => !isNaN(v));
    const temps = tel
      .map((t) => parseFloat(t.temperatura))
      .filter((v) => !isNaN(v));

    if (hums.length > 0) {
      promHumSuelo = hums.reduce((a, b) => a + b, 0) / hums.length;
      minHumSuelo = Math.min(...hums);
      maxHumSuelo = Math.max(...hums);
    }
    if (temps.length > 0) {
      promTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    }
  }

  const totalPresupuesto = ing.reduce(
    (acc, i) => acc + (i.presupuesto_pvc || 0),
    0,
  );
  const totalMetrosPvc = ing.reduce((acc, i) => acc + (i.metros_pvc || 0), 0);
  const totalNodos = ing.reduce((acc, i) => acc + (i.total_nodos || 0), 0);

  return {
    promHumSuelo,
    minHumSuelo,
    maxHumSuelo,
    promTemp,
    totalPresupuesto,
    totalMetrosPvc,
    totalNodos,
    totalLecturas: tel.length,
    totalEventosRiego: hist.length,
  };
}

// =========================================================================
// GENERADOR DE DOCUMENTO PDF POR CATEGORÍA (SE ABRE EN PESTAÑA NUEVA)
// =========================================================================

async function generarPDF(accion = "abrir") {
  if (!window.jspdf) {
    alert(
      "La librería PDF aún se está cargando. Intenta nuevamente en un segundo.",
    );
    return;
  }

  if (!datosCargados) {
    await cargarDatosReporte();
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const m = calcularMetricasResumen();

  const titulosCategoria = {
    integral: "INFORME EJECUTIVO INTEGRAL DE OPERACIONES Y TELEMETRÍA",
    telemetria: "REPORTE TÉCNICO DE TELEMETRÍA Y MICROCLIMA DE CULTIVOS",
    ingenieria: "MEMORIA DESCRIPTIVA DE INGENIERÍA 2D Y PRESUPUESTO HIDRÁULICO",
    riego: "REPORTE OPERATIVO DE PROGRAMACIÓN Y BITÁCORA DE RIEGO",
  };

  const selParcela = document.getElementById("filtroParcela");
  const nombreParcelaFiltro =
    selParcela.options[selParcela.selectedIndex]?.text || "Todas";
  const fInicio = document.getElementById("filtroFechaInicio").value;
  const fFin = document.getElementById("filtroFechaFin").value;
  const fechaEmision = new Date().toLocaleString("es-PE");

  doc.setFillColor(...CONFIG_PDF.colorCabeceraRGB);
  doc.rect(0, 0, 210, 34, "F");

  doc.setFillColor(...CONFIG_PDF.colorAcentoRGB);
  doc.rect(0, 34, 210, 1.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(CONFIG_PDF.nombrePlataforma, 14, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(186, 230, 253);
  doc.text(CONFIG_PDF.subtituloSistema, 14, 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(titulosCategoria[categoriaSeleccionada], 14, 29);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 40, 182, 20, 2, 2, "FD");

  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "bold");
  doc.text("Productor / Titular:", 18, 46);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${usuarioSesion?.nombre || "Usuario"} (${usuarioSesion?.correo || ""})`,
    48,
    46,
  );

  doc.setFont("helvetica", "bold");
  doc.text("Alcance / Parcela:", 18, 52);
  doc.setFont("helvetica", "normal");
  doc.text(nombreParcelaFiltro.replace("📍 ", ""), 48, 52);

  doc.setFont("helvetica", "bold");
  doc.text("Periodo Analizado:", 18, 57.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Del ${fInicio} al ${fFin}   |   Emitido: ${fechaEmision}`,
    48,
    57.5,
  );

  let cursorY = 66;

  if (
    categoriaSeleccionada === "integral" ||
    categoriaSeleccionada === "ingenieria"
  ) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      "Ficha Técnica de Parcelas, Diseño 2D y Presupuesto Hidráulico",
      14,
      cursorY,
    );
    cursorY += 3;

    const filasIng = (datosReporte.ingenieria || []).map((i) => [
      i.parcela,
      i.cultivo,
      i.tiene_diseno
        ? `${i.ancho_metros}x${i.alto_metros}m (${i.area_m2} m²)`
        : "Sin plano",
      String(i.total_nodos),
      `${i.metros_pvc.toFixed(1)} m`,
      `S/ ${i.presupuesto_pvc.toFixed(2)}`,
      `${i.modo_riego} (${i.umbral_humedad}%)`,
    ]);

    doc.autoTable({
      startY: cursorY,
      head: [
        [
          "Parcela",
          "Cultivo",
          "Dimensiones / Área",
          "Nodos",
          "Red PVC",
          "Costo Est.",
          "Modo / Umbral",
        ],
      ],
      body:
        filasIng.length > 0
          ? filasIng
          : [["Sin parcelas registradas", "-", "-", "-", "-", "-", "-"]],
      theme: "grid",
      headStyles: { fillColor: CONFIG_PDF.colorTablaIngenieria, fontSize: 8 },
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59] },
      foot: [
        [
          "TOTAL CONSOLIDADO",
          "",
          "",
          `${m.totalNodos} nodos`,
          `${m.totalMetrosPvc.toFixed(1)} m`,
          `S/ ${m.totalPresupuesto.toFixed(2)}`,
          "",
        ],
      ],
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        fontSize: 8,
      },
      margin: { left: 14, right: 14 },
    });

    cursorY = doc.lastAutoTable.finalY + 9;
  }

  if (
    categoriaSeleccionada === "integral" ||
    categoriaSeleccionada === "telemetria"
  ) {
    if (cursorY > 240) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      "Resumen y Registro Histórico de Telemetría (Sensores ESP32)",
      14,
      cursorY,
    );
    cursorY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const resumenTel =
      m.promHumSuelo !== null
        ? `Lecturas: ${m.totalLecturas}  |  Humedad Suelo Prom: ${m.promHumSuelo.toFixed(1)}% (Mín ${m.minHumSuelo.toFixed(1)}% - Máx ${m.maxHumSuelo.toFixed(1)}%)  |  Temp. Media: ${m.promTemp.toFixed(1)} °C`
        : "No se registraron paquetes de telemetría en el rango de fechas seleccionado.";
    doc.text(resumenTel, 14, cursorY);
    cursorY += 3.5;

    const filasTel = (datosReporte.telemetria || [])
      .slice(0, 120)
      .map((t) => [
        formatearFechaHora(t.fecha_registro),
        t.parcela,
        t.cultivo,
        t.codigo_mac,
        `${parseFloat(t.humedad_suelo).toFixed(1)}%`,
        `${parseFloat(t.temperatura).toFixed(1)} °C`,
        `${parseFloat(t.humedad_aire).toFixed(1)}%`,
      ]);

    doc.autoTable({
      startY: cursorY,
      head: [
        [
          "Fecha / Hora",
          "Parcela",
          "Cultivo",
          "Nodo MAC",
          "Hum. Suelo",
          "Temp.",
          "Hum. Aire",
        ],
      ],
      body:
        filasTel.length > 0
          ? filasTel
          : [["Sin registros en el periodo", "-", "-", "-", "-", "-", "-"]],
      theme: "striped",
      headStyles: { fillColor: CONFIG_PDF.colorTablaTelemetria, fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      margin: { left: 14, right: 14 },
    });

    cursorY = doc.lastAutoTable.finalY + 9;
  }

  if (
    categoriaSeleccionada === "integral" ||
    categoriaSeleccionada === "riego"
  ) {
    if (cursorY > 235) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      "Programaciones Horarias y Bitácora de Eventos de Riego",
      14,
      cursorY,
    );
    cursorY += 3.5;

    const filasProg = (datosReporte.programaciones || []).map((pr) => [
      pr.parcela,
      pr.dias_semana,
      pr.hora_inicio,
      `${pr.duracion_minutos} min`,
      pr.activo ? "ACTIVO" : "PAUSADO",
    ]);

    doc.autoTable({
      startY: cursorY,
      head: [
        ["Parcela", "Días Programados", "Hora Inicio", "Duración", "Estado"],
      ],
      body:
        filasProg.length > 0
          ? filasProg
          : [["Sin horarios automáticos configurados", "-", "-", "-", "-"]],
      theme: "grid",
      headStyles: { fillColor: CONFIG_PDF.colorTablaRiego, fontSize: 8 },
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59] },
      margin: { left: 14, right: 14 },
    });

    cursorY = doc.lastAutoTable.finalY + 6;

    const filasHist = (datosReporte.historial_riego || [])
      .slice(0, 80)
      .map((h) => [
        formatearFechaHora(h.fecha_registro),
        h.parcela,
        h.origen,
        h.accion,
        h.detalle || "-",
      ]);

    doc.autoTable({
      startY: cursorY,
      head: [["Fecha / Hora", "Parcela", "Origen", "Acción", "Detalle"]],
      body:
        filasHist.length > 0
          ? filasHist
          : [
              [
                "Sin eventos de riego registrados en el periodo",
                "-",
                "-",
                "-",
                "-",
              ],
            ],
      theme: "striped",
      headStyles: { fillColor: [71, 85, 105], fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      margin: { left: 14, right: 14 },
    });

    cursorY = doc.lastAutoTable.finalY + 12;
  }

  if (CONFIG_PDF.mostrarBloqueFirma) {
    if (cursorY > 265) {
      doc.addPage();
      cursorY = 30;
    }
    doc.setDrawColor(148, 163, 184);
    doc.line(70, cursorY + 12, 140, cursorY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(CONFIG_PDF.textoFirma, 105, cursorY + 17, { align: "center" });
  }

  const totalPaginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${CONFIG_PDF.nombrePlataforma} • Documento generado automáticamente`,
      14,
      290,
    );
    doc.text(`Página ${i} de ${totalPaginas}`, 196, 290, { align: "right" });
  }

  if (accion === "descargar") {
    doc.save(`ASIR_Reporte_${categoriaSeleccionada}_${fFin}.pdf`);
  } else {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  }
}

// =========================================================================
// EXPORTACIÓN A EXCEL (.XLSX) Y CSV
// =========================================================================

async function exportarExcel() {
  if (!window.XLSX) {
    alert("Librería Excel cargando, intenta en un segundo.");
    return;
  }

  if (!datosCargados) {
    await cargarDatosReporte();
  }

  const wb = XLSX.utils.book_new();

  const hojaTel = XLSX.utils.json_to_sheet(
    (datosReporte.telemetria || []).map((t) => ({
      Fecha_Hora: formatearFechaHora(t.fecha_registro),
      Parcela: t.parcela,
      Cultivo: t.cultivo,
      Nodo_MAC: t.codigo_mac,
      Humedad_Suelo_Pct: parseFloat(t.humedad_suelo),
      Temperatura_C: parseFloat(t.temperatura),
      Humedad_Aire_Pct: parseFloat(t.humedad_aire),
    })),
  );
  XLSX.utils.book_append_sheet(wb, hojaTel, "Telemetria");

  const hojaIng = XLSX.utils.json_to_sheet(
    (datosReporte.ingenieria || []).map((i) => ({
      Parcela: i.parcela,
      Cultivo: i.cultivo,
      Ancho_m: i.ancho_metros,
      Alto_m: i.alto_metros,
      Area_m2: i.area_m2,
      Total_Nodos: i.total_nodos,
      Tuberia_PVC_m: i.metros_pvc,
      Costo_Metro_Soles: i.costo_metro_pvc,
      Presupuesto_Total_Soles: i.presupuesto_pvc,
      Modo_Riego: i.modo_riego,
      Umbral_Humedad_Pct: i.umbral_humedad,
    })),
  );
  XLSX.utils.book_append_sheet(wb, hojaIng, "Ingenieria_2D");

  const hojaRiego = XLSX.utils.json_to_sheet(
    (datosReporte.historial_riego || []).map((h) => ({
      Fecha_Hora: formatearFechaHora(h.fecha_registro),
      Parcela: h.parcela,
      Origen: h.origen,
      Accion: h.accion,
      Detalle: h.detalle || "",
    })),
  );
  XLSX.utils.book_append_sheet(wb, hojaRiego, "Bitacora_Riego");

  const fFin = document.getElementById("filtroFechaFin").value;
  XLSX.writeFile(wb, `ASIR_Consolidado_${fFin}.xlsx`);
}

async function exportarCSV() {
  if (!datosCargados) {
    await cargarDatosReporte();
  }

  const filas = datosReporte.telemetria || [];
  const cabeceras = [
    "Fecha_Hora",
    "Parcela",
    "Cultivo",
    "Nodo_MAC",
    "Humedad_Suelo_Pct",
    "Temperatura_C",
    "Humedad_Aire_Pct",
  ];
  const lineas = [cabeceras.join(",")];

  filas.forEach((t) => {
    lineas.push(
      [
        `"${formatearFechaHora(t.fecha_registro)}"`,
        `"${t.parcela}"`,
        `"${t.cultivo}"`,
        `"${t.codigo_mac}"`,
        t.humedad_suelo,
        t.temperatura,
        t.humedad_aire,
      ].join(","),
    );
  });

  const blob = new Blob(["\uFEFF" + lineas.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ASIR_Telemetria_${document.getElementById("filtroFechaFin").value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
