let parcelasRiego = [];
let pronosticosRiego = {};
let programacionesCache = [];
let editHorarioId = null;

document.addEventListener("DOMContentLoaded", () => {
  prepararControlesEdicionFormulario();
  cargarTodoRiego();
});

async function cargarTodoRiego() {
  await cargarPronosticosRiego();
  await cargarSectoresRiego();
  await cargarProgramaciones();
  await cargarHistorialRiego();
}

async function cargarPronosticosRiego() {
  try {
    const res = await fetch("/api/alertas-agro/" + usuarioSesion.id);
    const lista = await res.json();
    if (Array.isArray(lista)) {
      lista.forEach((item) => {
        pronosticosRiego[item.id] = item.pronostico_6h || null;
      });
    }
  } catch (e) {}
}

function descripcionModoCampo(modo, umbral) {
  if (modo === "MANUAL_ON") {
    return "Abre el paso de agua manualmente de forma continua hasta que lo detengas.";
  }
  if (modo === "MANUAL_OFF") {
    return "Mantiene la válvula cerrada y suspende cualquier riego automático o programado.";
  }
  return `Riega automáticamente solo si la humedad baja de ${umbral}% y no hay lluvia prevista.`;
}

// =========================================================================
// 1. TARJETAS DE CONTROL POR PARCELA / CAMPO
// =========================================================================

