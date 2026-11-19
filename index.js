const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const https = require("https");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.static("public"));

// Configuración de la conexión a MySQL
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Error conectando a MySQL:", err.message);
  } else {
    console.log("✅ Conectado exitosamente a la base de datos");
    connection.release();
  }
});

// Ruta de estado
app.get("/api/estado", (req, res) => {
  res.json({ mensaje: "¡Servidor Agroclimático en línea!" });
});

// ==========================================
// RUTAS DE AUTENTICACIÓN (LOGIN Y REGISTRO)
// ==========================================

// Registro de nuevos usuarios
app.post("/api/auth/registro", (req, res) => {
  const { nombre, correo, clave_hash, rol } = req.body;

  if (!nombre || !correo || !clave_hash) {
    return res
      .status(400)
      .json({ error: "Nombre, correo y contraseña son obligatorios." });
  }

  const userRol = rol || "CLIENTE";
  const query =
    "INSERT INTO usuarios (nombre, correo, clave_hash, rol) VALUES (?, ?, ?, ?)";

  db.query(query, [nombre, correo, clave_hash, userRol], (err, result) => {
    if (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res
          .status(400)
          .json({ error: "El correo electrónico ya está registrado." });
      }
      console.error("❌ Error al registrar usuario:", err);
      return res
        .status(500)
        .json({ error: "Error interno al registrar el usuario." });
    }
    res.status(201).json({
      mensaje: "Usuario registrado con éxito",
      id_usuario: result.insertId,
    });
  });
});

// Inicio de sesión
app.post("/api/auth/login", (req, res) => {
  const { correo, clave_hash } = req.body;

  if (!correo || !clave_hash) {
    return res.status(400).json({ error: "Ingresa tu correo y contraseña." });
  }

  const query =
    "SELECT id, nombre, correo, rol FROM usuarios WHERE correo = ? AND clave_hash = ?";

  db.query(query, [correo, clave_hash], (err, resultados) => {
    if (err) {
      console.error("❌ Error en login:", err);
      return res
        .status(500)
        .json({ error: "Error interno durante la autenticación." });
    }

    if (resultados.length === 0) {
      return res.status(401).json({ error: "Credenciales incorrectas." });
    }

    const usuario = resultados[0];
    res.json({ mensaje: "Inicio de sesión exitoso", usuario });
  });
});

