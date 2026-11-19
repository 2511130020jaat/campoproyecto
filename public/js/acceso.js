if (localStorage.getItem("usuario_asir"))
  window.location.href = "/alertas.html";

function mostrarForm(modo) {
  const fLogin = document.getElementById("formLogin");
  const fReg = document.getElementById("formRegistro");
  const tLogin = document.getElementById("tabLogin");
  const tReg = document.getElementById("tabRegistro");

  if (modo === "login") {
    fLogin.classList.remove("hidden");
    fReg.classList.add("hidden");
    tLogin.className =
      "w-1/2 py-2 text-xs font-bold rounded-lg bg-sky-600 text-white transition";
    tReg.className =
      "w-1/2 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition";
  } else {
    fLogin.classList.add("hidden");
    fReg.classList.remove("hidden");
    tReg.className =
      "w-1/2 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white transition";
    tLogin.className =
      "w-1/2 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition";
  }
}

function mostrarMensaje(texto, esError = false) {
  const box = document.getElementById("msgAlerta");
  box.classList.remove(
    "hidden",
    "bg-red-500/20",
    "text-red-400",
    "bg-emerald-500/20",
    "text-emerald-400",
  );
  box.classList.add(
    esError ? "bg-red-500/20" : "bg-emerald-500/20",
    esError ? "text-red-400" : "text-emerald-400",
  );
  box.innerText = texto;
}

async function ejecutarLogin(e) {
  e.preventDefault();
  const correo = document.getElementById("loginCorreo").value;
  const clave_hash = document.getElementById("loginClave").value;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo, clave_hash }),
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("usuario_asir", JSON.stringify(data.usuario));
      window.location.href = "/alertas.html";
    } else {
      mostrarMensaje(data.error || "Credenciales incorrectas", true);
    }
  } catch (err) {
    mostrarMensaje("Error de conexión con el servidor", true);
  }
}

async function ejecutarRegistro(e) {
  e.preventDefault();
  const nombre = document.getElementById("regNombre").value;
  const correo = document.getElementById("regCorreo").value;
  const clave_hash = document.getElementById("regClave").value;

  try {
    const res = await fetch("/api/auth/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, correo, clave_hash }),
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("usuario_asir", JSON.stringify(data.usuario));
      window.location.href = "/alertas.html";
    } else {
      mostrarMensaje(data.error || "No se pudo registrar la cuenta", true);
    }
  } catch (err) {
    mostrarMensaje("Error de red al registrar la cuenta", true);
  }
}