async function cargarSectoresRiego() {
  const grid = document.getElementById("gridSectoresRiego");
  const select = document.getElementById("selParcelaRiego");
  const lblResumen = document.getElementById("lblResumenValvulas");

  try {
    const res = await fetch("/api/parcelas?id_usuario=" + usuarioSesion.id);
    parcelasRiego = await res.json();

    const valorPrevio = select.value;
    select.innerHTML = '<option value="">Selecciona una parcela...</option>';

    const kpiAuto = document.getElementById("kpiCamposAuto");
    const kpiDetalle = document.getElementById("kpiDetalleCampos");

    if (!parcelasRiego || parcelasRiego.length === 0) {
      lblResumen.innerText = "0 campos registrados";
      if (kpiAuto) kpiAuto.innerText = "0 / 0";
      if (kpiDetalle) kpiDetalle.innerText = "Sin campos configurados";
      grid.innerHTML =
        '<div class="col-span-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">' +
        '<p class="text-sm text-slate-400">Aún no tienes campos registrados.</p>' +
        '<a href="/gestion-parcelas.html" class="inline-block mt-3 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-lg">' +
        "➕ Registrar Mi Primer Campo</a></div>";
      return;
    }

    const enAuto = parcelasRiego.filter(
      (p) => (p.modo_riego || "AUTO") === "AUTO",
    ).length;
    const forzadosOn = parcelasRiego.filter(
      (p) => p.modo_riego === "MANUAL_ON",
    ).length;

    if (kpiAuto) kpiAuto.innerText = `${enAuto} / ${parcelasRiego.length}`;
    if (kpiDetalle)
      kpiDetalle.innerText = `${forzadosOn} en riego manual activo`;

    lblResumen.innerText =
      parcelasRiego.length +
      (parcelasRiego.length === 1 ? " campo" : " campos") +
      " • " +
      enAuto +
      " en modo Inteligente";

    grid.innerHTML = "";

    parcelasRiego.forEach((p) => {
      const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
      const campoGeneral = p.campo_general ? `${p.campo_general} • ` : "";
      const cultivo = p.cultivo || "General";
      const mac = p.codigo_mac || "Sin sensor";
      const modo = p.modo_riego || "AUTO";
      const umbral =
        p.umbral_humedad !== null ? parseFloat(p.umbral_humedad) : 35;
      const p6 = pronosticosRiego[p.id];

      select.innerHTML +=
        '<option value="' +
        p.id +
        '">' +
        campoGeneral +
        "#" +
        p.id +
        " - " +
        nombre +
        " (" +
        cultivo +
        ")</option>";

      let badgeEstado = "";
      let bordeCard = "border-slate-700";

      if (modo === "MANUAL_ON") {
        badgeEstado =
          '<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-bold animate-pulse">💧 REGANDO AHORA</span>';
        bordeCard = "border-emerald-500/50";
      } else if (modo === "MANUAL_OFF") {
        badgeEstado =
          '<span class="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-bold">🛑 APAGADO</span>';
        bordeCard = "border-rose-500/40";
      } else {
        badgeEstado =
          '<span class="bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-bold">🤖 INTELIGENTE</span>';
      }

      const avisoClima =
        p6 && p6.lluviaInminente
          ? `<div class="bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[11px] px-3 py-1.5 rounded-lg font-medium">🌦️ Lluvia prevista (${p6.maxProb6h}% en ${p6.horasHastaLluvia}h): el modo Inteligente pospondrá el riego.</div>`
          : "";

      const clsAuto =
        modo === "AUTO"
          ? "bg-sky-600 text-white shadow"
          : "text-slate-400 hover:text-white";
      const clsOn =
        modo === "MANUAL_ON"
          ? "bg-emerald-600 text-white shadow"
          : "text-slate-400 hover:text-white";
      const clsOff =
        modo === "MANUAL_OFF"
          ? "bg-rose-600 text-white shadow"
          : "text-slate-400 hover:text-white";

      grid.innerHTML +=
        '<div class="bg-slate-800 p-5 rounded-2xl border ' +
        bordeCard +
        ' shadow-lg flex flex-col justify-between space-y-4">' +
        '<div class="flex items-start justify-between gap-2">' +
        "<div>" +
        '<span class="text-xs font-mono text-sky-400 font-bold">' +
        (p.campo_general ? `🏡 ${p.campo_general} • ` : "") +
        "Campo #" +
        p.id +
        "</span>" +
        '<h4 class="text-base font-bold text-slate-100">' +
        nombre +
        "</h4>" +
        '<p class="text-xs text-slate-400">🌱 ' +
        cultivo +
        ' • 📡 <span class="font-mono text-amber-400">' +
        mac +
        "</span></p>" +
        "</div>" +
        badgeEstado +
        "</div>" +
        avisoClima +
        '<div class="bg-slate-900/80 p-3 rounded-xl border border-slate-700/80 space-y-1.5">' +
        '<div class="flex items-center justify-between gap-2">' +
        '<span class="text-xs font-semibold text-slate-300">Humedad mínima deseada:</span>' +
        '<div class="flex items-center gap-1.5">' +
        '<input type="number" id="umbralSector_' +
        p.id +
        '" value="' +
        umbral +
        '" min="5" max="90" class="w-16 bg-slate-800 border border-slate-600 text-amber-400 font-bold text-center text-xs rounded-lg py-1 px-1.5 focus:outline-none focus:border-sky-500" />' +
        '<span class="text-xs text-slate-500 font-bold">%</span>' +
        '<button onclick="actualizarUmbralSector(' +
        p.id +
        ')" class="bg-slate-700 hover:bg-sky-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg transition">Guardar</button>' +
        "</div>" +
        "</div>" +
        '<p class="text-[11px] text-slate-500">Guía: 30%–40% recomendado para hortalizas y césped.</p>' +
        "</div>" +
        '<div class="space-y-2">' +
        '<div class="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700 text-xs">' +
        '<button onclick="cambiarModoSector(' +
        p.id +
        ", 'AUTO')\" class=\"py-2 rounded-lg font-bold transition " +
        clsAuto +
        '">🤖 Inteligente</button>' +
        '<button onclick="cambiarModoSector(' +
        p.id +
        ", 'MANUAL_ON')\" class=\"py-2 rounded-lg font-bold transition " +
        clsOn +
        '">💧 Regar Ahora</button>' +
        '<button onclick="cambiarModoSector(' +
        p.id +
        ", 'MANUAL_OFF')\" class=\"py-2 rounded-lg font-bold transition " +
        clsOff +
        '">🛑 Apagado</button>' +
        "</div>" +
        '<p class="text-[11px] text-slate-400 leading-relaxed px-1">' +
        descripcionModoCampo(modo, umbral) +
        "</p>" +
        "</div>" +
        "</div>";
    });

    if (valorPrevio) {
      select.value = valorPrevio;
    }
  } catch (err) {
    console.error("Error cargando sectores de riego:", err);
  }
}

async function cambiarModoSector(idParcela, nuevoModo) {
  try {
    const res = await fetch("/api/parcelas/" + idParcela + "/modo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo: nuevoModo }),
    });

    if (res.ok) {
      await cargarSectoresRiego();
      await cargarHistorialRiego();
    }
  } catch (err) {
    alert("Error de conexión al cambiar modo de riego.");
  }
}