// ==========================================
// GESTIÓN DE PARCELAS Y CONFIGURACIÓN
// ==========================================
/////////////
// POST /api/parcelas - Crear nueva parcela y vincular dispositivo ESP32
// POST /api/parcelas - Crear nueva parcela, cultivo y vincular dispositivo ESP32
// POST /api/parcelas - Crear nueva parcela, cultivo y vincular dispositivo ESP32
// POST /api/parcelas - Crear nueva parcela con contorno poligonal, cultivo y ESP32
app.post("/api/parcelas", (req, res) => {
  const {
    id_usuario,
    nombre,
    cultivo,
    latitud,
    longitud,
    codigo_mac,
    poligono,
    area_m2,
  } = req.body;

  if (!id_usuario || !nombre) {
    return res.status(400).json({
      error: "El nombre de la parcela y el ID de usuario son obligatorios.",
    });
  }

  const latVal =
    latitud !== "" && latitud !== null && latitud !== undefined
      ? parseFloat(latitud)
      : null;
  const lonVal =
    longitud !== "" && longitud !== null && longitud !== undefined
      ? parseFloat(longitud)
      : null;
  const poligonoStr =
    Array.isArray(poligono) && poligono.length >= 3
      ? JSON.stringify(poligono)
      : null;
  const areaVal = area_m2 ? parseFloat(area_m2) : null;

  const queryParcela = `
    INSERT INTO parcelas (id_usuario, nombre, latitud, longitud, poligono_json, area_m2) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    queryParcela,
    [id_usuario, nombre.trim(), latVal, lonVal, poligonoStr, areaVal],
    (err, resParcela) => {
      if (err) {
        console.error("❌ Error al guardar la parcela:", err);
        return res.status(500).json({
          error:
            "Error al guardar la parcela: " + (err.sqlMessage || err.message),
        });
      }

      const id_parcela = resParcela.insertId;

      const registrarCultivoYDispositivo = (callbackFinal) => {
        if (cultivo && cultivo.trim() !== "") {
          db.query(
            "INSERT INTO cultivos (nombre, id_parcela) VALUES (?, ?)",
            [cultivo.trim(), id_parcela],
            (errCult, resCult) => {
              if (errCult) {
                return db.query(
                  "INSERT INTO cultivos (nombre) VALUES (?)",
                  [cultivo.trim()],
                  (errCult2, resCult2) => {
                    const id_cultivo =
                      !errCult2 && resCult2 ? resCult2.insertId : null;
                    callbackFinal(id_cultivo);
                  },
                );
              }
              callbackFinal(resCult.insertId);
            },
          );
        } else {
          callbackFinal(null);
        }
      };

      registrarCultivoYDispositivo((id_cultivo) => {
        if (codigo_mac && codigo_mac.trim() !== "") {
          const queryDisp = `
            INSERT INTO dispositivos (codigo_mac, id_parcela, id_cultivo, estado) 
            VALUES (?, ?, ?, 'activo') 
            ON DUPLICATE KEY UPDATE 
              id_parcela = VALUES(id_parcela),
              id_cultivo = COALESCE(VALUES(id_cultivo), id_cultivo),
              estado = 'activo'
          `;

          db.query(
            queryDisp,
            [codigo_mac.trim(), id_parcela, id_cultivo],
            (errDisp) => {
              if (errDisp) {
                console.error(
                  "⚠️ Parcela creada, pero error vinculando ESP32:",
                  errDisp,
                );
              }
              return res.status(201).json({
                ok: true,
                id_parcela,
                mensaje: "Parcela registrada con éxito.",
              });
            },
          );
        } else {
          return res.status(201).json({
            ok: true,
            id_parcela,
            mensaje: "Parcela registrada con éxito.",
          });
        }
      });
    },
  );
});

// GET /api/parcelas - Obtener lista de parcelas del usuario con su contorno
app.get("/api/parcelas", (req, res) => {
  const { id_usuario } = req.query;
  let filtroSQL = "";
  const params = [];

  if (id_usuario) {
    filtroSQL = " WHERE p.id_usuario = ? ";
    params.push(id_usuario);
  }

  const query = `
    SELECT 
      p.id, 
      p.nombre AS parcela, 
      p.umbral_humedad,
      p.modo_riego,
      p.latitud,
      p.longitud,
      p.poligono_json,
      p.area_m2,
      COALESCE(MAX(c.nombre), MAX(c2.nombre)) AS cultivo,
      MAX(d.codigo_mac) AS codigo_mac
    FROM parcelas p
    LEFT JOIN cultivos c ON c.id_parcela = p.id
    LEFT JOIN dispositivos d ON d.id_parcela = p.id
    LEFT JOIN cultivos c2 ON c2.id = d.id_cultivo
    ${filtroSQL}
    GROUP BY p.id, p.nombre, p.umbral_humedad, p.modo_riego, p.latitud, p.longitud, p.poligono_json, p.area_m2
    ORDER BY p.id ASC
  `;

  db.query(query, params, (err, resultados) => {
    if (err) {
      console.error("❌ Error al consultar parcelas:", err);
      return res.status(500).json({ error: "Error al consultar parcelas" });
    }
    res.json(resultados);
  });
});

// PUT /api/parcelas/:id - Editar parcela, contorno, cultivo y dispositivo MAC
app.put("/api/parcelas/:id", (req, res) => {
  const { id } = req.params;
  const { nombre, cultivo, latitud, longitud, codigo_mac, poligono, area_m2 } =
    req.body;

  if (!nombre || nombre.trim() === "") {
    return res
      .status(400)
      .json({ error: "El nombre de la parcela es obligatorio." });
  }

  const latVal =
    latitud !== "" && latitud !== null && latitud !== undefined
      ? parseFloat(latitud)
      : null;
  const lonVal =
    longitud !== "" && longitud !== null && longitud !== undefined
      ? parseFloat(longitud)
      : null;
  const poligonoStr =
    Array.isArray(poligono) && poligono.length >= 3
      ? JSON.stringify(poligono)
      : null;
  const areaVal = area_m2 ? parseFloat(area_m2) : null;

  const queryUpdate = `
    UPDATE parcelas 
    SET nombre = ?, latitud = ?, longitud = ?, poligono_json = ?, area_m2 = ?
    WHERE id = ?
  `;

  db.query(
    queryUpdate,
    [nombre.trim(), latVal, lonVal, poligonoStr, areaVal, id],
    (err) => {
      if (err) {
        console.error("❌ Error al actualizar parcela:", err);
        return res
          .status(500)
          .json({ error: "Error al actualizar parcela: " + err.sqlMessage });
      }

      const actualizarCultivo = (callback) => {
        if (!cultivo || cultivo.trim() === "") return callback(null);

        db.query(
          "SELECT id FROM cultivos WHERE id_parcela = ? LIMIT 1",
          [id],
          (errSel, rows) => {
            if (!errSel && rows.length > 0) {
              const idCultivo = rows[0].id;
              db.query(
                "UPDATE cultivos SET nombre = ? WHERE id = ?",
                [cultivo.trim(), idCultivo],
                () => {
                  callback(idCultivo);
                },
              );
            } else {
              db.query(
                "INSERT INTO cultivos (nombre, id_parcela) VALUES (?, ?)",
                [cultivo.trim(), id],
                (errIns, resIns) => {
                  callback(!errIns && resIns ? resIns.insertId : null);
                },
              );
            }
          },
        );
      };

      actualizarCultivo((id_cultivo) => {
        if (codigo_mac && codigo_mac.trim() !== "") {
          const queryDisp = `
            INSERT INTO dispositivos (codigo_mac, id_parcela, id_cultivo, estado)
            VALUES (?, ?, ?, 'activo')
            ON DUPLICATE KEY UPDATE
              id_parcela = VALUES(id_parcela),
              id_cultivo = COALESCE(VALUES(id_cultivo), id_cultivo),
              estado = 'activo'
          `;
          db.query(
            queryDisp,
            [codigo_mac.trim(), id, id_cultivo],
            (errDisp) => {
              if (errDisp) {
                console.warn(
                  "⚠️ Parcela actualizada, pero error con MAC:",
                  errDisp.message,
                );
              }
              return res.json({
                ok: true,
                mensaje: "Parcela actualizada correctamente.",
              });
            },
          );
        } else {
          return res.json({
            ok: true,
            mensaje: "Parcela actualizada correctamente.",
          });
        }
      });
    },
  );
});
//////////////
// =========================================================================
// CONVERSIÓN GPS -> PLANO MÉTRICO (X, Y) PARA ROBLOX STUDIO Y AGROOPTIMA IO
// =========================================================================
function gpsPoligonoAMetros(poligonoJson) {
  try {
    const coords =
      typeof poligonoJson === "string"
        ? JSON.parse(poligonoJson)
        : poligonoJson;
    if (!Array.isArray(coords) || coords.length < 3) return null;

    const lat0 = Number(coords[0][0]);
    const lng0 = Number(coords[0][1]);
    const mPorLat = 111132.92;
    const mPorLng = 111412.84 * Math.cos((lat0 * Math.PI) / 180);

    const crudos = coords.map((p) => ({
      x: (Number(p[1]) - lng0) * mPorLng,
      y: (Number(p[0]) - lat0) * mPorLat,
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

    const ancho = Math.max(5, +(maxX - minX).toFixed(1));
    const largo = Math.max(5, +(maxY - minY).toFixed(1));

    // Misma proyección exacta que proyectarContornoAMetros() en diseno2d.js
    const vertices = crudos.map((pt) => ({
      x: +(pt.x - minX).toFixed(2),
      y: +(maxY - pt.y).toFixed(2),
    }));

    return { ancho, largo, vertices };
  } catch (e) {
    return null;
  }
}

/////////////
app.get("/api/parcelas/:id/topologia", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.promise().query(
      `SELECT p.*, d.ancho_metros, d.alto_metros, d.nodos_json
       FROM parcelas p
       LEFT JOIN disenos_2d d ON d.id_parcela = p.id
       WHERE p.id = ?`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Parcela no encontrada" });
    }

    const p = rows[0];
    const geo = gpsPoligonoAMetros(p.poligono_json);
    const ladoDefault = p.area_m2
      ? Math.max(15, +Math.sqrt(Number(p.area_m2)).toFixed(1))
      : 50;

    const anchoFinal =
      Number(p.ancho_metros) || (geo ? geo.ancho : ladoDefault);
    const largoFinal = Number(p.alto_metros) || (geo ? geo.largo : ladoDefault);

    let poligonoM = [
      { x: 0, y: 0 },
      { x: anchoFinal, y: 0 },
      { x: anchoFinal, y: largoFinal },
      { x: 0, y: largoFinal },
    ];

    if (geo && geo.vertices.length >= 3) {
      const escalaX = geo.ancho > 0 ? anchoFinal / geo.ancho : 1;
      const escalaY = geo.largo > 0 ? largoFinal / geo.largo : 1;
      poligonoM = geo.vertices.map((v) => ({
        x: +(v.x * escalaX).toFixed(2),
        y: +(v.y * escalaY).toFixed(2),
      }));
    }

    let nodosDiseno = [];
    if (p.nodos_json) {
      try {
        nodosDiseno =
          typeof p.nodos_json === "string"
            ? JSON.parse(p.nodos_json)
            : p.nodos_json;
      } catch (e) {
        nodosDiseno = [];
      }
    }

    const [colsInfo] = await db
      .promise()
      .query("SHOW COLUMNS FROM dispositivos");
    const colsDisp = new Set(colsInfo.map((c) => c.Field));

    const [dispRows] = await db
      .promise()
      .query("SELECT * FROM dispositivos WHERE id_parcela = ?", [id]);
    const dispActivos = dispRows.filter(
      (d) => !d.estado || d.estado === "ACTIVO",
    );

    const nodos = [];
    if (Array.isArray(nodosDiseno) && nodosDiseno.length > 0) {
      for (const n of nodosDiseno) {
        const mac = String(n.id || n.codigo_mac || "").trim();
        if (!mac) continue;
        const subtipo = String(n.tipo || "esp32").toLowerCase();
        const tipoRol = subtipo === "bomba" ? "GATEWAY_POZO" : "SENSOR";
        const nombreNodo = String(n.nombre || n.etiqueta || mac);
        const posX = Number(n.x) || 0;
        const posY = Number(n.y) || 0;

        if (colsDisp.has("codigo_mac") && colsDisp.has("id_parcela")) {
          const [existe] = await db
            .promise()
            .query("SELECT * FROM dispositivos WHERE codigo_mac = ? LIMIT 1", [
              mac,
            ]);

          const campos = { id_parcela: id };
          if (colsDisp.has("id_usuario") && p.id_usuario)
            campos.id_usuario = p.id_usuario;
          if (colsDisp.has("nombre")) campos.nombre = nombreNodo;
          if (colsDisp.has("tipo")) campos.tipo = tipoRol;
          if (colsDisp.has("tipo_dispositivo"))
            campos.tipo_dispositivo = subtipo;
          if (colsDisp.has("pos_x")) campos.pos_x = posX;
          if (colsDisp.has("pos_y")) campos.pos_y = posY;
          if (colsDisp.has("estado")) campos.estado = "ACTIVO";

          if (existe.length > 0) {
            const sets = Object.keys(campos)
              .map((k) => `${k} = ?`)
              .join(", ");
            await db
              .promise()
              .query(`UPDATE dispositivos SET ${sets} WHERE codigo_mac = ?`, [
                ...Object.values(campos),
                mac,
              ]);
          } else {
            campos.codigo_mac = mac;
            for (const c of colsInfo) {
              if (
                !(c.Field in campos) &&
                c.Null === "NO" &&
                c.Default === null &&
                !String(c.Extra || "").includes("auto_increment")
              ) {
                campos[c.Field] = /^(int|decimal|float|double|tinyint)/i.test(
                  c.Type,
                )
                  ? 0
                  : "";
              }
            }
            const keys = Object.keys(campos);
            const placeholders = keys.map(() => "?").join(", ");
            await db
              .promise()
              .query(
                `INSERT INTO dispositivos (${keys.join(", ")}) VALUES (${placeholders})`,
                Object.values(campos),
              );
          }
        }

        nodos.push({
          id: mac,
          nombre: nombreNodo,
          tipo: tipoRol,
          subtipo,
          x: posX,
          y: posY,
        });
      }
    } else if (dispActivos.length > 0) {
      const total = dispActivos.length;
      dispActivos.forEach((d, idx) => {
        const tienePos = Number(d.pos_x) !== 0 || Number(d.pos_y) !== 0;
        const autoX = +(((idx + 1) / (total + 1)) * anchoFinal).toFixed(2);
        const autoY = +(largoFinal * 0.5).toFixed(2);
        const tipoDetectado =
          d.tipo === "GATEWAY_POZO" ? "GATEWAY_POZO" : "SENSOR";
        nodos.push({
          id: d.codigo_mac,
          nombre: d.nombre || d.codigo_mac,
          tipo: tipoDetectado,
          subtipo: tipoDetectado === "GATEWAY_POZO" ? "bomba" : "esp32",
          x:
            tienePos && !Number.isNaN(Number(d.pos_x))
              ? Number(d.pos_x)
              : autoX,
          y:
            tienePos && !Number.isNaN(Number(d.pos_y))
              ? Number(d.pos_y)
              : autoY,
        });
      });
    }

    res.json({
      parcela_id: p.id,
      nombre: p.nombre || p.parcela || `Parcela #${p.id}`,
      cultivo: p.cultivo || p.tipo_cultivo || p.variedad || "General",
      umbral_humedad: Number(p.umbral_humedad || 50),
      modo_riego: p.modo_riego || "AUTOMATICO",
      dimensiones_m: {
        ancho: anchoFinal,
        largo: largoFinal,
        area_m2: p.area_m2
          ? Number(p.area_m2)
          : +(anchoFinal * largoFinal).toFixed(1),
      },
      poligono_m: poligonoM,
      nodos,
    });
  } catch (err) {
    console.error("Error obteniendo topología unificada:", err);
    res.status(500).json({ error: "Error obteniendo topología de parcela" });
  }
});
///////////

