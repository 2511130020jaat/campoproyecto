let parcelasRiego = [];

document.addEventListener("DOMContentLoaded", () => {
  cargarTodoRiego();
});

async function cargarTodoRiego() {
  await cargarSectoresRiego();
  await cargarProgramaciones();
  await cargarHistorialRiego();
}

async function cargarSectoresRiego() {
  const grid = document.getElementById("gridSectoresRiego");
  const select = document.getElementById("selParcelaRiego");
  const lblResumen = document.getElementById("lblResumenValvulas");

  try {
    const res = await fetch("/api/parcelas?id_usuario=" + usuarioSesion.id);
    parcelasRiego = await res.json();

    select.innerHTML = '<option value="">Selecciona una parcela...</option>';

    if (!parcelasRiego || parcelasRiego.length === 0) {
      lblResumen.innerText = "0 sectores registrados";
      grid.innerHTML =
        '<div class="col-span-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">' +
        '<p class="text-sm text-slate-400">No tienes parcelas registradas.</p>' +
        '<a href="/parcelas.html" class="inline-block mt-3 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-lg">' +
        "➕ Ir al Gestor de Parcelas</a></div>";
      return;
    }

    const forzadosOn = parcelasRiego.filter(
      (p) => p.modo_riego === "MANUAL_ON",
    ).length;
    lblResumen.innerText =
      parcelasRiego.length + " sectores • " + forzadosOn + " en riego forzado";

    grid.innerHTML = "";

    parcelasRiego.forEach((p) => {
      const nombre = p.parcela || p.nombre || "Parcela #" + p.id;
      const cultivo = p.cultivo || "General";
      const mac = p.codigo_mac || "Sin ESP32";
      const modo = p.modo_riego || "AUTO";
      const umbral =
        p.umbral_humedad !== null ? parseFloat(p.umbral_humedad) : 35;

      select.innerHTML +=
        '<option value="' +
        p.id +
        '">#' +
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
          '<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-bold animate-pulse">💧 VÁLVULA ABIERTA</span>';
        bordeCard = "border-emerald-500/50";
      } else if (modo === "MANUAL_OFF") {
        badgeEstado =
          '<span class="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-bold">🛑 BLOQUEADO</span>';
        bordeCard = "border-rose-500/40";
      } else {
        badgeEstado =
          '<span class="bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[11px] px-2.5 py-0.5 rounded-full font-bold">🤖 AUTOMÁTICO</span>';
      }

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
        '<span class="text-xs font-mono text-sky-400 font-bold">#' +
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
        '<div class="bg-slate-900/80 p-3 rounded-xl border border-slate-700/80 flex items-center justify-between gap-2">' +
        '<span class="text-xs text-slate-400">Umbral disparo AUTO:</span>' +
        '<div class="flex items-center gap-1.5">' +
        '<input type="number" id="umbralSector_' +
        p.id +
        '" value="' +
        umbral +
        '" min="5" max="90" class="w-16 bg-slate-800 border border-slate-600 text-amber-400 font-bold text-center text-xs rounded-lg py-1 px-1.5 focus:outline-none focus:border-sky-500" />' +
        '<span class="text-xs text-slate-500 font-bold">%</span>' +
        '<button onclick="actualizarUmbralSector(' +
        p.id +
        ')" class="bg-slate-700 hover:bg-sky-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg transition">OK</button>' +
        "</div>" +
        "</div>" +
        '<div class="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700 text-xs">' +
        '<button onclick="cambiarModoSector(' +
        p.id +
        ", 'AUTO')\" class=\"py-2 rounded-lg font-bold transition " +
        clsAuto +
        '">🤖 AUTO</button>' +
        '<button onclick="cambiarModoSector(' +
        p.id +
        ", 'MANUAL_ON')\" class=\"py-2 rounded-lg font-bold transition " +
        clsOn +
        '">💧 ON</button>' +
        '<button onclick="cambiarModoSector(' +
        p.id +
        ", 'MANUAL_OFF')\" class=\"py-2 rounded-lg font-bold transition " +
        clsOff +
        '">🛑 OFF</button>' +
        "</div>" +
        "</div>";
    });
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
      alert("✅ Umbral actualizado a " + umbral + "%");
      cargarSectoresRiego();
    }
  } catch (err) {
    alert("Error al actualizar umbral.");
  }
}

async function apagarTodoEmergencia() {
  if (!parcelasRiego || parcelasRiego.length === 0) return;

  const confirmar = confirm(
    "¿Deseas detener inmediatamente el riego en TODOS tus sectores (modo MANUAL_OFF)?",
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

function toggleDia(btn) {
  const activo = btn.classList.contains("bg-sky-600");
  if (activo) {
    btn.className =
      "dia-pill bg-slate-900 text-slate-400 font-bold text-xs py-2 rounded-lg border border-slate-700 transition";
  } else {
    btn.className =
      "dia-pill bg-sky-600 text-white font-bold text-xs py-2 rounded-lg border border-sky-400/40 transition";
  }
}

async function crearProgramacion(e) {
  e.preventDefault();

  const id_parcela = document.getElementById("selParcelaRiego").value;
  const hora_inicio = document.getElementById("txtHoraInicio").value;
  const duracion_minutos = document.getElementById("txtDuracion").value;

  const diasSeleccionados = Array.from(
    document.querySelectorAll(".dia-pill.bg-sky-600"),
  ).map((b) => b.dataset.dia);

  if (diasSeleccionados.length === 0) {
    alert("Selecciona al menos un día de la semana.");
    return;
  }

  try {
    const res = await fetch("/api/riego/programaciones", {
      method: "POST",
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
      await cargarProgramaciones();
      await cargarHistorialRiego();
    } else {
      alert("❌ " + (data.error || "No se pudo guardar el horario"));
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

    contador.innerText =
      lista.length + (lista.length === 1 ? " horario" : " horarios");

    if (!lista || lista.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">' +
        "Aún no hay horarios programados. Configura uno en el formulario izquierdo." +
        "</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    lista.forEach((h) => {
      const diasBadges = h.dias_semana
        .split(",")
        .map(
          (d) =>
            '<span class="inline-block bg-slate-900 border border-slate-700 text-sky-400 font-bold text-[10px] px-1.5 py-0.5 rounded">' +
            d +
            "</span>",
        )
        .join(" ");

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
        '<td class="p-3 font-mono font-bold text-amber-400">' +
        h.hora_inicio +
        "</td>" +
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
        '<td class="p-3 text-right">' +
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
    cargarProgramaciones();
  } catch (err) {
    console.error(err);
  }
}

async function cargarHistorialRiego() {
  const tbody = document.getElementById("tablaHistorialRiego");

  try {
    const res = await fetch(
      "/api/riego/historial?id_usuario=" + usuarioSesion.id,
    );
    const eventos = await res.json();

    if (!eventos || eventos.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="p-6 text-center text-slate-500 text-xs">' +
        "Sin eventos de riego registrados todavía." +
        "</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    eventos.forEach((ev) => {
      tbody.innerHTML +=
        '<tr class="hover:bg-slate-750/60 transition">' +
        '<td class="p-3 font-semibold text-slate-200">' +
        ev.parcela +
        "</td>" +
        '<td class="p-3"><span class="bg-slate-900 border border-slate-700 text-sky-400 text-[11px] font-mono px-2 py-0.5 rounded">' +
        ev.origen +
        "</span></td>" +
        '<td class="p-3 font-bold text-xs text-emerald-400">' +
        ev.accion +
        "</td>" +
        '<td class="p-3 text-xs text-slate-400">' +
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
