if (localStorage.getItem("usuario_asir")) {
  window.location.href = "/alertas.html";
}

function mostrarForm(modo) {
  const fLogin = document.getElementById("formLogin");
  const fReg = document.getElementById("formRegistro");
  const tLogin = document.getElementById("tabLogin");
  const tReg = document.getElementById("tabRegistro");

  if (!fLogin || !fReg || !tLogin || !tReg) return;

  if (modo === "login") {
    fLogin.classList.remove("hidden");
    fReg.classList.add("hidden");

    tLogin.className =
      "w-1/2 py-2 text-xs font-bold rounded-lg bg-sky-600 text-white transition";
    tLogin.style.background = "";
    tLogin.style.color = "";

    tReg.className =
      "w-1/2 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition";
    tReg.style.background = "transparent";
    tReg.style.color = "";
  } else {
    fLogin.classList.add("hidden");
    fReg.classList.remove("hidden");

    tReg.className =
      "w-1/2 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white transition";
    tReg.style.background = "";
    tReg.style.color = "";

    tLogin.className =
      "w-1/2 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition";
    tLogin.style.background = "transparent";
    tLogin.style.color = "";
  }
}

function mostrarMensaje(texto, esError = false) {
  const box = document.getElementById("msgAlerta");
  if (!box) return;

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
  if (e) e.preventDefault();

  const correo = document.getElementById("loginCorreo")?.value.trim();
  const clave_hash = document.getElementById("loginClave")?.value;

  if (!correo || !clave_hash) {
    mostrarMensaje("Completa tu correo y contraseña", true);
    return;
  }

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo, clave_hash }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const usuario = data.usuario || data;
      localStorage.setItem("usuario_asir", JSON.stringify(usuario));
      window.location.href = "/alertas.html";
    } else {
      mostrarMensaje(
        data.error || `No se pudo iniciar sesión (código ${res.status})`,
        true,
      );
    }
  } catch (err) {
    mostrarMensaje("Error de conexión con el servidor", true);
  }
}

async function ejecutarRegistro(e) {
  if (e) e.preventDefault();

  const nombre = document.getElementById("regNombre")?.value.trim();
  const correo = document.getElementById("regCorreo")?.value.trim();
  const clave_hash = document.getElementById("regClave")?.value;

  if (!nombre || !correo || !clave_hash) {
    mostrarMensaje("Completa todos los campos de registro", true);
    return;
  }

  try {
    const res = await fetch("/api/auth/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, correo, clave_hash }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      localStorage.removeItem("usuario_asir");
      window.location.href = "/acceso.html";
    } else {
      mostrarMensaje(
        data.error || `No se pudo registrar la cuenta (código ${res.status})`,
        true,
      );
    }
  } catch (err) {
    mostrarMensaje("Error de red al registrar la cuenta", true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const formLogin = document.getElementById("formLogin");
  const formRegistro = document.getElementById("formRegistro");

  if (formLogin) {
    formLogin.addEventListener("submit", ejecutarLogin);
  }
  if (formRegistro) {
    formRegistro.addEventListener("submit", ejecutarRegistro);
  }
});
