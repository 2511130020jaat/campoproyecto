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
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

function inicializarEsquemaCampos() {
  const qCrearCampos = `
    CREATE TABLE IF NOT EXISTS campos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_usuario INT NOT NULL,
      nombre VARCHAR(120) NOT NULL,
      ubicacion_ref VARCHAR(180) NULL,
      creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_usuario_campo_nombre (id_usuario, nombre),
      KEY idx_campos_usuario (id_usuario)
    )
  `;

  db.query(qCrearCampos, (errTabla) => {
    if (errTabla) {
      console.warn("ℹ️ Esquema tabla campos:", errTabla.message);
      return;
    }

    db.query(
      "ALTER TABLE parcelas ADD COLUMN campo_general VARCHAR(120) NULL",
      (errAlterCampo) => {
        if (errAlterCampo && errAlterCampo.code !== "ER_DUP_FIELDNAME") {
          console.warn("ℹ️ Esquema campo_general:", errAlterCampo.message);
        }

        db.query(
          "ALTER TABLE parcelas ADD COLUMN id_campo INT NULL",
          (errAlterIdCampo) => {
            if (
              errAlterIdCampo &&
              errAlterIdCampo.code !== "ER_DUP_FIELDNAME"
            ) {
              console.warn("ℹ️ Esquema id_campo:", errAlterIdCampo.message);
            }

            db.query(
              "CREATE INDEX idx_parcelas_id_campo ON parcelas (id_campo)",
              (errIdx) => {
                if (errIdx && errIdx.code !== "ER_DUP_KEYNAME") {
                  console.warn("ℹ️ Índice id_campo:", errIdx.message);
                }

                // Migrar etiquetas existentes de campo_general a la tabla formal campos
                const qMigrarCampos = `
                  INSERT IGNORE INTO campos (id_usuario, nombre)
                  SELECT DISTINCT p.id_usuario, TRIM(p.campo_general)
                  FROM parcelas p
                  WHERE p.id_usuario IS NOT NULL
                    AND p.campo_general IS NOT NULL
                    AND TRIM(p.campo_general) <> ''
                `;

                db.query(qMigrarCampos, () => {
                  const qEnlazarParcelas = `
                    UPDATE parcelas p
                    JOIN campos c
                      ON c.id_usuario = p.id_usuario
                     AND LOWER(TRIM(c.nombre)) = LOWER(TRIM(p.campo_general))
                    SET p.id_campo = c.id,
                        p.campo_general = c.nombre
                    WHERE p.campo_general IS NOT NULL
                      AND TRIM(p.campo_general) <> ''
                      AND (p.id_campo IS NULL OR p.id_campo <> c.id)
                  `;

                  db.query(qEnlazarParcelas, (errEnl) => {
                    if (errEnl) {
                      console.warn(
                        "ℹ️ Sincronización id_campo:",
                        errEnl.message,
                      );
                    }
                  });
                });
              },
            );
          },
        );
      },
    );
  });
}

function resolverCampoUsuario(idUsuario, idCampoRaw, nombreCampoRaw, callback) {
  const usuarioNum = parseInt(idUsuario, 10);
  const nombreLimpio =
    nombreCampoRaw && String(nombreCampoRaw).trim() !== ""
      ? String(nombreCampoRaw).trim()
      : null;
  const idCampoNum =
    idCampoRaw !== null &&
    idCampoRaw !== undefined &&
    String(idCampoRaw).trim() !== ""
      ? parseInt(idCampoRaw, 10)
      : null;

  if (!usuarioNum) {
    return callback(null, { id_campo: null, campo_general: nombreLimpio });
  }

  if (idCampoNum && !isNaN(idCampoNum)) {
    return db.query(
      "SELECT id, nombre FROM campos WHERE id = ? AND id_usuario = ? LIMIT 1",
      [idCampoNum, usuarioNum],
      (err, rows) => {
        if (err) return callback(err, null);
        if (rows.length > 0) {
          return callback(null, {
            id_campo: rows[0].id,
            campo_general: rows[0].nombre,
          });
        }
        if (!nombreLimpio) {
          return callback(null, { id_campo: null, campo_general: null });
        }
        resolverCampoUsuario(usuarioNum, null, nombreLimpio, callback);
      },
    );
  }

  if (!nombreLimpio) {
    return callback(null, { id_campo: null, campo_general: null });
  }

  db.query(
    "SELECT id, nombre FROM campos WHERE id_usuario = ? AND LOWER(TRIM(nombre)) = LOWER(TRIM(?)) LIMIT 1",
    [usuarioNum, nombreLimpio],
    (errSel, rows) => {
      if (errSel) return callback(errSel, null);
      if (rows.length > 0) {
        return callback(null, {
          id_campo: rows[0].id,
          campo_general: rows[0].nombre,
        });
      }

      db.query(
        "INSERT INTO campos (id_usuario, nombre) VALUES (?, ?)",
        [usuarioNum, nombreLimpio],
        (errIns, resIns) => {
          if (errIns) {
            if (errIns.code === "ER_DUP_ENTRY") {
              return db.query(
                "SELECT id, nombre FROM campos WHERE id_usuario = ? AND LOWER(TRIM(nombre)) = LOWER(TRIM(?)) LIMIT 1",
                [usuarioNum, nombreLimpio],
                (errDup, rowsDup) => {
                  if (errDup) return callback(errDup, null);
                  if (rowsDup.length > 0) {
                    return callback(null, {
                      id_campo: rowsDup[0].id,
                      campo_general: rowsDup[0].nombre,
                    });
                  }
                  return callback(null, {
                    id_campo: null,
                    campo_general: nombreLimpio,
                  });
                },
              );
            }
            return callback(errIns, null);
          }

          return callback(null, {
            id_campo: resIns.insertId,
            campo_general: nombreLimpio,
          });
        },
      );
    },
  );
}

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Error conectando a MySQL:", err.message);
  } else {
    console.log("✅ Conectado exitosamente a la base de datos");
    connection.release();
    inicializarEsquemaCampos();
  }
});

// Caché en memoria (30 min) para pronóstico horario/diario y ubicación por coordenadas
const cachePronosticoOpenMeteo = new Map();
const cacheUbicacionGeo = new Map();
const TTL_PRONOSTICO_MS = 30 * 60 * 1000;