// PUT /api/parcelas/:id/topologia -> Permite a AgroOptima IO guardar ajustes 3D (X, Y, Z)
app.put("/api/parcelas/:id/topologia", (req, res) => {
  const { id } = req.params;
  const { nodos } = req.body;

  if (!Array.isArray(nodos)) {
    return res.status(400).json({ error: "Se requiere el arreglo 'nodos'" });
  }

  nodos.forEach((n) => {
    if (n.id) {
      db.query(
        "UPDATE dispositivos SET pos_x = ?, pos_y = ?, pos_z = ?, tipo_nodo = COALESCE(?, tipo_nodo) WHERE codigo_mac = ? AND id_parcela = ?",
        [n.x || 0, n.y || 0, n.z || 0, n.tipo || null, n.id, id],
      );
    }
  });

  res.json({ ok: true, mensaje: "Topología 3D sincronizada con ASIR." });
});

// GET /api/alertas -> Consultar alertas climáticas recientes para el dashboard
app.get("/api/alertas", (req, res) => {
  const query = `
    SELECT a.*, p.nombre AS parcela
    FROM alertas_climaticas a
    JOIN parcelas p ON a.id_parcela = p.id
    ORDER BY a.id DESC
    LIMIT 20
  `;
  db.query(query, (err, rows) => {
    if (err)
      return res.status(500).json({ error: "Error consultando alertas" });
    res.json(rows);
  });
});

//////////////
// ==========================================
// PROGRAMACIÓN HORARIA E HISTORIAL DE RIEGO
// ==========================================

// Listar programaciones de riego del usuario
app.get("/api/riego/programaciones", (req, res) => {
  const { id_usuario } = req.query;
  let filtro = "";
  const params = [];

  if (id_usuario) {
    filtro = " WHERE p.id_usuario = ? ";
    params.push(id_usuario);
  }

  const query = `
    SELECT 
      pr.id,
      pr.id_parcela,
      p.nombre AS parcela,
      pr.dias_semana,
      TIME_FORMAT(pr.hora_inicio, '%H:%i') AS hora_inicio,
      pr.duracion_minutos,
      pr.activo
    FROM programaciones_riego pr
    JOIN parcelas p ON pr.id_parcela = p.id
    ${filtro}
    ORDER BY pr.hora_inicio ASC
  `;

  db.query(query, params, (err, resultados) => {
    if (err) {
      console.error("❌ Error al consultar programaciones:", err);
      return res.status(500).json({ error: "Error al cargar programaciones" });
    }
    res.json(resultados);
  });
});

// Crear nueva programación horaria
app.post("/api/riego/programaciones", (req, res) => {
  const { id_parcela, dias_semana, hora_inicio, duracion_minutos } = req.body;

  if (!id_parcela || !dias_semana || !hora_inicio) {
    return res.status(400).json({
      error: "Parcela, días de la semana y hora de inicio son obligatorios.",
    });
  }

  const duracion = parseInt(duracion_minutos, 10) || 15;
  const query = `
    INSERT INTO programaciones_riego (id_parcela, dias_semana, hora_inicio, duracion_minutos, activo)
    VALUES (?, ?, ?, ?, 1)
  `;

  db.query(
    query,
    [id_parcela, dias_semana, hora_inicio, duracion],
    (err, result) => {
      if (err) {
        console.error("❌ Error al guardar programación:", err);
        return res
          .status(500)
          .json({ error: "Error al guardar programación de riego" });
      }

      db.query(
        "INSERT INTO historial_riego (id_parcela, origen, accion, detalle) VALUES (?, 'CRONOGRAMA', 'HORARIO CREADO', ?)",
        [
          id_parcela,
          `Días: ${dias_semana} | Inicio: ${hora_inicio} (${duracion} min)`,
        ],
        () => {},
      );

      res.status(201).json({
        ok: true,
        id: result.insertId,
        mensaje: "Programación de riego registrada.",
      });
    },
  );
});

// Activar / Pausar una programación horaria
app.put("/api/riego/programaciones/:id/estado", (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  db.query(
    "UPDATE programaciones_riego SET activo = ? WHERE id = ?",
    [activo ? 1 : 0, id],
    (err) => {
      if (err) {
        return res
          .status(500)
          .json({ error: "Error al actualizar estado del horario" });
      }
      res.json({ ok: true });
    },
  );
});

// Eliminar una programación horaria
app.delete("/api/riego/programaciones/:id", (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM programaciones_riego WHERE id = ?", [id], (err) => {
    if (err) {
      return res.status(500).json({ error: "Error al eliminar programación" });
    }
    res.json({ ok: true });
  });
});

// Obtener historial de eventos de riego
app.get("/api/riego/historial", (req, res) => {
  const { id_usuario } = req.query;
  let filtro = "";
  const params = [];

  if (id_usuario) {
    filtro = " WHERE p.id_usuario = ? ";
    params.push(id_usuario);
  }

  const query = `
    SELECT 
      h.id,
      h.id_parcela,
      p.nombre AS parcela,
      h.origen,
      h.accion,
      h.detalle,
      h.fecha_registro
    FROM historial_riego h
    JOIN parcelas p ON h.id_parcela = p.id
    ${filtro}
    ORDER BY h.fecha_registro DESC
    LIMIT 25
  `;

  db.query(query, params, (err, resultados) => {
    if (err) {
      console.error("❌ Error al consultar historial de riego:", err);
      return res.status(500).json({ error: "Error al consultar historial" });
    }
    res.json(resultados);
  });
});
//////////

// DELETE /api/parcelas/:id - Eliminar parcela y sus registros vinculados
app.delete("/api/parcelas/:id", (req, res) => {
  const { id } = req.params;

  const qDelTelemetria = `
    DELETE FROM datos_telemetria 
    WHERE id_dispositivo IN (SELECT id FROM dispositivos WHERE id_parcela = ?)
  `;

  db.query(qDelTelemetria, [id], (errTel) => {
    if (errTel) {
      console.error("❌ Error limpiando telemetría:", errTel);
      return res
        .status(500)
        .json({ error: "Error al eliminar telemetría asociada." });
    }

    db.query(
      "DELETE FROM dispositivos WHERE id_parcela = ?",
      [id],
      (errDisp) => {
        if (errDisp) {
          console.error("❌ Error eliminando dispositivos:", errDisp);
          return res
            .status(500)
            .json({ error: "Error al eliminar dispositivos asociados." });
        }

        db.query("DELETE FROM cultivos WHERE id_parcela = ?", [id], () => {
          db.query("DELETE FROM parcelas WHERE id = ?", [id], (errParc) => {
            if (errParc) {
              console.error("❌ Error eliminando parcela:", errParc);
              return res.status(500).json({
                error: "No se pudo eliminar la parcela: " + errParc.sqlMessage,
              });
            }
            res.json({ ok: true, mensaje: "Parcela eliminada correctamente." });
          });
        });
      },
    );
  });
});
/////////

