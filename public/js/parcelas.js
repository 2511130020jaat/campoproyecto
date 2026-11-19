let mapaParcelas = null;
let marcadorSeleccion = null;
let capaSatelite = null;
let capaCalle = null;
let esSatelite = true;
let capaPoligonosGuardados = null;
let parcelasCache = [];

// Variables para el contorno poligonal activo
let modoMapa = "POLIGONO";
let verticesActivos = [];
let marcadoresVertices = [];
let poligonoActivoLayer = null;
let areaCalculadaM2 = 0;

const COORD_DEFECTO = [-12.6581, -76.6321];

document.addEventListener("DOMContentLoaded", () => {
  inicializarMapa();
  cargarParcelasUsuario();
});

function inicializarMapa() {
  const contenedorMapa = document.getElementById("mapaParcelas");
  if (!contenedorMapa) return;

  mapaParcelas = L.map("mapaParcelas", {
    maxZoom: 22,
  }).setView(COORD_DEFECTO, 15);

  // Google Satélite Híbrido: máxima resolución en zonas rurales y sin error de tiles vacíos
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

  capaSatelite.addTo(mapaParcelas);
  capaPoligonosGuardados = L.layerGroup().addTo(mapaParcelas);

  mapaParcelas.on("click", (e) => {
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
  if (!mapaParcelas) return;

  if (esSatelite) {
    mapaParcelas.removeLayer(capaSatelite);
    capaCalle.addTo(mapaParcelas);
    btn.innerText = "🛰️ Vista Satélite";
    esSatelite = false;
  } else {
    mapaParcelas.removeLayer(capaCalle);
    capaSatelite.addTo(mapaParcelas);
    btn.innerText = "🗺️ Vista Calles";
    esSatelite = true;
  }
}

function cambiarModoMapa(nuevoModo) {
  modoMapa = nuevoModo;
  const btnPol = document.getElementById("btnModoPoligono");
  const btnPto = document.getElementById("btnModoPunto");

  if (nuevoModo === "POLIGONO") {
    btnPol.className =
      "bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow";
    btnPto.className =
      "bg-slate-900 text-slate-300 hover:text-white border border-slate-700 text-xs px-3 py-1.5 rounded-lg font-semibold transition";
  } else {
    btnPto.className =
      "bg-sky-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow";
    btnPol.className =
      "bg-slate-900 text-slate-300 hover:text-white border border-slate-700 text-xs px-3 py-1.5 rounded-lg font-semibold transition";
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
    return { areaM2: 0, perimetroM: 0, centroide: null };
  }

  let sumLat = 0;
  let sumLng = 0;
  puntos.forEach((p) => {
    sumLat += p[0];
    sumLng += p[1];
  });
  const lat0 = sumLat / puntos.length;
  const lng0 = sumLng / puntos.length;

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
    return { areaM2: 0, perimetroM: perim, centroide: [lat0, lng0] };
  }

  const mPorLat = 111132.92;
  const mPorLng = 111412.84 * Math.cos((lat0 * Math.PI) / 180);

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
    centroide: [lat0, lng0],
  };
}