// Ruta de estado
app.get("/api/estado", (req, res) => {
  res.json({ mensaje: "¡Servidor Agroclimático en línea!" });
});

// ==========================================
// RUTAS DE AUTENTICACIÓN (LOGIN Y REGISTRO)
// ==========================================

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

app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: "Token de Google no recibido." });
  }

  try {
    const urlTokenInfo = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
    const raw = await obtenerTextoHttps(urlTokenInfo);
    const info = JSON.parse(raw);

    if (!info.email || info.email_verified !== "true") {
      return res
        .status(401)
        .json({ error: "No se pudo verificar el correo de Google." });
    }

    const correo = info.email.trim();
    const nombre = (info.name || correo.split("@")[0]).trim();

    db.query(
      "SELECT id, nombre, correo, rol FROM usuarios WHERE correo = ? LIMIT 1",
      [correo],
      (err, resultados) => {
        if (err) {
          console.error("❌ Error consultando usuario Google:", err);
          return res
            .status(500)
            .json({ error: "Error interno al verificar usuario." });
        }

        if (resultados.length > 0) {
          return res.json({
            mensaje: "Inicio de sesión con Google exitoso",
            usuario: resultados[0],
          });
        }

        const queryInsert =
          "INSERT INTO usuarios (nombre, correo, clave_hash, rol) VALUES (?, ?, ?, ?)";
        db.query(
          queryInsert,
          [nombre, correo, "GOOGLE_OAUTH", "CLIENTE"],
          (errIns, resultIns) => {
            if (errIns) {
              console.error("❌ Error creando usuario Google:", errIns);
              return res
                .status(500)
                .json({ error: "Error al registrar cuenta de Google." });
            }

            return res.status(201).json({
              mensaje: "Cuenta creada con Google",
              usuario: {
                id: resultIns.insertId,
                nombre,
                correo,
                rol: "CLIENTE",
              },
            });
          },
        );
      },
    );
  } catch (e) {
    console.error("❌ Error validando token de Google:", e.message);
    return res
      .status(401)
      .json({ error: "Token de Google inválido o expirado." });
  }
});

// ==========================================
// GESTIÓN DE CAMPOS / FUNDOS
// ==========================================

app.get("/api/campos", (req, res) => {
  const { id_usuario } = req.query;
  const condiciones = [];
  const params = [];

  if (id_usuario) {
    condiciones.push("c.id_usuario = ?");
    params.push(id_usuario);
  }

  const filtroSQL =
    condiciones.length > 0 ? " WHERE " + condiciones.join(" AND ") : "";

  const query = `
    SELECT
      c.id,
      c.id_usuario,
      c.nombre,
      c.ubicacion_ref,
      c.creado_en,
      COUNT(p.id) AS total_parcelas,
      COALESCE(SUM(p.area_m2), 0) AS area_total_m2
    FROM campos c
    LEFT JOIN parcelas p
      ON p.id_usuario = c.id_usuario
     AND (
       p.id_campo = c.id
       OR (
         p.id_campo IS NULL
         AND p.campo_general IS NOT NULL
         AND LOWER(TRIM(p.campo_general)) = LOWER(TRIM(c.nombre))
       )
     )
    ${filtroSQL}
    GROUP BY c.id, c.id_usuario, c.nombre, c.ubicacion_ref, c.creado_en
    ORDER BY c.nombre ASC, c.id ASC
  `;

  db.query(query, params, (err, rows) => {
    if (err) {
      console.error("❌ Error consultando campos:", err);
      return res.status(500).json({ error: "Error al consultar campos." });
    }
    res.json(rows);
  });
});

app.post("/api/campos", (req, res) => {
  const { id_usuario, nombre, ubicacion_ref } = req.body;

  if (!id_usuario || !nombre || String(nombre).trim() === "") {
    return res.status(400).json({
      error: "El ID de usuario y el nombre del campo son obligatorios.",
    });
  }

  const nombreLimpio = String(nombre).trim();
  const ubicacionLimpia =
    ubicacion_ref && String(ubicacion_ref).trim() !== ""
      ? String(ubicacion_ref).trim()
      : null;

  db.query(
    "SELECT id, nombre, ubicacion_ref FROM campos WHERE id_usuario = ? AND LOWER(TRIM(nombre)) = LOWER(TRIM(?)) LIMIT 1",
    [id_usuario, nombreLimpio],
    (errSel, rows) => {
      if (errSel) {
        console.error("❌ Error buscando campo:", errSel);
        return res.status(500).json({ error: "Error al validar el campo." });
      }

      if (rows.length > 0) {
        return res.status(200).json({
          ok: true,
          existente: true,
          campo: rows[0],
          mensaje: "El campo ya existía y fue seleccionado.",
        });
      }

      db.query(
        "INSERT INTO campos (id_usuario, nombre, ubicacion_ref) VALUES (?, ?, ?)",
        [id_usuario, nombreLimpio, ubicacionLimpia],
        (errIns, result) => {
          if (errIns) {
            console.error("❌ Error creando campo:", errIns);
            return res
              .status(500)
              .json({ error: "No se pudo crear el campo." });
          }

          res.status(201).json({
            ok: true,
            existente: false,
            campo: {
              id: result.insertId,
              id_usuario: Number(id_usuario),
              nombre: nombreLimpio,
              ubicacion_ref: ubicacionLimpia,
            },
            mensaje: "Campo registrado con éxito.",
          });
        },
      );
    },
  );
});

// ==========================================
// GESTIÓN DE PARCELAS Y CONFIGURACIÓN
// ==========================================