// Obtener lista de parcelas (opcionalmente filtradas por id_usuario)
app.get("/api/parcelas", (req, res) => {
  const { id_usuario } = req.query;
  let filtroSQL = "";
  const params = [];

  if (id_usuario) {
    filtroSQL = " WHERE p.id_usuario = ? ";
    params.push(id_usuario);
  }

  const query = `
    SELECT 
      p.id, 
      p.nombre AS parcela, 
      p.umbral_humedad,
      p.modo_riego,
      p.latitud,
      p.longitud,
      c.nombre AS cultivo,
      d.codigo_mac
    FROM parcelas p
    LEFT JOIN cultivos c ON c.id_parcela = p.id OR c.id = p.id
    LEFT JOIN dispositivos d ON d.id_parcela = p.id
    ${filtroSQL}
  `;

  db.query(query, params, (err, resultados) => {
    if (err) {
      console.error("❌ Error al consultar parcelas:", err);
      return res.status(500).json({ error: "Error al consultar parcelas" });
    }
    res.json(resultados);
  });
});

// Actualizar umbral de humedad atómico por parcela
app.put("/api/parcelas/:id/umbral", (req, res) => {
  const { id } = req.params;
  const { umbral } = req.body;

  if (umbral === undefined || isNaN(umbral) || umbral < 0 || umbral > 100) {
    return res.status(400).json({
      error: "El umbral debe ser un porcentaje válido entre 0 y 100.",
    });
  }

  const query = "UPDATE parcelas SET umbral_humedad = ? WHERE id = ?";
  db.query(query, [umbral, id], (err) => {
    if (err) {
      console.error("❌ Error al actualizar umbral:", err);
      return res
        .status(500)
        .json({ error: "Error interno al actualizar el umbral" });
    }
    res.json({
      mensaje: "Umbral actualizado exitosamente",
      id_parcela: id,
      umbral,
    });
  });
});

// Actualizar modo de riego (AUTO | MANUAL_ON | MANUAL_OFF) por parcela
app.put("/api/parcelas/:id/modo", (req, res) => {
  const { id } = req.params;
  const { modo } = req.body;

  if (!modo || !["AUTO", "MANUAL_ON", "MANUAL_OFF"].includes(modo)) {
    return res.status(400).json({ error: "Modo de riego no válido: " + modo });
  }

  const query = "UPDATE parcelas SET modo_riego = ? WHERE id = ?";
  db.query(query, [modo, id], (err, resultado) => {
    if (err) {
      console.error("❌ Error al actualizar modo de riego:", err);
      return res.status(500).json({ error: "Error de BD: " + err.message });
    }
    res.json({ mensaje: "Modo de riego actualizado", id_parcela: id, modo });
  });
});

// ==========================================
// RECEPCIÓN Y CONSULTA DE TELEMETRÍA
// ==========================================

// Recepción de telemetría del ESP32 y decisión de riego (AUTO vs MANUAL)
// ==========================================
// RECEPCIÓN Y CONSULTA DE TELEMETRÍA
// ==========================================