async function actualizarUmbralSector(idParcela) {
  const input = document.getElementById("umbralSector_" + idParcela);
  const umbral = parseFloat(input.value);

  if (isNaN(umbral) || umbral < 5 || umbral > 90) {
    alert("Ingresa un porcentaje válido entre 5% y 90%.");
    return;
  }

  try {
    const res = await fetch("/api/parcelas/" + idParcela + "/umbral", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ umbral }),
    });

    if (res.ok) {
      alert("✅ Humedad mínima actualizada a " + umbral + "%");
      cargarSectoresRiego();
    }
  } catch (err) {
    alert("Error al actualizar humedad mínima.");
  }
}

async function apagarTodoEmergencia() {
  if (!parcelasRiego || parcelasRiego.length === 0) return;

  const confirmar = confirm(
    "¿Deseas cerrar inmediatamente el riego en TODOS tus campos?",
  );
  if (!confirmar) return;

  try {
    await Promise.all(
      parcelasRiego.map((p) =>
        fetch("/api/parcelas/" + p.id + "/modo", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modo: "MANUAL_OFF" }),
        }),
      ),
    );
    await cargarSectoresRiego();
    await cargarHistorialRiego();
  } catch (err) {
    alert("Error al ejecutar parada general.");
  }
}

// =========================================================================
// 2. VALIDACIÓN ANTI-SOLAPAMIENTO Y EDICIÓN DE HORARIOS SEMANALES
// =========================================================================

function prepararControlesEdicionFormulario() {
  const form = document.querySelector('form[onsubmit*="crearProgramacion"]');
  if (!form) return;

  const btnSubmit = form.querySelector('button[type="submit"]');
  if (!btnSubmit) return;

  // Contenedor de alerta de conflicto en tiempo real
  if (!document.getElementById("alertaConflictoHorario")) {
    const alertaDiv = document.createElement("div");
    alertaDiv.id = "alertaConflictoHorario";
    alertaDiv.className =
      "hidden bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs p-3 rounded-xl space-y-2";
    btnSubmit.parentNode.insertBefore(alertaDiv, btnSubmit);
  }

  // Envolver botón submit para poder mostrar botón "Cancelar" al editar
  if (!document.getElementById("grupoBotonesHorario")) {
    const wrapper = document.createElement("div");
    wrapper.id = "grupoBotonesHorario";
    wrapper.className = "flex gap-2";
    btnSubmit.parentNode.insertBefore(wrapper, btnSubmit);
    btnSubmit.id = "btnGuardarHorario";
    wrapper.appendChild(btnSubmit);

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.id = "btnCancelarEdicionHorario";
    btnCancel.onclick = cancelarEdicionHorario;
    btnCancel.className =
      "hidden bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs transition";
    btnCancel.innerText = "Cancelar";
    wrapper.appendChild(btnCancel);
  }

  // Escuchar cambios en parcela, hora o duración para limpiar alertas previas
  ["selParcelaRiego", "txtHoraInicio", "txtDuracion"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", ocultarAlertaConflicto);
  });
}

function horaATotalMinutos(horaStr) {
  const [hh, mm] = String(horaStr || "00:00")
    .split(":")
    .map(Number);
  return (isNaN(hh) ? 0 : hh) * 60 + (isNaN(mm) ? 0 : mm);
}