app.post("/api/parcelas", (req, res) => {
  const {
    id_usuario,
    id_campo,
    campo_general,
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

  resolverCampoUsuario(
    id_usuario,
    id_campo,
    campo_general,
    (errCampo, campoResuelto) => {
      if (errCampo) {
        console.error("❌ Error resolviendo campo:", errCampo);
        return res
          .status(500)
          .json({ error: "Error al vincular el campo de la parcela." });
      }

      const idCampoVal = campoResuelto?.id_campo ?? null;
      const campoVal = campoResuelto?.campo_general ?? null;
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
        INSERT INTO parcelas (id_usuario, id_campo, campo_general, nombre, latitud, longitud, poligono_json, area_m2) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        queryParcela,
        [
          id_usuario,
          idCampoVal,
          campoVal,
          nombre.trim(),
          latVal,
          lonVal,
          poligonoStr,
          areaVal,
        ],
        (err, resParcela) => {
          if (err) {
            console.error("❌ Error al guardar la parcela:", err);
            return res.status(500).json({
              error:
                "Error al guardar la parcela: " +
                (err.sqlMessage || err.message),
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
                    id_campo: idCampoVal,
                    campo_general: campoVal,
                    mensaje: "Parcela registrada con éxito.",
                  });
                },
              );
            } else {
              return res.status(201).json({
                ok: true,
                id_parcela,
                id_campo: idCampoVal,
                campo_general: campoVal,
                mensaje: "Parcela registrada con éxito.",
              });
            }
          });
        },
      );
    },
  );
});

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
      p.id_campo,
      COALESCE(cm.nombre, p.campo_general) AS campo_general,
      p.nombre AS parcela, 
      p.umbral_humedad,
      p.modo_riego,
      p.latitud,
      p.longitud,
      p.poligono_json,
      p.area_m2,
      COALESCE(MAX(c.nombre), MAX(c2.nombre)) AS cultivo,
      MAX(d.codigo_mac) AS codigo_mac,
      GROUP_CONCAT(DISTINCT d.codigo_mac ORDER BY d.id ASC SEPARATOR ',') AS lista_macs
    FROM parcelas p
    LEFT JOIN campos cm ON cm.id = p.id_campo
    LEFT JOIN cultivos c ON c.id_parcela = p.id
    LEFT JOIN dispositivos d ON d.id_parcela = p.id
    LEFT JOIN cultivos c2 ON c2.id = d.id_cultivo
    ${filtroSQL}
    GROUP BY p.id, p.id_campo, cm.nombre, p.campo_general, p.nombre, p.umbral_humedad, p.modo_riego, p.latitud, p.longitud, p.poligono_json, p.area_m2
    ORDER BY COALESCE(cm.nombre, p.campo_general) ASC, p.id ASC
  `;

  db.query(query, params, (err, resultados) => {
    if (err) {
      console.error("❌ Error al consultar parcelas:", err);
      return res.status(500).json({ error: "Error al consultar parcelas" });
    }
    res.json(resultados);
  });
});

app.put("/api/parcelas/:id", (req, res) => {
  const { id } = req.params;
  const {
    id_usuario,
    id_campo,
    campo_general,
    nombre,
    cultivo,
    latitud,
    longitud,
    codigo_mac,
    poligono,
    area_m2,
  } = req.body;

  if (!nombre || nombre.trim() === "") {
    return res
      .status(400)
      .json({ error: "El nombre de la parcela es obligatorio." });
  }

  db.query(
    "SELECT id_usuario FROM parcelas WHERE id = ? LIMIT 1",
    [id],
    (errBusq, rowsParcela) => {
      if (errBusq) {
        console.error("❌ Error consultando parcela:", errBusq);
        return res
          .status(500)
          .json({ error: "Error al consultar la parcela." });
      }
      if (rowsParcela.length === 0) {
        return res.status(404).json({ error: "Parcela no encontrada." });
      }

      const duenoId = id_usuario || rowsParcela[0].id_usuario;

      resolverCampoUsuario(
        duenoId,
        id_campo,
        campo_general,
        (errCampo, campoResuelto) => {
          if (errCampo) {
            console.error("❌ Error resolviendo campo:", errCampo);
            return res
              .status(500)
              .json({ error: "Error al vincular el campo de la parcela." });
          }

          const idCampoVal = campoResuelto?.id_campo ?? null;
          const campoVal = campoResuelto?.campo_general ?? null;
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
            SET id_campo = ?, campo_general = ?, nombre = ?, latitud = ?, longitud = ?, poligono_json = ?, area_m2 = ?
            WHERE id = ?
          `;

          db.query(
            queryUpdate,
            [
              idCampoVal,
              campoVal,
              nombre.trim(),
              latVal,
              lonVal,
              poligonoStr,
              areaVal,
              id,
            ],
            (err) => {
              if (err) {
                console.error("❌ Error al actualizar parcela:", err);
                return res.status(500).json({
                  error: "Error al actualizar parcela: " + err.sqlMessage,
                });
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
                        id_campo: idCampoVal,
                        campo_general: campoVal,
                        mensaje: "Parcela actualizada correctamente.",
                      });
                    },
                  );
                } else {
                  return res.json({
                    ok: true,
                    id_campo: idCampoVal,
                    campo_general: campoVal,
                    mensaje: "Parcela actualizada correctamente.",
                  });
                }
              });
            },
          );
        },
      );
    },
  );
});

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
          db.query(
            "DELETE FROM programaciones_riego WHERE id_parcela = ?",
            [id],
            () => {
              db.query(
                "DELETE FROM historial_riego WHERE id_parcela = ?",
                [id],
                () => {
                  db.query(
                    "DELETE FROM disenos_2d WHERE id_parcela = ?",
                    [id],
                    () => {
                      db.query(
                        "DELETE FROM alertas_climaticas WHERE id_parcela = ?",
                        [id],
                        () => {
                          db.query(
                            "DELETE FROM parcelas WHERE id = ?",
                            [id],
                            (errParc) => {
                              if (errParc) {
                                console.error(
                                  "❌ Error eliminando parcela:",
                                  errParc,
                                );
                                return res.status(500).json({
                                  error:
                                    "No se pudo eliminar la parcela: " +
                                    errParc.sqlMessage,
                                });
                              }
                              res.json({
                                ok: true,
                                mensaje: "Parcela eliminada correctamente.",
                              });
                            },
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        });
      },
    );
  });
});

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

app.put("/api/parcelas/:id/modo", (req, res) => {
  const { id } = req.params;
  const { modo } = req.body;

  if (!modo || !["AUTO", "MANUAL_ON", "MANUAL_OFF"].includes(modo)) {
    return res.status(400).json({ error: "Modo de riego no válido: " + modo });
  }

  const query = "UPDATE parcelas SET modo_riego = ? WHERE id = ?";
  db.query(query, [modo, id], (err) => {
    if (err) {
      console.error("❌ Error al actualizar modo de riego:", err);
      return res.status(500).json({ error: "Error de BD: " + err.message });
    }
    res.json({ mensaje: "Modo de riego actualizado", id_parcela: id, modo });
  });
});

// Consulta individual de dispositivos ESP32 vinculados a parcelas con su última lectura
app.get("/api/dispositivos", (req, res) => {
  const { id_usuario, id_parcela } = req.query;
  const condiciones = [];
  const params = [];

  if (id_usuario) {
    condiciones.push("p.id_usuario = ?");
    params.push(id_usuario);
  }
  if (id_parcela) {
    condiciones.push("p.id = ?");
    params.push(id_parcela);
  }

  const filtroSQL =
    condiciones.length > 0 ? " WHERE " + condiciones.join(" AND ") : "";

  const query = `
    SELECT 
      d.id,
      d.codigo_mac,
      d.estado,
      p.id AS id_parcela,
      p.nombre AS parcela,
      p.id_campo,
      COALESCE(cm.nombre, p.campo_general) AS campo_general,
      p.umbral_humedad,
      COALESCE(c.nombre, 'General') AS cultivo,
      (
        SELECT t.humedad_suelo
        FROM datos_telemetria t
        WHERE t.id_dispositivo = d.id
        ORDER BY t.fecha_registro DESC
        LIMIT 1
      ) AS humedad_suelo,
      (
        SELECT t.temperatura
        FROM datos_telemetria t
        WHERE t.id_dispositivo = d.id
        ORDER BY t.fecha_registro DESC
        LIMIT 1
      ) AS temperatura,
      (
        SELECT t.humedad_aire
        FROM datos_telemetria t
        WHERE t.id_dispositivo = d.id
        ORDER BY t.fecha_registro DESC
        LIMIT 1
      ) AS humedad_aire,
      (
        SELECT t.fecha_registro
        FROM datos_telemetria t
        WHERE t.id_dispositivo = d.id
        ORDER BY t.fecha_registro DESC
        LIMIT 1
      ) AS ultima_lectura,
      (
        SELECT COUNT(*)
        FROM datos_telemetria t
        WHERE t.id_dispositivo = d.id
      ) AS total_registros
    FROM dispositivos d
    JOIN parcelas p ON d.id_parcela = p.id
    LEFT JOIN campos cm ON cm.id = p.id_campo
    LEFT JOIN cultivos c ON d.id_cultivo = c.id
    ${filtroSQL}
    ORDER BY p.id ASC, d.id ASC
  `;

  db.query(query, params, (err, rows) => {
    if (err) {
      console.error("❌ Error consultando dispositivos:", err);
      return res.status(500).json({ error: "Error consultando dispositivos" });
    }
    res.json(rows);
  });
});

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

// ==========================================
// PROGRAMACIÓN HORARIA E HISTORIAL DE RIEGO
// ==========================================

function horaATotalMinutos(horaStr) {
  const partes = String(horaStr || "00:00")
    .split(":")
    .map(Number);
  const hh = isNaN(partes[0]) ? 0 : partes[0];
  const mm = isNaN(partes[1]) ? 0 : partes[1];
  return hh * 60 + mm;
}

function minutosAHoraStr(totalMin) {
  const norm = ((totalMin % 1440) + 1440) % 1440;
  const hh = String(Math.floor(norm / 60)).padStart(2, "0");
  const mm = String(norm % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function verificarConflictoHorario(
  idParcela,
  diasSemanaStr,
  horaInicioStr,
  duracionMin,
  excluirId,
  callback,
) {
  const diasNuevos = String(diasSemanaStr || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const iniNuevo = horaATotalMinutos(horaInicioStr);
  const finNuevo = iniNuevo + duracionMin;

  const qExistentes = `
    SELECT 
      id, 
      dias_semana, 
      TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio, 
      duracion_minutos
    FROM programaciones_riego
    WHERE id_parcela = ? AND activo = 1
  `;

  db.query(qExistentes, [idParcela], (err, rows) => {
    if (err) return callback(err, null);

    for (const row of rows) {
      if (excluirId && String(row.id) === String(excluirId)) continue;

      const diasExistentes = String(row.dias_semana || "")
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      const diasComunes = diasNuevos.filter((d) => diasExistentes.includes(d));
      if (diasComunes.length === 0) continue;

      const iniExist = horaATotalMinutos(row.hora_inicio);
      const finExist = iniExist + (parseInt(row.duracion_minutos, 10) || 15);

      // Solapamiento de intervalos [iniNuevo, finNuevo) y [iniExist, finExist)
      if (iniNuevo < finExist && iniExist < finNuevo) {
        return callback(null, {
          id_conflicto: row.id,
          dias_comunes: diasComunes,
          hora_inicio: row.hora_inicio,
          hora_fin: minutosAHoraStr(finExist),
          duracion_minutos: row.duracion_minutos,
        });
      }
    }

    callback(null, null);
  });
}

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
    ORDER BY p.id ASC, pr.hora_inicio ASC
  `;

  db.query(query, params, (err, resultados) => {
    if (err) {
      console.error("❌ Error al consultar programaciones:", err);
      return res.status(500).json({ error: "Error al cargar programaciones" });
    }
    res.json(resultados);
  });
});

app.post("/api/riego/programaciones", (req, res) => {
  const { id_parcela, dias_semana, hora_inicio, duracion_minutos } = req.body;

  if (!id_parcela || !dias_semana || !hora_inicio) {
    return res.status(400).json({
      error: "Parcela, días de la semana y hora de inicio son obligatorios.",
    });
  }

  const duracion = Math.min(
    240,
    Math.max(1, parseInt(duracion_minutos, 10) || 15),
  );

  verificarConflictoHorario(
    id_parcela,
    dias_semana,
    hora_inicio,
    duracion,
    null,
    (errConf, conflicto) => {
      if (errConf) {
        return res
          .status(500)
          .json({ error: "Error validando disponibilidad horaria" });
      }

      if (conflicto) {
        return res.status(409).json({
          error: `Horario repetido o superpuesto en ${conflicto.dias_comunes.join(", ")}: ya existe un turno de ${conflicto.hora_inicio} a ${conflicto.hora_fin} (${conflicto.duracion_minutos} min) en esta parcela.`,
          conflicto,
        });
      }

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
    },
  );
});

app.put("/api/riego/programaciones/:id", (req, res) => {
  const { id } = req.params;
  const { id_parcela, dias_semana, hora_inicio, duracion_minutos } = req.body;

  if (!id_parcela || !dias_semana || !hora_inicio) {
    return res.status(400).json({
      error: "Parcela, días de la semana y hora de inicio son obligatorios.",
    });
  }

  const duracion = Math.min(
    240,
    Math.max(1, parseInt(duracion_minutos, 10) || 15),
  );

  verificarConflictoHorario(
    id_parcela,
    dias_semana,
    hora_inicio,
    duracion,
    id,
    (errConf, conflicto) => {
      if (errConf) {
        return res
          .status(500)
          .json({ error: "Error validando disponibilidad horaria" });
      }

      if (conflicto) {
        return res.status(409).json({
          error: `Conflicto en ${conflicto.dias_comunes.join(", ")}: se cruza con otro turno de ${conflicto.hora_inicio} a ${conflicto.hora_fin}.`,
          conflicto,
        });
      }

      const query = `
        UPDATE programaciones_riego 
        SET id_parcela = ?, dias_semana = ?, hora_inicio = ?, duracion_minutos = ?
        WHERE id = ?
      `;

      db.query(
        query,
        [id_parcela, dias_semana, hora_inicio, duracion, id],
        (err) => {
          if (err) {
            console.error("❌ Error al actualizar programación:", err);
            return res
              .status(500)
              .json({ error: "Error al actualizar horario de riego" });
          }

          db.query(
            "INSERT INTO historial_riego (id_parcela, origen, accion, detalle) VALUES (?, 'CRONOGRAMA', 'HORARIO EDITADO', ?)",
            [
              id_parcela,
              `Días: ${dias_semana} | Inicio: ${hora_inicio} (${duracion} min)`,
            ],
            () => {},
          );

          res.json({
            ok: true,
            mensaje: "Horario actualizado correctamente.",
          });
        },
      );
    },
  );
});

app.put("/api/riego/programaciones/:id/estado", (req, res) => {
  const { id } = req.params;
  const activar = req.body.activo ? 1 : 0;

  if (activar === 0) {
    return db.query(
      "UPDATE programaciones_riego SET activo = 0 WHERE id = ?",
      [id],
      (err) => {
        if (err) {
          return res.status(500).json({ error: "Error al pausar el horario" });
        }
        res.json({ ok: true });
      },
    );
  }

  db.query(
    "SELECT id_parcela, dias_semana, TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio, duracion_minutos FROM programaciones_riego WHERE id = ? LIMIT 1",
    [id],
    (errSel, rows) => {
      if (errSel || rows.length === 0) {
        return res.status(404).json({ error: "Horario no encontrado" });
      }

      const turno = rows[0];
      verificarConflictoHorario(
        turno.id_parcela,
        turno.dias_semana,
        turno.hora_inicio,
        parseInt(turno.duracion_minutos, 10) || 15,
        id,
        (errConf, conflicto) => {
          if (errConf) {
            return res
              .status(500)
              .json({ error: "Error validando disponibilidad horaria" });
          }
          if (conflicto) {
            return res.status(409).json({
              error: `No se puede activar porque se cruza en ${conflicto.dias_comunes.join(", ")} con otro turno (${conflicto.hora_inicio} a ${conflicto.hora_fin}).`,
              conflicto,
            });
          }

          db.query(
            "UPDATE programaciones_riego SET activo = 1 WHERE id = ?",
            [id],
            (errUpd) => {
              if (errUpd) {
                return res
                  .status(500)
                  .json({ error: "Error al activar el horario" });
              }
              res.json({ ok: true });
            },
          );
        },
      );
    },
  );
});

app.delete("/api/riego/programaciones/:id", (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM programaciones_riego WHERE id = ?", [id], (err) => {
    if (err) {
      return res.status(500).json({ error: "Error al eliminar programación" });
    }
    res.json({ ok: true });
  });
});

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
    LIMIT 40
  `;

  db.query(query, params, (err, resultados) => {
    if (err) {
      console.error("❌ Error al consultar historial de riego:", err);
      return res.status(500).json({ error: "Error al consultar historial" });
    }
    res.json(resultados);
  });
});

// ==========================================
// MOTOR DE PRONÓSTICO HORARIO, MICROCLIMA, 5 DÍAS Y UBICACIÓN
// ==========================================

async function obtenerUbicacionGeografica(lat, lon) {
  const claveGeo = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const enCache = cacheUbicacionGeo.get(claveGeo);
  if (enCache) return enCache;

  const fallback = {
    distrito: "Sector Agrícola",
    provincia: "Jurisdicción Local",
    departamento: "Perú",
    etiqueta: `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`,
  };

  try {
    const urlGeo = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=es`;
    const raw = await obtenerTextoHttps(urlGeo);
    const data = JSON.parse(raw);
    const addr = data.address || {};

    const distrito =
      addr.city_district ||
      addr.town ||
      addr.village ||
      addr.suburb ||
      addr.municipality ||
      addr.city ||
      "Distrito Local";
    const provincia = addr.province || addr.region || addr.county || "";
    const departamento = addr.state || "Perú";

    const partes = [distrito, provincia, departamento].filter(Boolean);
    const ubicacion = {
      distrito,
      provincia,
      departamento,
      etiqueta: partes.join(" • "),
    };

    cacheUbicacionGeo.set(claveGeo, ubicacion);
    return ubicacion;
  } catch (e) {
    return fallback;
  }
}

function analizarSeriesHorarias(clima) {
  if (
    !clima ||
    !clima.hourly ||
    !Array.isArray(clima.hourly.time) ||
    clima.hourly.time.length === 0
  ) {
    return {
      ultimas_12h: [],
      proximas_24h: [],
      microclima: {
        lluvia_12h_mm: 0,
        llovio_madrugada: false,
        nubosidad_actual: 0,
        humedad_actual: 0,
        radiacion_actual: 0,
        garua_detectada: false,
        sol_intermitente: false,
        diagnostico: "Sin datos horarios disponibles.",
      },
    };
  }

  const horaLocalRef = String(clima.current?.time || "").slice(0, 13);
  let indiceInicio = 0;

  if (horaLocalRef) {
    const idxEncontrado = clima.hourly.time.findIndex(
      (t) => String(t).slice(0, 13) >= horaLocalRef,
    );
    if (idxEncontrado !== -1) indiceInicio = idxEncontrado;
  }

  const mapearHora = (i) => {
    const rawTime = String(clima.hourly.time[i] || "");
    const horaEtiqueta = rawTime.includes("T")
      ? rawTime.split("T")[1].slice(0, 5)
      : rawTime;
    const temp = Number(clima.hourly.temperature_2m?.[i] ?? 0);
    const prob = Number(clima.hourly.precipitation_probability?.[i] ?? 0);
    const mm = Number(clima.hourly.precipitation?.[i] ?? 0);
    const nube = Number(clima.hourly.cloud_cover?.[i] ?? 0);
    const hr = Number(clima.hourly.relative_humidity_2m?.[i] ?? 0);
    const rad = Number(clima.hourly.shortwave_radiation?.[i] ?? 0);

    const esGarua =
      (mm > 0 && mm < 0.8) || (prob < 40 && nube >= 80 && hr >= 82);

    return {
      time: rawTime,
      hora: horaEtiqueta,
      temperatura: temp,
      prob_lluvia: prob,
      lluvia_mm: mm,
      nubosidad: nube,
      humedad_aire: hr,
      radiacion_wm2: rad,
      es_garua: esGarua,
    };
  };

  const inicioPasado = Math.max(0, indiceInicio - 12);
  const ultimas_12h = [];
  for (let i = inicioPasado; i < indiceInicio; i++) {
    ultimas_12h.push(mapearHora(i));
  }

  const limiteFuturo = Math.min(clima.hourly.time.length, indiceInicio + 24);
  const proximas_24h = [];
  for (let i = indiceInicio; i < limiteFuturo; i++) {
    proximas_24h.push(mapearHora(i));
  }

  const lluvia12hMm = Number(
    ultimas_12h.reduce((acc, h) => acc + h.lluvia_mm, 0).toFixed(1),
  );
  const horasGaruaPasada = ultimas_12h.filter((h) => h.es_garua).length;
  const llovioMadrugada = lluvia12hMm >= 0.2 || horasGaruaPasada >= 2;

  const nubosidadActual = Number(
    clima.current?.cloud_cover ?? proximas_24h[0]?.nubosidad ?? 0,
  );
  const humedadActual = Number(
    clima.current?.relative_humidity_2m ?? proximas_24h[0]?.humedad_aire ?? 0,
  );
  const radiacionActual = Number(
    clima.current?.shortwave_radiation ?? proximas_24h[0]?.radiacion_wm2 ?? 0,
  );
  const precipActual = Number(clima.current?.precipitation ?? 0);

  const garuaDetectada =
    (precipActual > 0 && precipActual < 1.0) ||
    (nubosidadActual >= 80 && humedadActual >= 82) ||
    proximas_24h.slice(0, 3).some((h) => h.es_garua);

  const horasDiurnas = proximas_24h.filter((h) => {
    const hh = parseInt(h.hora.split(":")[0], 10);
    return hh >= 7 && hh <= 17;
  });
  let solIntermitente = false;
  if (horasDiurnas.length >= 2) {
    const nubes = horasDiurnas.map((h) => h.nubosidad);
    const rangoNube = Math.max(...nubes) - Math.min(...nubes);
    solIntermitente =
      rangoNube >= 35 || (nubosidadActual >= 35 && nubosidadActual <= 85);
  }

  const notas = [];
  if (llovioMadrugada) {
    notas.push(
      lluvia12hMm >= 0.2
        ? `Lluvia/humedad registrada en las últimas 12h (${lluvia12hMm} mm)`
        : "Condensación / llovizna ligera detectada en la madrugada",
    );
  }
  if (solIntermitente) {
    notas.push(
      `Nubosidad variable (${Math.round(nubosidadActual)}% nubes, radiación ${Math.round(radiacionActual)} W/m²): brillo solar intermitente`,
    );
  }
  if (garuaDetectada) {
    notas.push(
      `Alta humedad (${Math.round(humedadActual)}%) y cielo cubierto: probable garúa o llovizna fina`,
    );
  }
  if (notas.length === 0) {
    notas.push(
      `Cielo con ${Math.round(nubosidadActual)}% de nubosidad y ${Math.round(humedadActual)}% de humedad ambiental sin irregularidades bruscas.`,
    );
  }

  return {
    ultimas_12h,
    proximas_24h,
    microclima: {
      lluvia_12h_mm: lluvia12hMm,
      llovio_madrugada: llovioMadrugada,
      nubosidad_actual: Math.round(nubosidadActual),
      humedad_actual: Math.round(humedadActual),
      radiacion_actual: Math.round(radiacionActual),
      garua_detectada: garuaDetectada,
      sol_intermitente: solIntermitente,
      diagnostico: notas.join(" • "),
    },
  };
}

function analizarLluviaProximas6h(horas24) {
  const proximas6 = (horas24 || []).slice(0, 6);
  let maxProb6h = 0;
  let totalMm6h = 0;
  let horasHastaLluvia = 1;
  let encontroPico = false;

  proximas6.forEach((h, idx) => {
    if (h.prob_lluvia > maxProb6h) {
      maxProb6h = h.prob_lluvia;
    }
    totalMm6h += h.lluvia_mm;
    if (!encontroPico && (h.prob_lluvia >= 65 || h.lluvia_mm >= 0.8)) {
      horasHastaLluvia = idx + 1;
      encontroPico = true;
    }
  });

  const lluviaInminente = maxProb6h >= 65 && totalMm6h >= 1.5;
  return {
    lluviaInminente,
    maxProb6h: Math.round(maxProb6h),
    totalMm6h: Number(totalMm6h.toFixed(1)),
    horasHastaLluvia,
  };
}

async function obtenerPronosticoParcela(latRaw, lonRaw) {
  let lat =
    latRaw !== null && latRaw !== "" && latRaw !== undefined
      ? parseFloat(latRaw)
      : -12.6581;
  let lon =
    lonRaw !== null && lonRaw !== "" && lonRaw !== undefined
      ? parseFloat(lonRaw)
      : -76.6321;

  if (isNaN(lat) || lat < -90 || lat > 90) lat = -12.6581;
  if (isNaN(lon) || lon < -180 || lon > 180) lon = -76.6321;

  const claveCache = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const enCache = cachePronosticoOpenMeteo.get(claveCache);

  if (enCache && Date.now() - enCache.ts < TTL_PRONOSTICO_MS) {
    return enCache.payload;
  }

  const paramsClima = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,cloud_cover,precipitation,shortwave_radiation",
    hourly:
      "temperature_2m,precipitation_probability,precipitation,cloud_cover,relative_humidity_2m,shortwave_radiation",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,et0_fao_evapotranspiration",
    timezone: "auto",
    past_days: "1",
    forecast_days: "8",
  });

  const urlClima =
    "https://api.open-meteo.com/v1/forecast?" + paramsClima.toString();

  const [rawClima, ubicacion] = await Promise.all([
    obtenerTextoHttps(urlClima),
    obtenerUbicacionGeografica(lat, lon),
  ]);

  const clima = JSON.parse(rawClima);
  const { ultimas_12h, proximas_24h, microclima } =
    analizarSeriesHorarias(clima);
  const pronostico_6h = analizarLluviaProximas6h(proximas_24h);

  const payload = {
    coordenadas: { lat, lon },
    ubicacion,
    clima,
    ultimas_12h,
    proximas_24h,
    pronostico_6h,
    microclima,
  };

  cachePronosticoOpenMeteo.set(claveCache, {
    ts: Date.now(),
    payload,
  });

  return payload;
}

// Consulta directa de clima por coordenadas (GPS del cliente, clic en mapa o búsqueda)
app.get("/api/clima/coordenadas", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (
    isNaN(lat) ||
    isNaN(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return res.status(400).json({ error: "Coordenadas lat/lon inválidas." });
  }

  try {
    const info = await obtenerPronosticoParcela(lat, lon);
    res.json(info);
  } catch (e) {
    console.error("❌ Error consultando clima por coordenadas:", e.message);
    res
      .status(502)
      .json({ error: "No se pudo obtener el pronóstico para esa ubicación." });
  }
});

// Buscador de distritos / ciudades para centrar el mapa climático
app.get("/api/clima/buscar-lugar", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) {
    return res.json([]);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=pe&addressdetails=1&limit=6&accept-language=es`;
    const raw = await obtenerTextoHttps(url);
    const lista = JSON.parse(raw);

    const resultados = (Array.isArray(lista) ? lista : []).map((item) => ({
      nombre: item.name || item.display_name.split(",")[0],
      etiqueta: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    }));

    res.json(resultados);
  } catch (e) {
    console.warn("⚠️ Error buscando lugar:", e.message);
    res.json([]);
  }
});

// GET /api/alertas-agro/:id_usuario - Pronóstico 24h, microclima, 5 días y ubicación real
app.get("/api/alertas-agro/:id_usuario", (req, res) => {
  const { id_usuario } = req.params;

  const queryParcelas = `
    SELECT 
      p.id,
      p.id_campo,
      COALESCE(cm.nombre, p.campo_general) AS campo_general,
      p.nombre AS parcela,
      p.umbral_humedad,
      p.modo_riego,
      p.latitud,
      p.longitud,
      p.poligono_json,
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
    LEFT JOIN campos cm ON cm.id = p.id_campo
    LEFT JOIN cultivos c ON c.id_parcela = p.id
    LEFT JOIN dispositivos d ON d.id_parcela = p.id
    WHERE p.id_usuario = ?
    GROUP BY p.id, p.id_campo, cm.nombre, p.campo_general, p.nombre, p.umbral_humedad, p.modo_riego, p.latitud, p.longitud, p.poligono_json
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
      const umbral =
        p.umbral_humedad !== null ? parseFloat(p.umbral_humedad) : 35;
      const humSuelo =
        p.ultima_humedad_suelo !== null
          ? parseFloat(p.ultima_humedad_suelo)
          : null;

      let coordenadas = {
        lat: p.latitud !== null ? parseFloat(p.latitud) : -12.6581,
        lon: p.longitud !== null ? parseFloat(p.longitud) : -76.6321,
      };
      let ubicacion = {
        distrito: "Sector Agrícola",
        provincia: "Jurisdicción Local",
        departamento: "Perú",
        etiqueta: "Ubicación GPS",
      };
      let clima = null;
      let ultimas_12h = [];
      let proximas_24h = [];
      let microclima = null;
      let pronostico_6h = {
        lluviaInminente: false,
        maxProb6h: 0,
        totalMm6h: 0,
        horasHastaLluvia: 1,
      };

      try {
        const info = await obtenerPronosticoParcela(p.latitud, p.longitud);
        coordenadas = info.coordenadas || coordenadas;
        ubicacion = info.ubicacion || ubicacion;
        clima = info.clima;
        ultimas_12h = info.ultimas_12h || [];
        proximas_24h = info.proximas_24h;
        pronostico_6h = info.pronostico_6h;
        microclima = info.microclima;
      } catch (e) {
        console.warn("⚠️ Open-Meteo error:", e.message);
      }

      let estado = "OPTIMO";
      let notaBreve = "Parámetros estables";

      if (
        humSuelo !== null &&
        humSuelo < umbral &&
        pronostico_6h.lluviaInminente
      ) {
        estado = "ATENCION";
        notaBreve = `Riego pospuesto: lluvia (${pronostico_6h.maxProb6h}% en ${pronostico_6h.horasHastaLluvia}h)`;
      } else if (humSuelo !== null && humSuelo < umbral) {
        estado = "CRITICO";
        notaBreve = "Humedad baja (" + humSuelo.toFixed(0) + "%)";
      } else if (humSuelo !== null && humSuelo > 85) {
        estado = "ATENCION";
        notaBreve = "Suelo muy húmedo (" + humSuelo.toFixed(0) + "%)";
      } else if (pronostico_6h.lluviaInminente) {
        estado = "ATENCION";
        notaBreve = `Lluvia prevista (${pronostico_6h.maxProb6h}% en ${pronostico_6h.horasHastaLluvia}h)`;
      } else if (microclima && microclima.garua_detectada) {
        estado = "ATENCION";
        notaBreve = "Garúa / llovizna fina detectada";
      } else if (humSuelo === null) {
        notaBreve = "Esperando telemetría";
      }

      resultados.push({
        id: p.id,
        id_campo: p.id_campo || null,
        campo_general: p.campo_general || null,
        parcela: p.parcela,
        cultivo: p.cultivo,
        latitud: p.latitud,
        longitud: p.longitud,
        poligono_json: p.poligono_json,
        coordenadas,
        ubicacion,
        modo_riego: p.modo_riego || "AUTO",
        umbral_humedad: umbral,
        humedad_suelo: humSuelo,
        estado,
        notaBreve,
        clima,
        ultimas_12h,
        proximas_24h,
        pronostico_6h,
        microclima,
      });
    }

    res.json(resultados);
  });
});

// ==========================================
// RECEPCIÓN Y CONSULTA DE TELEMETRÍA
// ==========================================

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
    SELECT 
      d.id AS id_dispositivo, 
      p.id AS id_parcela, 
      p.umbral_humedad, 
      p.modo_riego,
      p.latitud,
      p.longitud,
      p.area_m2
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

    const {
      id_dispositivo,
      id_parcela,
      umbral_humedad,
      modo_riego,
      latitud,
      longitud,
      area_m2,
    } = resultados[0];
    const umbralBase =
      umbral_humedad !== null ? parseFloat(umbral_humedad) : 35.0;
    const modoParcela = modo_riego || "AUTO";

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

        let alertaActiva = null;
        let umbralEfectivo = umbralBase;

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

        const responderTelemetria = (
          activarRiego,
          motivo,
          pronostico6h = null,
        ) => {
          const enviarRespuesta = () => {
            res.status(201).json({
              mensaje: "Datos de clima registrados correctamente",
              modo_aplicado: modoParcela,
              umbral_base: umbralBase,
              umbral_aplicado: umbralEfectivo,
              riego_activado: activarRiego,
              motivo_riego: motivo,
              pronostico_lluvia: pronostico6h,
              alerta_climatica: alertaActiva,
            });
          };

          if (!id_parcela || modoParcela !== "AUTO") {
            return enviarRespuesta();
          }

          if (motivo === "POSPUESTO_PRONOSTICO_LLUVIA" && pronostico6h) {
            const qCheckPospuesto = `
              SELECT id FROM historial_riego
              WHERE id_parcela = ? AND accion = 'RIEGO POSPUESTO'
                AND fecha_registro >= NOW() - INTERVAL 60 MINUTE
              LIMIT 1
            `;
            return db.query(qCheckPospuesto, [id_parcela], (errCp, rowsCp) => {
              if (!errCp && rowsCp.length === 0) {
                const detalle = `Lluvia prevista (${pronostico6h.maxProb6h}% en ${pronostico6h.horasHastaLluvia}h, ${pronostico6h.totalMm6h} mm) — Turno pospuesto`;
                db.query(
                  "INSERT INTO historial_riego (id_parcela, origen, accion, detalle) VALUES (?, 'IA_CLIMA', 'RIEGO POSPUESTO', ?)",
                  [id_parcela, detalle],
                  () => enviarRespuesta(),
                );
              } else {
                enviarRespuesta();
              }
            });
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
                  : `Humedad: ${humSueloVal}% < Umbral: ${umbralEfectivo}% (${motivo})`;

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

        if (saturadoOLluvia) {
          return responderTelemetria(false, "BLOQUEO_SATURACION_LLUVIA");
        }

        const qHorario = `
          SELECT pr.dias_semana, TIME_FORMAT(pr.hora_inicio, '%H:%i') AS hora_inicio, pr.duracion_minutos
          FROM programaciones_riego pr
          JOIN dispositivos d ON d.id_parcela = pr.id_parcela
          WHERE d.id = ? AND pr.activo = 1
        `;

        db.query(qHorario, [id_dispositivo], async (errHor, horarios) => {
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

          if (!porHumedad) {
            return responderTelemetria(false, "OPTIMO");
          }

          if (humSueloVal < 15.0) {
            return responderTelemetria(true, "UMBRAL_CRITICO_SEQUIA");
          }

          try {
            const infoClima = await obtenerPronosticoParcela(latitud, longitud);
            const p6 = infoClima.pronostico_6h;

            if (p6 && p6.lluviaInminente) {
              return responderTelemetria(
                false,
                "POSPUESTO_PRONOSTICO_LLUVIA",
                p6,
              );
            }
          } catch (e) {}

          const motivoOptimo =
            umbralEfectivo > umbralBase
              ? "UMBRAL_DINAMICO_CALOR"
              : "UMBRAL_HUMEDAD";

          return responderTelemetria(true, motivoOptimo);
        });
      },
    );
  });
});

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

// ==========================================
// DISEÑADOR DE INGENIERÍA 2D Y ORTOFOTO
// ==========================================

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
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/ /g, " ")
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
      (rows[0].noticias_json.includes("<a") ||
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

// =========================================================================
// MÓDULO DE REPORTES Y EXPORTACIÓN (TELEMETRÍA, INGENIERÍA 2D Y RIEGO)
// =========================================================================

function calcularMetrosRedPvc(nodos, anchoMetros, altoMetros) {
  if (!Array.isArray(nodos) || nodos.length < 2) return 0;

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

  const qIngenieria = `
    SELECT 
      p.id,
      p.id_campo,
      COALESCE(cm.nombre, p.campo_general) AS campo_general,
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
    LEFT JOIN campos cm ON cm.id = p.id_campo
    LEFT JOIN cultivos c ON c.id_parcela = p.id
    LEFT JOIN dispositivos d ON d.id_parcela = p.id
    LEFT JOIN disenos_2d d2 ON d2.id_parcela = p.id
    WHERE p.id_usuario = ? ${filtroParcelaSQL}
    GROUP BY 
      p.id, p.id_campo, cm.nombre, p.campo_general, p.nombre, p.umbral_humedad, p.modo_riego, p.latitud, p.longitud,
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
        id_campo: r.id_campo || null,
        campo_general: r.campo_general || null,
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