// Recepción de telemetría del ESP32 y decisión de riego (AUTO + HORARIOS vs MANUAL)
// Recepción de telemetría del ESP32 y decisión de riego (AUTO + HORARIOS vs MANUAL)
app.post("/api/telemetria", (req, res) => {
  const { codigo_mac, temperatura, humedad_suelo, humedad_aire, lluvia_mm } =
    req.body;

  if (!codigo_mac || temperatura === undefined || humedad_suelo === undefined) {
    return res.status(400).json({
      error: "Faltan datos obligatorios (MAC, temperatura o humedad)",
    });
  }

  const tempVal = parseFloat(temperatura);
  const humSueloVal = parseFloat(humedad_suelo);
  const humAireVal =
    humedad_aire !== undefined && humedad_aire !== null
      ? parseFloat(humedad_aire)
      : null;
  const lluviaVal =
    lluvia_mm !== undefined && lluvia_mm !== null ? parseFloat(lluvia_mm) : 0;

  const queryBuscar = `
    SELECT d.id AS id_dispositivo, p.id AS id_parcela, p.umbral_humedad, p.modo_riego 
    FROM dispositivos d
    LEFT JOIN parcelas p ON d.id_parcela = p.id
    WHERE d.codigo_mac = ? AND d.estado = 'activo'
  `;

  db.query(queryBuscar, [codigo_mac], (err, resultados) => {
    if (err) {
      console.error("❌ Error buscando el dispositivo:", err);
      return res.status(500).json({ error: "Error interno del servidor" });
    }

    if (resultados.length === 0) {
      return res
        .status(403)
        .json({ error: "Dispositivo no autorizado o inactivo" });
    }

    const { id_dispositivo, id_parcela, umbral_humedad, modo_riego } =
      resultados[0];
    const umbralBase =
      umbral_humedad !== null ? parseFloat(umbral_humedad) : 35.0;
    const modoParcela = modo_riego || "AUTO";

    // Función auxiliar para guardar alerta sin duplicar cada 10s (cooldown 5 min)
    const registrarAlertaElNino = (tipo, severidad, mensaje) => {
      if (!id_parcela) return;
      const qCheck = `
        SELECT id FROM alertas_climaticas
        WHERE id_parcela = ? AND tipo_alerta = ?
          AND fecha_registro >= NOW() - INTERVAL 5 MINUTE
        LIMIT 1
      `;
      db.query(qCheck, [id_parcela, tipo], (errC, rowsC) => {
        if (!errC && rowsC.length === 0) {
          db.query(
            "INSERT INTO alertas_climaticas (id_parcela, codigo_mac, tipo_alerta, severidad, mensaje) VALUES (?, ?, ?, ?, ?)",
            [id_parcela, codigo_mac, tipo, severidad, mensaje],
          );
        }
      });
    };

    const queryInsertar = `
      INSERT INTO datos_telemetria (id_dispositivo, temperatura, humedad_suelo, humedad_aire) 
      VALUES (?, ?, ?, ?)
    `;

    db.query(
      queryInsertar,
      [id_dispositivo, tempVal, humSueloVal, humAireVal],
      (errInsert) => {
        if (errInsert) {
          console.error("❌ Error guardando telemetría:", errInsert);
          return res
            .status(500)
            .json({ error: "Error al registrar datos en BD" });
        }

        // Evaluación adaptativa Fenómeno del Niño
        let alertaActiva = null;
        let umbralEfectivo = umbralBase;

        // Regla A: Riesgo fúngico / bochorno extremo
        if (tempVal >= 28.0 && humAireVal !== null && humAireVal >= 85.0) {
          alertaActiva = {
            tipo: "RIESGO_FUNGICO",
            severidad: "ALTA",
            mensaje: `Bochorno (${tempVal}°C y ${humAireVal}% HR): alto riesgo de hongos foliares.`,
          };
          registrarAlertaElNino(
            alertaActiva.tipo,
            alertaActiva.severidad,
            alertaActiva.mensaje,
          );
        }

        // Regla B: Ola de calor (+10% umbral por evapotranspiración)
        if (tempVal >= 32.0) {
          umbralEfectivo = Math.min(75.0, umbralBase + 10.0);
          alertaActiva = {
            tipo: "OLA_DE_CALOR",
            severidad: "ALTA",
            mensaje: `Ola de calor (${tempVal}°C): umbral de riego elevado dinámicamente a ${umbralEfectivo}%.`,
          };
          registrarAlertaElNino(
            alertaActiva.tipo,
            alertaActiva.severidad,
            alertaActiva.mensaje,
          );
        }

        // Regla C: Saturación hídrica / Lluvia torrencial (bloqueo preventivo)
        const saturadoOLluvia = humSueloVal >= 85.0 || lluviaVal >= 15.0;
        if (saturadoOLluvia) {
          alertaActiva = {
            tipo: "SATURACION_LLUVIA",
            severidad: "CRITICA",
            mensaje: `Saturación hídrica (${humSueloVal}% suelo / ${lluviaVal} mm lluvia): riego bloqueado para evitar asfixia radicular.`,
          };
          registrarAlertaElNino(
            alertaActiva.tipo,
            alertaActiva.severidad,
            alertaActiva.mensaje,
          );
        }

        const responderTelemetria = (activarRiego, motivo) => {
          const enviarRespuesta = () => {
            res.status(201).json({
              mensaje: "Datos de clima registrados correctamente",
              modo_aplicado: modoParcela,
              umbral_base: umbralBase,
              umbral_aplicado: umbralEfectivo,
              riego_activado: activarRiego,
              motivo_riego: motivo,
              alerta_climatica: alertaActiva,
            });
          };

          if (!id_parcela || modoParcela !== "AUTO") {
            return enviarRespuesta();
          }

          const qUltimo = `
            SELECT accion 
            FROM historial_riego 
            WHERE id_parcela = ? AND accion IN ('RIEGO ACTIVADO', 'RIEGO DETENIDO') 
            ORDER BY id DESC LIMIT 1
          `;

          db.query(qUltimo, [id_parcela], (errHist, rowsHist) => {
            if (errHist) {
              console.error("⚠️ Error consultando historial_riego:", errHist);
              return enviarRespuesta();
            }

            const estabaRegando =
              rowsHist.length > 0 && rowsHist[0].accion === "RIEGO ACTIVADO";

            if (activarRiego && !estabaRegando) {
              const origen =
                motivo === "CRONOGRAMA_HORARIO" ? "CRONOGRAMA" : "SENSOR_AUTO";
              const detalle =
                motivo === "CRONOGRAMA_HORARIO"
                  ? `Activación por horario programado (Humedad: ${humSueloVal}%)`
                  : `Humedad: ${humSueloVal}% < Umbral dinámico: ${umbralEfectivo}% (${motivo})`;

              db.query(
                "INSERT INTO historial_riego (id_parcela, origen, accion, detalle) VALUES (?, ?, 'RIEGO ACTIVADO', ?)",
                [id_parcela, origen, detalle],
                () => enviarRespuesta(),
              );
            } else if (!activarRiego && estabaRegando) {
              const detalle =
                motivo === "BLOQUEO_SATURACION_LLUVIA"
                  ? `Riego detenido por saturación/lluvia (${humSueloVal}% suelo)`
                  : `Humedad recuperada: ${humSueloVal}% (Umbral: ${umbralEfectivo}%)`;

              db.query(
                "INSERT INTO historial_riego (id_parcela, origen, accion, detalle) VALUES (?, 'SENSOR_AUTO', 'RIEGO DETENIDO', ?)",
                [id_parcela, detalle],
                () => enviarRespuesta(),
              );
            } else {
              return enviarRespuesta();
            }
          });
        };

        if (modoParcela === "MANUAL_ON") {
          return responderTelemetria(true, "MANUAL_ON");
        }
        if (modoParcela === "MANUAL_OFF") {
          return responderTelemetria(false, "MANUAL_OFF");
        }

        // Prioridad máxima en AUTO: bloqueo por saturación o lluvia torrencial
        if (saturadoOLluvia) {
          return responderTelemetria(false, "BLOQUEO_SATURACION_LLUVIA");
        }

        // Revisar cronograma horario
        const qHorario = `
          SELECT pr.dias_semana, TIME_FORMAT(pr.hora_inicio, '%H:%i') AS hora_inicio, pr.duracion_minutos
          FROM programaciones_riego pr
          JOIN dispositivos d ON d.id_parcela = pr.id_parcela
          WHERE d.id = ? AND pr.activo = 1
        `;

        db.query(qHorario, [id_dispositivo], (errHor, horarios) => {
          let enHorario = false;

          if (!errHor && horarios && horarios.length > 0) {
            const ahora = new Date();
            const mapaDias = ["D", "L", "M", "X", "J", "V", "S"];
            const diaHoy = mapaDias[ahora.getDay()];
            const minActuales = ahora.getHours() * 60 + ahora.getMinutes();

            enHorario = horarios.some((h) => {
              const dias = h.dias_semana.split(",");
              if (!dias.includes(diaHoy)) return false;
              const [hh, mm] = h.hora_inicio.split(":").map(Number);
              const inicioMin = hh * 60 + mm;
              return (
                minActuales >= inicioMin &&
                minActuales < inicioMin + h.duracion_minutos
              );
            });
          }

          if (enHorario) {
            return responderTelemetria(true, "CRONOGRAMA_HORARIO");
          }

          const porHumedad = humSueloVal < umbralEfectivo;
          const motivoOptimo =
            porHumedad && umbralEfectivo > umbralBase
              ? "UMBRAL_DINAMICO_CALOR"
              : porHumedad
                ? "UMBRAL_HUMEDAD"
                : "OPTIMO";

          return responderTelemetria(porHumedad, motivoOptimo);
        });
      },
    );
  });
});
///////////
// Consulta de telemetría filtrada
app.get("/api/telemetria", (req, res) => {
  const { parcela_id, codigo_mac } = req.query;
  const condiciones = [];
  const params = [];

  if (parcela_id && parcela_id !== "todas") {
    condiciones.push("p.id = ?");
    params.push(parcela_id);
  }

  if (codigo_mac && codigo_mac !== "todos") {
    condiciones.push("d.codigo_mac = ?");
    params.push(codigo_mac);
  }

  const filtroSQL =
    condiciones.length > 0 ? " WHERE " + condiciones.join(" AND ") : "";

  // Agrupación temporal (ventanas de 5s) + promedio espacial de los nodos activos
  const query = `
    SELECT 
        MAX(t.id) AS id,
        ROUND(AVG(t.temperatura), 1) AS temperatura,
        ROUND(AVG(t.humedad_suelo), 1) AS humedad_suelo,
        ROUND(AVG(t.humedad_aire), 1) AS humedad_aire,
        FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(t.fecha_registro) / 5) * 5) AS fecha_registro,
        CASE 
          WHEN COUNT(DISTINCT d.codigo_mac) = 1 THEN MAX(d.codigo_mac) 
          ELSE 'RED_PARCELA' 
        END AS codigo_mac,
        MAX(c.nombre) AS cultivo,
        MAX(p.id) AS id_parcela,
        MAX(p.nombre) AS parcela
    FROM datos_telemetria t
    JOIN dispositivos d ON t.id_dispositivo = d.id
    LEFT JOIN cultivos c ON d.id_cultivo = c.id
    JOIN parcelas p ON d.id_parcela = p.id
    ${filtroSQL}
    GROUP BY FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(t.fecha_registro) / 5) * 5)
    ORDER BY fecha_registro DESC
    LIMIT 30
  `;

  db.query(query, params, (err, resultados) => {
    if (err) {
      console.error("❌ Error al obtener telemetría:", err);
      return res
        .status(500)
        .json({ error: "Error al consultar la base de datos" });
    }
    res.json(resultados);
  });
});

//////////
// Obtener el diseño 2D y ortofoto guardada de una parcela
app.get("/api/diseno2d/:id_parcela", (req, res) => {
  const { id_parcela } = req.params;

  const query = "SELECT * FROM disenos_2d WHERE id_parcela = ? LIMIT 1";
  db.query(query, [id_parcela], (err, resultados) => {
    if (err) {
      console.error("❌ Error al consultar diseño 2D:", err);
      return res.status(500).json({ error: "Error al cargar el diseño 2D" });
    }

    if (resultados.length === 0) {
      return res.json({ existe: false });
    }

    const fila = resultados[0];
    let nodos = [];
    let ortofoto = null;

    try {
      nodos = JSON.parse(fila.nodos_json || "[]");
    } catch (e) {
      nodos = [];
    }

    try {
      ortofoto = fila.ortofoto_json ? JSON.parse(fila.ortofoto_json) : null;
    } catch (e) {
      ortofoto = null;
    }

    res.json({
      existe: true,
      diseno: {
        id_parcela: fila.id_parcela,
        ancho_metros: parseFloat(fila.ancho_metros),
        alto_metros: parseFloat(fila.alto_metros),
        costo_metro_pvc: parseFloat(fila.costo_metro_pvc),
        alcance_mesh_metros: parseFloat(fila.alcance_mesh_metros),
        nodos,
        ortofoto,
        actualizado_en: fila.actualizado_en,
      },
    });
  });
});