function minutosAHoraStr(totalMin) {
  const norm = ((totalMin % 1440) + 1440) % 1440;
  const hh = String(Math.floor(norm / 60)).padStart(2, "0");
  const mm = String(norm % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function detectarConflictoLocal(
  idParcela,
  diasSeleccionados,
  horaInicio,
  duracionMin,
  excluirId = null,
) {
  const iniNuevo = horaATotalMinutos(horaInicio);
  const finNuevo = iniNuevo + duracionMin;

  for (const h of programacionesCache) {
    if (String(h.id_parcela) !== String(idParcela)) continue;
    if (excluirId && String(h.id) === String(excluirId)) continue;

    const diasExistentes = String(h.dias_semana || "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    const diasComunes = diasSeleccionados.filter((d) =>
      diasExistentes.includes(d),
    );
    if (diasComunes.length === 0) continue;

    const iniExist = horaATotalMinutos(h.hora_inicio);
    const finExist = iniExist + (parseInt(h.duracion_minutos, 10) || 15);

    if (iniNuevo < finExist && iniExist < finNuevo) {
      return {
        id: h.id,
        diasComunes,
        horaInicio: h.hora_inicio,
        horaFin: minutosAHoraStr(finExist),
        duracion: h.duracion_minutos,
      };
    }
  }

  return null;
}

function mostrarAlertaConflicto(mensaje, idTurnoConflicto = null) {
  const box = document.getElementById("alertaConflictoHorario");
  if (!box) {
    alert(mensaje);
    return;
  }

  box.innerHTML = `
    <p class="font-semibold leading-relaxed">⚠️ ${mensaje}</p>
    ${
      idTurnoConflicto
        ? `<button type="button" onclick="editarHorario(${idTurnoConflicto})" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] px-3 py-1.5 rounded-lg transition">
            ✏️ Editar ese turno existente en lugar de duplicarlo
          </button>`
        : ""
    }
  `;
  box.classList.remove("hidden");
}

function ocultarAlertaConflicto() {
  const box = document.getElementById("alertaConflictoHorario");
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
}

function toggleDia(btn) {
  ocultarAlertaConflicto();
  const activo = btn.classList.contains("bg-sky-600");
  if (activo) {
    btn.className =
      "dia-pill bg-slate-900 text-slate-400 font-bold text-xs py-2 rounded-lg border border-slate-700 transition";
  } else {
    btn.className =
      "dia-pill bg-sky-600 text-white font-bold text-xs py-2 rounded-lg border border-sky-400/40 transition";
  }
}

function editarHorario(id) {
  const turno = programacionesCache.find((h) => String(h.id) === String(id));
  if (!turno) return;

  ocultarAlertaConflicto();
  editHorarioId = turno.id;

  const sel = document.getElementById("selParcelaRiego");
  if (sel) sel.value = String(turno.id_parcela);

  const diasActivos = String(turno.dias_semana || "")
    .split(",")
    .map((d) => d.trim());

  document.querySelectorAll(".dia-pill").forEach((btn) => {
    const marcado = diasActivos.includes(btn.dataset.dia);
    btn.className = marcado
      ? "dia-pill bg-sky-600 text-white font-bold text-xs py-2 rounded-lg border border-sky-400/40 transition"
      : "dia-pill bg-slate-900 text-slate-400 font-bold text-xs py-2 rounded-lg border border-slate-700 transition";
  });

  const inputHora = document.getElementById("txtHoraInicio");
  const inputDur = document.getElementById("txtDuracion");
  if (inputHora) inputHora.value = turno.hora_inicio;
  if (inputDur) inputDur.value = turno.duracion_minutos;

  const btnGuardar = document.getElementById("btnGuardarHorario");
  const btnCancel = document.getElementById("btnCancelarEdicionHorario");

  if (btnGuardar) {
    btnGuardar.innerText = "💾 Actualizar Turno #" + turno.id;
    btnGuardar.className =
      "flex-grow bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg";
  }
  if (btnCancel) {
    btnCancel.classList.remove("hidden");
  }

  if (sel) {
    sel.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function cancelarEdicionHorario() {
  editHorarioId = null;
  ocultarAlertaConflicto();

  const btnGuardar = document.getElementById("btnGuardarHorario");
  const btnCancel = document.getElementById("btnCancelarEdicionHorario");

  if (btnGuardar) {
    btnGuardar.innerText = "+ Guardar Horario";
    btnGuardar.className =
      "w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg";
  }
  if (btnCancel) {
    btnCancel.classList.add("hidden");
  }
}

async function crearProgramacion(e) {
  e.preventDefault();
  ocultarAlertaConflicto();

  const id_parcela = document.getElementById("selParcelaRiego").value;
  const hora_inicio = document.getElementById("txtHoraInicio").value;
  const duracion_minutos =
    parseInt(document.getElementById("txtDuracion").value, 10) || 15;

  if (!id_parcela) {
    alert("Selecciona una parcela primero.");
    return;
  }

  const diasSeleccionados = Array.from(
    document.querySelectorAll(".dia-pill.bg-sky-600"),
  ).map((b) => b.dataset.dia);

  if (diasSeleccionados.length === 0) {
    alert("Selecciona al menos un día de la semana.");
    return;
  }

  // Validación inmediata contra turnos repetidos o superpuestos en la misma parcela
  const conflicto = detectarConflictoLocal(
    id_parcela,
    diasSeleccionados,
    hora_inicio,
    duracion_minutos,
    editHorarioId,
  );

  if (conflicto) {
    mostrarAlertaConflicto(
      `Horario repetido o superpuesto en ${conflicto.diasComunes.join(", ")}: ya existe un turno de ${conflicto.horaInicio} a ${conflicto.horaFin} (${conflicto.duracion} min) en este campo.`,
      conflicto.id,
    );
    return;
  }

  const esEdicion = editHorarioId !== null;
  const url = esEdicion
    ? "/api/riego/programaciones/" + editHorarioId
    : "/api/riego/programaciones";
  const metodo = esEdicion ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_parcela,
        dias_semana: diasSeleccionados.join(","),
        hora_inicio,
        duracion_minutos,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      cancelarEdicionHorario();
      await cargarProgramaciones();
      await cargarHistorialRiego();
    } else {
      mostrarAlertaConflicto(
        data.error || "No se pudo guardar el horario",
        data.conflicto?.id_conflicto || null,
      );
    }
  } catch (err) {
    alert("Error de conexión con el servidor.");
  }
}

async function cargarProgramaciones() {
  const tbody = document.getElementById("tablaProgramaciones");
  const contador = document.getElementById("contadorHorarios");

  try {
    const res = await fetch(
      "/api/riego/programaciones?id_usuario=" + usuarioSesion.id,
    );
    const lista = await res.json();
    programacionesCache = Array.isArray(lista) ? lista : [];

    contador.innerText =
      programacionesCache.length +
      (programacionesCache.length === 1 ? " horario" : " horarios");

    if (programacionesCache.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">' +
        "Aún no hay horarios programados. Configura uno en el formulario izquierdo." +
        "</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    programacionesCache.forEach((h) => {
      const diasBadges = h.dias_semana
        .split(",")
        .map(
          (d) =>
            '<span class="inline-block bg-slate-900 border border-slate-700 text-sky-400 font-bold text-[10px] px-1.5 py-0.5 rounded">' +
            d +
            "</span>",
        )
        .join(" ");

      const iniMin = horaATotalMinutos(h.hora_inicio);
      const horaFin = minutosAHoraStr(
        iniMin + (parseInt(h.duracion_minutos, 10) || 15),
      );

      const activo = Number(h.activo) === 1;
      const clsFila = activo ? "" : "opacity-50";
      const clsEstado = activo
        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
        : "bg-slate-700 text-slate-400 border-slate-600";

      tbody.innerHTML +=
        '<tr class="hover:bg-slate-750/60 transition ' +
        clsFila +
        '">' +
        '<td class="p-3 font-semibold text-slate-200">' +
        h.parcela +
        "</td>" +
        '<td class="p-3 space-x-1">' +
        diasBadges +
        "</td>" +
        '<td class="p-3 font-mono font-bold text-amber-400 whitespace-nowrap">' +
        h.hora_inicio +
        ' <span class="text-slate-500 font-normal">→ ' +
        horaFin +
        "</span></td>" +
        '<td class="p-3 text-xs text-slate-300">' +
        h.duracion_minutos +
        " min</td>" +
        '<td class="p-3">' +
        '<button onclick="alternarEstadoHorario(' +
        h.id +
        ", " +
        (activo ? 0 : 1) +
        ')" class="text-xs font-bold px-2.5 py-1 rounded-full border transition ' +
        clsEstado +
        '">' +
        (activo ? "● Activo" : "○ Pausado") +
        "</button></td>" +
        '<td class="p-3 text-right space-x-1.5 whitespace-nowrap">' +
        '<button onclick="editarHorario(' +
        h.id +
        ')" title="Editar horario" class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-semibold transition">✏️</button>' +
        '<button onclick="eliminarHorario(' +
        h.id +
        ')" title="Eliminar horario" class="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-lg text-xs font-semibold transition">🗑️</button>' +
        "</td></tr>";
    });
  } catch (err) {
    console.error("Error cargando programaciones:", err);
  }
}