function redibujarPoligonoActivo() {
  // Limpiar marcadores de vértices previos
  marcadoresVertices.forEach((m) => mapaParcelas.removeLayer(m));
  marcadoresVertices = [];

  if (poligonoActivoLayer) {
    mapaParcelas.removeLayer(poligonoActivoLayer);
    poligonoActivoLayer = null;
  }

  // Dibujar vértices arrastrables
  verticesActivos.forEach((coord, idx) => {
    const iconoVertice = L.divIcon({
      className: "",
      html: '<div style="width:14px;height:14px;background:#10b981;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 6px #000;cursor:move;"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const mk = L.marker(coord, { draggable: true, icon: iconoVertice }).addTo(
      mapaParcelas,
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
    mapaParcelas.removeLayer(poligonoActivoLayer);
    poligonoActivoLayer = null;
  }

  if (verticesActivos.length >= 2) {
    poligonoActivoLayer =
      verticesActivos.length >= 3
        ? L.polygon(verticesActivos, {
            color: "#10b981",
            weight: 3,
            fillColor: "#10b981",
            fillOpacity: 0.28,
          }).addTo(mapaParcelas)
        : L.polyline(verticesActivos, {
            color: "#10b981",
            weight: 3,
            dashArray: "6,6",
          }).addTo(mapaParcelas);
  }

  const metricas = calcularMetricasPoligono(verticesActivos);
  areaCalculadaM2 = metricas.areaM2;

  document.getElementById("badgeVertices").innerText =
    verticesActivos.length +
    (verticesActivos.length === 1 ? " vértice" : " vértices");

  const ha = (metricas.areaM2 / 10000).toFixed(2);
  document.getElementById("lblAreaParcela").innerText =
    Math.round(metricas.areaM2) + " m² (" + ha + " ha)";
  document.getElementById("lblPerimetroParcela").innerText =
    metricas.perimetroM.toFixed(1) + " m";

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

  if (!mapaParcelas) return;

  if (!marcadorSeleccion) {
    marcadorSeleccion = L.marker([lat, lng], { draggable: true })
      .addTo(mapaParcelas)
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
    mapaParcelas.setView([lat, lng], 17);
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

function parsearPoligonoGuardado(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

async function cargarParcelasUsuario() {
  const contenedor = document.getElementById("listaParcelas");
  const contador = document.getElementById("contadorParcelas");
  if (!contenedor) return;

  try {
    const res = await fetch("/api/parcelas?id_usuario=" + usuarioSesion.id);
    const parcelas = await res.json();
    parcelasCache = Array.isArray(parcelas) ? parcelas : [];

    if (contador) {
      contador.innerText =
        parcelasCache.length +
        (parcelasCache.length === 1 ? " sector" : " sectores");
    }

    if (capaPoligonosGuardados) {
      capaPoligonosGuardados.clearLayers();
    }

    if (parcelasCache.length === 0) {
      contenedor.innerHTML =
        '<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">' +
        "No tienes parcelas registradas aún. Marca los bordes de tu terreno en el mapa y guárdalo." +
        "</td></tr>";
      return;
    }

    const todosLosPuntos = [];
    contenedor.innerHTML = "";

    parcelasCache.forEach((p) => {
      const nombre = p.parcela || p.nombre || "Sector";
      const cultivo = p.cultivo || "General";
      const mac = p.codigo_mac || "--";
      const poligono = parsearPoligonoGuardado(p.poligono_json);
      const tieneCoords =
        p.latitud !== null &&
        p.longitud !== null &&
        p.latitud !== "" &&
        p.longitud !== "";

      if (poligono.length >= 3 && capaPoligonosGuardados) {
        poligono.forEach((pt) => todosLosPuntos.push(pt));
        L.polygon(poligono, {
          color: "#38bdf8",
          weight: 2.5,
          fillColor: "#0ea5e9",
          fillOpacity: 0.22,
        })
          .addTo(capaPoligonosGuardados)
          .bindPopup(
            "<b>#" +
              p.id +
              " " +
              nombre +
              "</b><br>Cultivo: " +
              cultivo +
              "<br>Área: " +
              Math.round(p.area_m2 || 0) +
              " m²",
          );
      } else if (tieneCoords && capaPoligonosGuardados) {
        const lat = parseFloat(p.latitud);
        const lng = parseFloat(p.longitud);
        todosLosPuntos.push([lat, lng]);
        L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: "#10b981",
          color: "#ffffff",
          weight: 2,
          fillOpacity: 0.9,
        })
          .addTo(capaPoligonosGuardados)
          .bindPopup(
            "<b>#" + p.id + " " + nombre + "</b><br>Cultivo: " + cultivo,
          );
      }

      const areaTexto =
        p.area_m2 && parseFloat(p.area_m2) > 0
          ? Math.round(p.area_m2) + " m²"
          : '<span class="text-slate-500">Sin contorno</span>';

      contenedor.innerHTML +=
        '<tr class="hover:bg-slate-750/60 transition">' +
        '<td class="p-3 font-mono text-sky-400 font-bold">#' +
        p.id +
        "</td>" +
        '<td class="p-3 font-semibold text-slate-200">' +
        nombre +
        "</td>" +
        '<td class="p-3 text-slate-400">' +
        cultivo +
        "</td>" +
        '<td class="p-3 text-xs font-mono text-emerald-400">' +
        areaTexto +
        "</td>" +
        '<td class="p-3 font-mono text-xs text-amber-400">' +
        mac +
        "</td>" +
        '<td class="p-3 text-right space-x-1.5 whitespace-nowrap">' +
        '<button type="button" onclick="editarParcela(' +
        p.id +
        ')" class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-semibold transition">✏️ Editar</button>' +
        '<button type="button" onclick="eliminarParcela(' +
        p.id +
        ", '" +
        nombre.replace(/'/g, "\\'") +
        '\')" class="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-lg text-xs font-semibold transition">🗑️</button>' +
        "</td></tr>";
    });

    if (
      todosLosPuntos.length > 0 &&
      mapaParcelas &&
      !document.getElementById("editParcelaId").value
    ) {
      mapaParcelas.fitBounds(todosLosPuntos, {
        padding: [40, 40],
        maxZoom: 18,
      });
    }
  } catch (err) {
    console.error("Error al cargar parcelas:", err);
  }
}

function editarParcela(id) {
  const p = parcelasCache.find((item) => item.id == id);
  if (!p) return;

  document.getElementById("editParcelaId").value = p.id;
  document.getElementById("txtNombreParcela").value =
    p.parcela || p.nombre || "";
  document.getElementById("txtCultivo").value = p.cultivo || "";
  document.getElementById("txtLatitud").value = p.latitud ?? "";
  document.getElementById("txtLongitud").value = p.longitud ?? "";
  document.getElementById("txtMacESP32").value = p.codigo_mac || "";

  document.getElementById("formTitulo").innerHTML =
    "<span>✏️</span> Editando Parcela #" + p.id;
  const btnGuardar = document.getElementById("btnGuardarParcela");
  btnGuardar.innerText = "Actualizar Parcela";
  btnGuardar.className =
    "flex-grow bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg";

  document.getElementById("btnCancelarEdicion").classList.remove("hidden");

  const poligono = parsearPoligonoGuardado(p.poligono_json);
  if (poligono.length >= 3) {
    verticesActivos = poligono;
    cambiarModoMapa("POLIGONO");
    redibujarPoligonoActivo();
    mapaParcelas.fitBounds(poligono, { padding: [50, 50], maxZoom: 19 });
  } else {
    limpiarPoligonoActual();
    if (
      p.latitud !== null &&
      p.longitud !== null &&
      p.latitud !== "" &&
      p.longitud !== ""
    ) {
      fijarPuntoSeleccionado(
        parseFloat(p.latitud),
        parseFloat(p.longitud),
        true,
      );
    }
  }
}

function cancelarEdicion() {
  document.getElementById("editParcelaId").value = "";
  document.getElementById("formNuevaParcela").reset();
  limpiarPoligonoActual();

  document.getElementById("formTitulo").innerHTML =
    "<span>➕</span> Registrar Nuevo Campo";
  const btnGuardar = document.getElementById("btnGuardarParcela");
  btnGuardar.innerText = "Guardar Parcela";
  btnGuardar.className =
    "flex-grow bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg";

  document.getElementById("btnCancelarEdicion").classList.add("hidden");

  if (marcadorSeleccion && mapaParcelas) {
    mapaParcelas.removeLayer(marcadorSeleccion);
    marcadorSeleccion = null;
  }
}

async function guardarParcela(e) {
  e.preventDefault();

  const idEdicion = document.getElementById("editParcelaId").value;
  const nombre = document.getElementById("txtNombreParcela").value;
  const cultivo = document.getElementById("txtCultivo").value;
  const latitud = document.getElementById("txtLatitud").value;
  const longitud = document.getElementById("txtLongitud").value;
  const codigo_mac = document.getElementById("txtMacESP32").value;

  const esEdicion = idEdicion !== "";
  const url = esEdicion ? "/api/parcelas/" + idEdicion : "/api/parcelas";
  const metodo = esEdicion ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_usuario: usuarioSesion.id,
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
          ? "✅ Parcela y contorno actualizados"
          : "✅ Parcela y contorno guardados",
      );
      cancelarEdicion();
      cargarParcelasUsuario();
    } else {
      alert("❌ Error: " + (data.error || "No se pudo guardar la parcela"));
    }
  } catch (err) {
    alert("Error de conexión con el servidor");
  }
}

async function eliminarParcela(id, nombre) {
  const confirmar = confirm(
    '¿Estás seguro de eliminar la parcela "' +
      nombre +
      '" (#' +
      id +
      ")?\n\nSe eliminarán también sus dispositivos y lecturas telemétricas asociadas.",
  );
  if (!confirmar) return;

  try {
    const res = await fetch("/api/parcelas/" + id, { method: "DELETE" });
    if (res.ok) {
      if (document.getElementById("editParcelaId").value == id) {
        cancelarEdicion();
      }
      cargarParcelasUsuario();
    }
  } catch (err) {
    alert("Error de conexión al eliminar la parcela");
  }
}
