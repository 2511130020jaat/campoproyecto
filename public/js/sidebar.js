document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("sidebar-container");
  if (!container) return;

  const path = window.location.pathname;
  const esActivo = (p) =>
    path === p || (p === "/alertas.html" && path === "/")
      ? "bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20"
      : "text-slate-400 hover:bg-slate-750 hover:text-slate-200 transition";

  container.innerHTML = `
    <aside id="sidebar" class="w-64 bg-slate-800 border-r border-slate-700 flex flex-col justify-between fixed lg:static inset-y-0 left-0 z-50 transform -translate-x-full lg:translate-x-0 transition-transform duration-300 h-screen">
      <div>
        <div class="p-5 border-b border-slate-700 flex items-center gap-3">
          <span class="text-3xl">🌱</span>
          <div>
            <h1 class="font-extrabold text-sky-400 tracking-wider">ASIR</h1>
            <p class="text-[10px] text-slate-400 font-medium">AGRO SIN RIESGO</p>
          </div>
        </div>

        <nav class="p-4 space-y-2 text-sm">
          <a href="/alertas.html" class="flex items-center gap-3 px-4 py-3 rounded-xl ${esActivo("/alertas.html")}">
            <span>🚨</span> Alertas Agroclimáticas
          </a>
          <a href="/panel.html" class="flex items-center gap-3 px-4 py-3 rounded-xl ${esActivo("/panel.html")}">
            <span>📊</span> Monitoreo en Vivo
          </a>
          <a href="/diseno2d.html" class="flex items-center gap-3 px-4 py-3 rounded-xl ${esActivo("/diseno2d.html")}">
            <span>📐</span> Diseñador 2D e IO
          </a>
          <a href="/riego.html" class="flex items-center gap-3 px-4 py-3 rounded-xl ${esActivo("/riego.html")}">
            <span>💧</span> Control de Riego
          </a>
          <a href="/parcelas.html" class="flex items-center gap-3 px-4 py-3 rounded-xl ${esActivo("/parcelas.html")}">
            <span>🗺️</span> Gestor de Parcelas
          </a>
          <a href="/reportes.html" class="flex items-center gap-3 px-4 py-3 rounded-xl ${esActivo("/reportes.html")}">
            <span>📈</span> Reportes y Exportación
          </a>
        </nav>
      </div>

      <div class="p-4 border-t border-slate-700 text-xs text-slate-400 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <p id="lblUsuarioNombre" class="font-bold text-slate-200 text-sm">Usuario</p>
            <p id="lblUsuarioCorreo" class="text-[11px] text-slate-500">...</p>
          </div>
          <button onclick="cerrarSesion()" title="Cerrar Sesión" class="p-2 bg-slate-900 hover:bg-rose-600/20 hover:text-rose-400 rounded-lg transition text-slate-400">
            🚪
          </button>
        </div>
      </div>
    </aside>
  `;

  const btnMenu = document.getElementById("btnMenu");
  if (btnMenu) {
    btnMenu.addEventListener("click", () => {
      const sidebar = document.getElementById("sidebar");
      if (sidebar) sidebar.classList.toggle("-translate-x-full");
    });
  }
});