// Guardar o actualizar el diseño 2D y ortofoto de una parcela
app.post("/api/diseno2d/:id_parcela", (req, res) => {
  const { id_parcela } = req.params;
  const {
    ancho_metros,
    alto_metros,
    costo_metro_pvc,
    alcance_mesh_metros,
    nodos,
    ortofoto,
  } = req.body;

  const ancho = parseFloat(ancho_metros) || 100;
  const alto = parseFloat(alto_metros) || 80;
  const costo = parseFloat(costo_metro_pvc) || 4.5;
  const alcance = parseFloat(alcance_mesh_metros) || 50;
  const nodosStr = JSON.stringify(Array.isArray(nodos) ? nodos : []);
  const ortofotoStr =
    ortofoto && ortofoto.imagen ? JSON.stringify(ortofoto) : null;

  const query = `
    INSERT INTO disenos_2d (id_parcela, ancho_metros, alto_metros, costo_metro_pvc, alcance_mesh_metros, nodos_json, ortofoto_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      ancho_metros = VALUES(ancho_metros),
      alto_metros = VALUES(alto_metros),
      costo_metro_pvc = VALUES(costo_metro_pvc),
      alcance_mesh_metros = VALUES(alcance_mesh_metros),
      nodos_json = VALUES(nodos_json),
      ortofoto_json = VALUES(ortofoto_json)
  `;

  db.query(
    query,
    [id_parcela, ancho, alto, costo, alcance, nodosStr, ortofotoStr],
    (err) => {
      if (err) {
        console.error("❌ Error al guardar diseño 2D:", err);
        return res
          .status(500)
          .json({ error: "No se pudo guardar el plano 2D: " + err.sqlMessage });
      }
      res.json({
        ok: true,
        mensaje: "Plano 2D y ortofoto guardados correctamente.",
      });
    },
  );
});
////////
// =========================================================================
// MÓDULO DE ALERTAS AGROCLIMÁTICAS Y NOTICIAS DEL SECTOR (CACHÉ 3 DÍAS)
// =========================================================================

// =========================================================================
// MÓDULO DE ALERTAS AGROCLIMÁTICAS Y NOTICIAS DEL SECTOR (CACHÉ 3 DÍAS)
// =========================================================================

app.get("/", (req, res) => {
  res.redirect("/acceso.html");
});

function obtenerTextoHttps(url, redirecciones = 0) {
  return new Promise((resolve, reject) => {
    if (redirecciones > 4) return reject(new Error("Demasiadas redirecciones"));

    https
      .get(
        url,
        {
          family: 4,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; ASIR-AgroPlatform/1.0)",
            Accept:
              "application/rss+xml, application/xml, application/json, text/xml;q=0.9, */*;q=0.8",
          },
          timeout: 8000,
        },
        (resp) => {
          if (
            resp.statusCode >= 300 &&
            resp.statusCode < 400 &&
            resp.headers.location
          ) {
            return resolve(
              obtenerTextoHttps(resp.headers.location, redirecciones + 1),
            );
          }
          if (resp.statusCode !== 200) {
            return reject(new Error("HTTP " + resp.statusCode));
          }
          let data = "";
          resp.setEncoding("utf8");
          resp.on("data", (chunk) => (data += chunk));
          resp.on("end", () => resolve(data));
        },
      )
      .on("error", reject)
      .on("timeout", function () {
        this.destroy();
        reject(new Error("Timeout de conexión"));
      });
  });
}