async function alternarEstadoHorario(id, nuevoEstado) {
  if (nuevoEstado === 1) {
    const turno = programacionesCache.find((h) => String(h.id) === String(id));
    if (turno) {
      const dias = String(turno.dias_semana || "")
        .split(",")
        .map((d) => d.trim());
      const conflicto = detectarConflictoLocal(
        turno.id_parcela,
        dias,
        turno.hora_inicio,
        parseInt(turno.duracion_minutos, 10) || 15,
        id,
      );
      if (conflicto) {
        alert(
          `⚠️ No se puede activar porque se cruza en ${conflicto.diasComunes.join(", ")} con otro turno (${conflicto.horaInicio} a ${conflicto.horaFin}). Edita o elimina uno de ellos primero.`,
        );
        return;
      }
    }
  }

  try {
    await fetch("/api/riego/programaciones/" + id + "/estado", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: nuevoEstado }),
    });
    cargarProgramaciones();
  } catch (err) {
    console.error(err);
  }
}

async function eliminarHorario(id) {
  if (!confirm("¿Eliminar esta programación de riego?")) return;
  try {
    await fetch("/api/riego/programaciones/" + id, { method: "DELETE" });
    if (String(editHorarioId) === String(id)) {
      cancelarEdicionHorario();
    }
    cargarProgramaciones();
  } catch (err) {
    console.error(err);
  }
}

