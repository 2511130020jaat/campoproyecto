// Proteger rutas privadas
const usuarioSesion = JSON.parse(localStorage.getItem("usuario_asir"));

if (
  !usuarioSesion &&
  !window.location.pathname.includes("acceso.html") &&
  window.location.pathname !== "/"
) {
  window.location.href = "/acceso.html";
}

if (usuarioSesion && window.location.pathname === "/") {
  window.location.href = "/alertas.html";
}

document.addEventListener("DOMContentLoaded", () => {
  if (usuarioSesion) {
    const lblNombre = document.getElementById("lblUsuarioNombre");
    const lblCorreo = document.getElementById("lblUsuarioCorreo");
    if (lblNombre) lblNombre.innerText = usuarioSesion.nombre || "Usuario";
    if (lblCorreo) lblCorreo.innerText = usuarioSesion.correo || "";
  }
});

function cerrarSesion() {
  localStorage.removeItem("usuario_asir");
  window.location.href = "/acceso.html";
}