function limpiarTextoXml(str) {
  if (!str) return "";
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/\u0026amp;/g, "&")
    .replace(/\u0026lt;/g, "<")
    .replace(/\u0026gt;/g, ">")
    .replace(/\u0026quot;/g, '"')
    .replace(/\u0026#39;/g, "'")
    .replace(/\u0026nbsp;/g, " ")
    .replace(/<[^>]*>?/g, " ")
    .replace(/href\s*=\s*["'][^"']*["']?/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function obtenerImagenesRespaldoAgro() {
  return [
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1560493676-04071c5f467b?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1595841696677-6489ff3f8cd1?auto=format&fit=crop&w=1200&q=80",
  ];
}

function obtenerNoticiasRespaldo() {
  const imgs = obtenerImagenesRespaldoAgro();
  const hoy = new Date().toISOString().split("T")[0];
  return [
    {
      titulo:
        "Riego tecnificado y sensores IoT reducen hasta en 35% el consumo hídrico en cultivos",
      resumen:
        "El monitoreo continuo de humedad en la zona radicular permite activar electroválvulas solo cuando el cultivo lo requiere, evitando estrés hídrico y desperdicio de agua.",
      fuente: "Boletín Técnico ASIR",
      categoria: "Tecnología de Riego",
      fecha: hoy,
      enlace: "https://www.fao.org/land-water/water/water-management/es/",
      imagen: imgs[0],
    },
    {
      titulo:
        "Cómo interpretar la Evapotranspiración (ET0) para programar turnos de riego",
      resumen:
        "Conocer la pérdida diaria de agua por evaporación del suelo y transpiración de las hojas ayuda a ajustar los tiempos de riego según la radiación solar.",
      fuente: "Guía Agroclimática",
      categoria: "Clima y Cultivos",
      fecha: hoy,
      enlace: "https://www.gob.pe/midagri",
      imagen: imgs[1],
    },
    {
      titulo:
        "Prevención de golpes de calor y heladas mediante alertas tempranas en parcela",
      resumen:
        "Mantener una lámina adecuada de humedad en el suelo amortigua cambios bruscos de temperatura y protege la floración y el cuajado de frutos.",
      fuente: "Sanidad Agraria",
      categoria: "Prevención Climática",
      fecha: hoy,
      enlace: "https://www.senamhi.gob.pe/",
      imagen: imgs[2],
    },
    {
      titulo:
        "Agricultura de precisión en pequeños y medianos predios de la costa peruana",
      resumen:
        "La digitalización de parcelas y el uso de estaciones meteorológicas permiten tomar decisiones oportunas frente a variaciones estacionales.",
      fuente: "Actualidad Agraria",
      categoria: "Innovación Agraria",
      fecha: hoy,
      enlace: "https://www.gob.pe/inia",
      imagen: imgs[3],
    },
    {
      titulo:
        "Buenas prácticas de fertirriego y mantenimiento de líneas de goteo",
      resumen:
        "Revisar periódicamente la presión en válvulas y filtros asegura una distribución uniforme del agua en cada sector del campo.",
      fuente: "Gestión Hídrica",
      categoria: "Manejo de Riego",
      fecha: hoy,
      enlace: "https://www.ana.gob.pe/",
      imagen: imgs[4],
    },
    {
      titulo:
        "Tendencias en agroexportación y sostenibilidad hídrica para la campaña agrícola",
      resumen:
        "Los mercados internacionales valoran cada vez más la trazabilidad del uso eficiente del agua mediante registros digitales.",
      fuente: "AgroNegocios",
      categoria: "Mercado Agrícola",
      fecha: hoy,
      enlace: "https://www.gob.pe/midagri",
      imagen: imgs[5],
    },
    {
      titulo:
        "Optimización de redes hidráulicas y telemetría inalámbrica en campo abierto",
      resumen:
        "Distribuir válvulas y nodos sensores de forma estratégica disminuye pérdidas de carga y mejora la cobertura de señal en toda la parcela.",
      fuente: "Ingeniería Agrícola",
      categoria: "Infraestructura",
      fecha: hoy,
      enlace: "https://www.gob.pe/midagri",
      imagen: imgs[6],
    },
  ];
}

async function descargarNoticiasRssAgro() {
  const feeds = [
    {
      url: "https://news.google.com/rss/search?q=agricultura+riego+clima+Peru&hl=es-419&gl=PE&ceid=PE:es-419",
      categoria: "Agro y Clima",
    },
    {
      url: "https://news.google.com/rss/search?q=cultivos+agroexportacion+tecnologia+agricola&hl=es-419&gl=PE&ceid=PE:es-419",
      categoria: "Innovación Agraria",
    },
    {
      url: "https://news.google.com/rss/search?q=riego+tecnificado+suelo+agricultura&hl=es-419&gl=PE&ceid=PE:es-419",
      categoria: "Gestión Hídrica",
    },
  ];

  const imgs = obtenerImagenesRespaldoAgro();
  const noticias = [];
  const titulosVistos = new Set();

  for (const feed of feeds) {
    try {
      const xml = await obtenerTextoHttps(feed.url);
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

      for (const itemXml of items.slice(0, 4)) {
        const tituloRaw = (itemXml.match(/<title>([\s\S]*?)<\/title>/) ||
          [])[1];
        const linkRaw = (itemXml.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
        const descRaw = (itemXml.match(
          /<description>([\s\S]*?)<\/description>/,
        ) || [])[1];
        const pubDateRaw = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ||
          [])[1];
        const sourceRaw = (itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/) ||
          [])[1];

        const titulo = limpiarTextoXml(tituloRaw).replace(/\s+-\s+[^-]+$/, "");
        if (!titulo || titulosVistos.has(titulo.toLowerCase())) continue;
        titulosVistos.add(titulo.toLowerCase());

        const enlace = (linkRaw || "")
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
          .trim();
        let fuente = limpiarTextoXml(sourceRaw) || "Actualidad Agraria";
        fuente = fuente.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

        let resumen = limpiarTextoXml(descRaw);
        if (
          !resumen ||
          resumen.length < 30 ||
          resumen.includes(titulo.slice(0, 25))
        ) {
          resumen =
            "Nota informativa de " +
            fuente +
            " sobre el desarrollo del sector agropecuario, gestión del agua y condiciones climáticas para los cultivos.";
        }

        let fechaFmt = new Date().toISOString().split("T")[0];
        if (pubDateRaw) {
          const d = new Date(pubDateRaw);
          if (!isNaN(d.getTime())) fechaFmt = d.toISOString().split("T")[0];
        }

        if (titulo && enlace) {
          noticias.push({
            titulo,
            resumen:
              resumen.slice(0, 185) + (resumen.length > 185 ? "..." : ""),
            fuente,
            categoria: feed.categoria,
            fecha: fechaFmt,
            enlace,
            imagen: imgs[noticias.length % imgs.length],
          });
        }
      }
    } catch (e) {
      console.warn("⚠️ No se pudo leer feed RSS:", e.message);
    }
  }

  // Completar siempre hasta mínimo 7 noticias (4 carrusel + 3 tarjetas completas abajo)
  const respaldo = obtenerNoticiasRespaldo();
  for (const item of respaldo) {
    if (noticias.length >= 7) break;
    if (!titulosVistos.has(item.titulo.toLowerCase())) {
      titulosVistos.add(item.titulo.toLowerCase());
      noticias.push({
        ...item,
        imagen: imgs[noticias.length % imgs.length],
      });
    }
  }

  return noticias.slice(0, 10);
}

// GET /api/noticias-agro (se renueva automáticamente cada 3 días = 72 horas)
app.get("/api/noticias-agro", (req, res) => {
  const forzar = req.query.forzar === "1";

  const queryCache = `
    SELECT 
      noticias_json, 
      actualizado_en,
      TIMESTAMPDIFF(HOUR, actualizado_en, NOW()) AS horas_transcurridas
    FROM noticias_agro_cache 
    WHERE id = 1 
    LIMIT 1
  `;

  db.query(queryCache, async (err, rows) => {
    let listaCache = null;
    if (!err && rows.length > 0) {
      try {
        listaCache = JSON.parse(rows[0].noticias_json);
      } catch (e) {}
    }

    const jsonSucio =
      !err &&
      rows.length > 0 &&
      (rows[0].noticias_json.includes("\u0026lt;a") ||
        rows[0].noticias_json.includes("<a") ||
        rows[0].noticias_json.includes("href="));

    const cacheValido =
      Array.isArray(listaCache) &&
      listaCache.length >= 7 &&
      !jsonSucio &&
      rows[0].horas_transcurridas !== null &&
      rows[0].horas_transcurridas < 72 &&
      !forzar;

    if (cacheValido) {
      return res.json({
        origen: "cache",
        actualizado_en: rows[0].actualizado_en,
        proxima_actualizacion_horas: Math.max(
          1,
          72 - rows[0].horas_transcurridas,
        ),
        noticias: listaCache,
      });
    }

    const noticiasNuevas = await descargarNoticiasRssAgro();
    const jsonStr = JSON.stringify(noticiasNuevas);

    const queryUpsert = `
      INSERT INTO noticias_agro_cache (id, noticias_json, actualizado_en)
      VALUES (1, ?, NOW())
      ON DUPLICATE KEY UPDATE
        noticias_json = VALUES(noticias_json),
        actualizado_en = NOW()
    `;

    db.query(queryUpsert, [jsonStr], (errSave) => {
      if (errSave) {
        console.warn("⚠️ Error guardando caché de noticias:", errSave.message);
      }
      res.json({
        origen: "actualizado",
        actualizado_en: new Date().toISOString(),
        proxima_actualizacion_horas: 72,
        noticias: noticiasNuevas,
      });
    });
  });
});

// GET /api/alertas-agro/:id_usuario - Resumen agroclimático minimalista por parcela
app.get("/api/alertas-agro/:id_usuario", (req, res) => {
  const { id_usuario } = req.params;

  const queryParcelas = `
    SELECT 
      p.id,
      p.nombre AS parcela,
      p.umbral_humedad,
      p.modo_riego,
      p.latitud,
      p.longitud,
      COALESCE(MAX(c.nombre), 'Cultivo General') AS cultivo,
      MAX(d.codigo_mac) AS codigo_mac,
      (
        SELECT t.humedad_suelo
        FROM datos_telemetria t
        JOIN dispositivos d2 ON t.id_dispositivo = d2.id
        WHERE d2.id_parcela = p.id
        ORDER BY t.fecha_registro DESC
        LIMIT 1
      ) AS ultima_humedad_suelo,
      (
        SELECT t.temperatura
        FROM datos_telemetria t
        JOIN dispositivos d2 ON t.id_dispositivo = d2.id
        WHERE d2.id_parcela = p.id
        ORDER BY t.fecha_registro DESC
        LIMIT 1
      ) AS ultima_temp_sensor
    FROM parcelas p
    LEFT JOIN cultivos c ON c.id_parcela = p.id
    LEFT JOIN dispositivos d ON d.id_parcela = p.id
    WHERE p.id_usuario = ?
    GROUP BY p.id, p.nombre, p.umbral_humedad, p.modo_riego, p.latitud, p.longitud
    ORDER BY p.id ASC
  `;

  db.query(queryParcelas, [id_usuario], async (err, parcelas) => {
    if (err) {
      console.error("❌ Error consultando parcelas para alertas:", err);
      return res
        .status(500)
        .json({ error: "Error al analizar alertas agroclimáticas" });
    }

    const resultados = [];

    for (const p of parcelas) {
      let lat =
        p.latitud !== null && p.latitud !== ""
          ? parseFloat(p.latitud)
          : -12.6581;
      let lon =
        p.longitud !== null && p.longitud !== ""
          ? parseFloat(p.longitud)
          : -76.6321;
      if (isNaN(lat) || lat < -90 || lat > 90) lat = -12.6581;
      if (isNaN(lon) || lon < -180 || lon > 180) lon = -76.6321;

      const umbral =
        p.umbral_humedad !== null ? parseFloat(p.umbral_humedad) : 40;
      const humSuelo =
        p.ultima_humedad_suelo !== null
          ? parseFloat(p.ultima_humedad_suelo)
          : null;

      let clima = null;
      try {
        const paramsClima = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          current:
            "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
          daily:
            "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,et0_fao_evapotranspiration",
          timezone: "auto",
          forecast_days: "4",
        });

        const urlClima =
          "https://api.open-meteo.com/v1/forecast?" + paramsClima.toString();

        const rawClima = await obtenerTextoHttps(urlClima);
        clima = JSON.parse(rawClima);
      } catch (e) {
        console.warn("⚠️ Open-Meteo error:", e.message);
      }

      // Estado resumido minimalista
      let estado = "OPTIMO";
      let notaBreve = "Parámetros estables";

      if (humSuelo !== null && humSuelo < umbral) {
        estado = "CRITICO";
        notaBreve = "Humedad baja (" + humSuelo.toFixed(0) + "%)";
      } else if (humSuelo !== null && humSuelo > 85) {
        estado = "ATENCION";
        notaBreve = "Suelo muy húmedo (" + humSuelo.toFixed(0) + "%)";
      } else if (
        clima &&
        clima.daily &&
        Math.max(
          clima.daily.precipitation_probability_max[0] || 0,
          clima.daily.precipitation_probability_max[1] || 0,
        ) >= 60
      ) {
        estado = "ATENCION";
        notaBreve = "Posible lluvia próxima";
      } else if (humSuelo === null) {
        notaBreve = "Esperando telemetría";
      }

      resultados.push({
        id: p.id,
        parcela: p.parcela,
        cultivo: p.cultivo,
        umbral_humedad: umbral,
        humedad_suelo: humSuelo,
        estado,
        notaBreve,
        clima,
      });
    }

    res.json(resultados);
  });
});
////////
////
// =========================================================================
// MÓDULO DE REPORTES Y EXPORTACIÓN (TELEMETRÍA, INGENIERÍA 2D Y RIEGO)
// =========================================================================