// =========================================================================
// 3. HISTORIAL DE EVENTOS Y MÉTRICAS DE AHORRO HÍDRICO
// =========================================================================

function extraerM3Ahorrados(detalle) {
  if (!detalle) return 0.67;
  const match = String(detalle).match(/Ahorro est\.:\s*([\d.]+)\s*m³/i);
  if (match && !isNaN(parseFloat(match[1]))) {
    return parseFloat(match[1]);
  }
  return 0.67;
}

async function cargarHistorialRiego() {
  const tbody = document.getElementById("tablaHistorialRiego");
  const kpiEvitados = document.getElementById("kpiRiegosEvitados");
  const kpiAgua = document.getElementById("kpiAguaAhorrada");
  const kpiLitros = document.getElementById("kpiLitrosAhorrados");

  try {
    const res = await fetch(
      "/api/riego/historial?id_usuario=" + usuarioSesion.id,
    );
    const eventos = await res.json();

    const pospuestos = (eventos || []).filter(
      (ev) => ev.accion === "RIEGO POSPUESTO",
    );
    const totalM3 = pospuestos.reduce(
      (acc, ev) => acc + extraerM3Ahorrados(ev.detalle),
      0,
    );
    const totalLitros = Math.round(totalM3 * 1000);

    if (kpiEvitados) {
      kpiEvitados.innerText =
        pospuestos.length + (pospuestos.length === 1 ? " turno" : " turnos");
    }
    if (kpiAgua) {
      kpiAgua.innerText = totalM3.toFixed(2) + " m³";
    }
    if (kpiLitros) {
      kpiLitros.innerText = `Equivalente a ${totalLitros.toLocaleString()} litros conservados`;
    }

    if (!eventos || eventos.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="p-6 text-center text-slate-500 text-xs">' +
        "Sin eventos de riego registrados todavía." +
        "</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    eventos.forEach((ev) => {
      let colorAccion = "text-emerald-400";
      if (ev.accion === "RIEGO POSPUESTO") colorAccion = "text-sky-400";
      else if (ev.accion === "RIEGO DETENIDO") colorAccion = "text-slate-400";

      tbody.innerHTML +=
        '<tr class="hover:bg-slate-750/60 transition">' +
        '<td class="p-3 font-semibold text-slate-200">' +
        ev.parcela +
        "</td>" +
        '<td class="p-3"><span class="bg-slate-900 border border-slate-700 text-sky-400 text-[11px] font-mono px-2 py-0.5 rounded">' +
        ev.origen +
        "</span></td>" +
        '<td class="p-3 font-bold text-xs ' +
        colorAccion +
        '">' +
        ev.accion +
        "</td>" +
        '<td class="p-3 text-xs text-slate-300">' +
        (ev.detalle || "--") +
        "</td>" +
        '<td class="p-3 text-xs text-slate-400 font-mono">' +
        new Date(ev.fecha_registro).toLocaleString() +
        "</td></tr>";
    });
  } catch (err) {
    console.error("Error cargando historial:", err);
  }
}