function calcularMetrosRedPvc(nodos, anchoMetros, altoMetros) {
  if (!Array.isArray(nodos) || nodos.length < 2) return 0;

  // Detectar si las coordenadas están en metros o en píxeles de lienzo (800x500)
  const maxCoord = nodos.reduce(
    (acc, n) => Math.max(acc, parseFloat(n.x) || 0, parseFloat(n.y) || 0),
    0,
  );
  const enPixeles = maxCoord > Math.max(anchoMetros, altoMetros) * 1.5;

  const puntos = nodos.map((n) => {
    const rawX = parseFloat(n.x) || 0;
    const rawY = parseFloat(n.y) || 0;
    return {
      x: enPixeles ? (rawX / 800) * anchoMetros : rawX,
      y: enPixeles ? (rawY / 500) * altoMetros : rawY,
    };
  });

  // Árbol de recubrimiento mínimo (Prim) para estimar el tendido troncal de tubería
  const visitados = new Set([0]);
  let metrosTotales = 0;

  while (visitados.size < puntos.length) {
    let minDist = Infinity;
    let siguienteIdx = -1;

    for (const i of visitados) {
      for (let j = 0; j < puntos.length; j++) {
        if (visitados.has(j)) continue;
        const dist = Math.hypot(
          puntos[i].x - puntos[j].x,
          puntos[i].y - puntos[j].y,
        );
        if (dist < minDist) {
          minDist = dist;
          siguienteIdx = j;
        }
      }
    }

    if (siguienteIdx === -1) break;
    visitados.add(siguienteIdx);
    metrosTotales += minDist;
  }

  return Number(metrosTotales.toFixed(2));
}

app.get("/api/reportes/consolidado", (req, res) => {
  const { id_usuario, id_parcela, fecha_inicio, fecha_fin } = req.query;

  if (!id_usuario) {
    return res.status(400).json({ error: "Falta el parámetro id_usuario" });
  }

  const filtrarParcela = id_parcela && id_parcela !== "todas";
  const paramsBase = [id_usuario];
  let filtroParcelaSQL = "";

  if (filtrarParcela) {
    filtroParcelaSQL = " AND p.id = ? ";
    paramsBase.push(id_parcela);
  }

  // 1. Consulta de Parcelas + Ingeniería 2D
  const qIngenieria = `
    SELECT 
      p.id,
      p.nombre AS parcela,
      p.umbral_humedad,
      p.modo_riego,
      p.latitud,
      p.longitud,
      COALESCE(MAX(c.nombre), 'Cultivo General') AS cultivo,
      COALESCE(MAX(d.codigo_mac), 'Sin vincular') AS codigo_mac,
      d2.ancho_metros,
      d2.alto_metros,
      d2.costo_metro_pvc,
      d2.alcance_mesh_metros,
      d2.nodos_json,
      d2.actualizado_en AS diseno_actualizado
    FROM parcelas p
    LEFT JOIN cultivos c ON c.id_parcela = p.id OR c.id = p.id
    LEFT JOIN dispositivos d ON d.id_parcela = p.id
    LEFT JOIN disenos_2d d2 ON d2.id_parcela = p.id
    WHERE p.id_usuario = ? ${filtroParcelaSQL}
    GROUP BY 
      p.id, p.nombre, p.umbral_humedad, p.modo_riego, p.latitud, p.longitud,
      d2.ancho_metros, d2.alto_metros, d2.costo_metro_pvc, d2.alcance_mesh_metros,
      d2.nodos_json, d2.actualizado_en
    ORDER BY p.id ASC
  `;

  db.query(qIngenieria, paramsBase, (errIng, rowsIng) => {
    if (errIng) {
      console.error("❌ Error en reporte ingeniería:", errIng);
      return res
        .status(500)
        .json({ error: "Error consultando parcelas y diseño 2D" });
    }

    const ingenieria = rowsIng.map((r) => {
      let nodos = [];
      try {
        nodos = r.nodos_json ? JSON.parse(r.nodos_json) : [];
      } catch (e) {
        nodos = [];
      }

      const ancho = parseFloat(r.ancho_metros) || 0;
      const alto = parseFloat(r.alto_metros) || 0;
      const areaM2 = Number((ancho * alto).toFixed(2));
      const costoMetro = parseFloat(r.costo_metro_pvc) || 4.5;
      const metrosPvc = calcularMetrosRedPvc(nodos, ancho, alto);
      const presupuestoPvc = Number((metrosPvc * costoMetro).toFixed(2));

      return {
        id: r.id,
        parcela: r.parcela,
        cultivo: r.cultivo,
        codigo_mac: r.codigo_mac,
        umbral_humedad: r.umbral_humedad ?? 40,
        modo_riego: r.modo_riego || "MANUAL_OFF",
        tiene_diseno: ancho > 0 && alto > 0,
        ancho_metros: ancho,
        alto_metros: alto,
        area_m2: areaM2,
        total_nodos: Array.isArray(nodos) ? nodos.length : 0,
        costo_metro_pvc: costoMetro,
        metros_pvc: metrosPvc,
        presupuesto_pvc: presupuestoPvc,
      };
    });

    // 2. Consulta de Telemetría Histórica filtrada por fechas
    const paramsTel = [...paramsBase];
    let filtroFechaTel = "";
    if (fecha_inicio && fecha_fin) {
      filtroFechaTel = " AND DATE(t.fecha_registro) BETWEEN ? AND ? ";
      paramsTel.push(fecha_inicio, fecha_fin);
    }

    const qTelemetria = `
      SELECT 
        t.id,
        t.temperatura,
        t.humedad_suelo,
        t.humedad_aire,
        t.fecha_registro,
        d.codigo_mac,
        COALESCE(c.nombre, 'Cultivo General') AS cultivo,
        p.id AS id_parcela,
        p.nombre AS parcela
      FROM datos_telemetria t
      JOIN dispositivos d ON t.id_dispositivo = d.id
      JOIN parcelas p ON d.id_parcela = p.id
      LEFT JOIN cultivos c ON d.id_cultivo = c.id
      WHERE p.id_usuario = ? ${filtroParcelaSQL} ${filtroFechaTel}
      ORDER BY t.fecha_registro DESC
      LIMIT 500
    `;

    db.query(qTelemetria, paramsTel, (errTel, rowsTel) => {
      if (errTel) {
        console.error("❌ Error en reporte telemetría:", errTel);
        return res.status(500).json({ error: "Error consultando telemetría" });
      }

      // 3. Programaciones horarias de riego
      const qProg = `
        SELECT 
          pr.id,
          p.nombre AS parcela,
          pr.dias_semana,
          TIME_FORMAT(pr.hora_inicio, '%H:%i') AS hora_inicio,
          pr.duracion_minutos,
          pr.activo
        FROM programaciones_riego pr
        JOIN parcelas p ON pr.id_parcela = p.id
        WHERE p.id_usuario = ? ${filtroParcelaSQL}
        ORDER BY p.nombre ASC, pr.hora_inicio ASC
      `;

      db.query(qProg, paramsBase, (errProg, rowsProg) => {
        if (errProg) {
          console.error("❌ Error en reporte programaciones:", errProg);
          return res
            .status(500)
            .json({ error: "Error consultando programaciones" });
        }

        // 4. Bitácora / Historial de eventos de riego
        const paramsHist = [...paramsBase];
        let filtroFechaHist = "";
        if (fecha_inicio && fecha_fin) {
          filtroFechaHist = " AND DATE(h.fecha_registro) BETWEEN ? AND ? ";
          paramsHist.push(fecha_inicio, fecha_fin);
        }

        const qHist = `
          SELECT 
            h.id,
            p.nombre AS parcela,
            h.origen,
            h.accion,
            h.detalle,
            h.fecha_registro
          FROM historial_riego h
          JOIN parcelas p ON h.id_parcela = p.id
          WHERE p.id_usuario = ? ${filtroParcelaSQL} ${filtroFechaHist}
          ORDER BY h.fecha_registro DESC
          LIMIT 200
        `;

        db.query(qHist, paramsHist, (errHist, rowsHist) => {
          if (errHist) {
            console.error("❌ Error en reporte historial riego:", errHist);
            return res
              .status(500)
              .json({ error: "Error consultando historial de riego" });
          }

          res.json({
            ingenieria,
            telemetria: rowsTel,
            programaciones: rowsProg,
            historial_riego: rowsHist,
          });
        });
      });
    });
  });
});
/////////

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
