document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("sidebar-container");
  if (!container) return;

  const path = window.location.pathname;
  const esActivo = (p) =>
    path === p || (p === "/alertas.html" && path === "/")
      ? "asir-nav-active"
      : "asir-nav-item";

  container.innerHTML = `
    <style>
      #sidebar {
        background: var(--asir-sidebar-bg, #030507) !important;
        border-right: 1px solid var(--asir-border, #1a2d3a) !important;
      }
      #sidebar .asir-brand-title {
        color: var(--asir-primary, #00E5FF) !important;
        font-weight: 800;
        letter-spacing: 0.08em;
        font-size: 1rem;
      }
      #sidebar .asir-brand-sub {
        color: var(--asir-text-sub, #3d6070);
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.06em;
      }
      #sidebar .asir-nav-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 11px;
        border-radius: 10px;
        color: var(--asir-text-muted, #6b8fa0);
        font-size: 12.5px;
        font-weight: 500;
        text-decoration: none;
        transition: background 0.15s ease, color 0.15s ease;
        border: 1px solid transparent;
      }
      #sidebar .asir-nav-item:hover {
        background: var(--asir-sidebar-item, rgba(0,229,255,0.07));
        color: var(--asir-text, #e8f4f8);
        border-color: var(--asir-border, #1a2d3a);
      }
      #sidebar .asir-nav-active {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 11px;
        border-radius: 10px;
        color: var(--asir-primary, #00E5FF);
        font-size: 12.5px;
        font-weight: 700;
        text-decoration: none;
        background: var(--asir-primary-dim, rgba(0,229,255,0.09));
        border: 1px solid rgba(0,229,255,0.2);
        box-shadow: 0 0 10px rgba(0,229,255,0.07);
      }
      #sidebar .asir-sidebar-divider { border-color: var(--asir-border, #1a2d3a) !important; flex-shrink: 0; }
      #sidebar .asir-sidebar-footer { border-top: 1px solid var(--asir-border, #1a2d3a); padding: 10px 12px; }
      #sidebar .asir-user-name {
        color: var(--asir-text, #e8f4f8);
        font-weight: 700;
        font-size: 12.5px;
      }
      #sidebar .asir-user-email {
        color: var(--asir-text-sub, #3d6070);
        font-size: 11px;
      }
      #sidebar .asir-logout-btn {
        padding: 7px 9px;
        background: transparent;
        border: 1px solid var(--asir-border, #1a2d3a);
        border-radius: 8px;
        color: var(--asir-text-muted, #6b8fa0);
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
        font-size: 14px;
      }
      #sidebar .asir-logout-btn:hover {
        background: rgba(220, 38, 38, 0.12);
        color: #f87171;
        border-color: rgba(220,38,38,0.3);
      }
    </style>
    <aside id="sidebar" class="w-56 flex flex-col justify-between fixed lg:sticky top-0 inset-y-0 left-0 z-50 transform -translate-x-full lg:translate-x-0 transition-transform duration-300 h-screen overflow-y-auto shrink-0 select-none">
      <div>
        <div class="p-3.5 asir-sidebar-divider border-b flex items-center gap-2.5">
          <img
  src="/img/logo-asir.png"
  class="w-9 h-9 rounded-lg object-contain shrink-0"
/>
          <div>
            <h1 class="asir-brand-title">ASIR</h1>
            <p class="asir-brand-sub">AGRO SIN RIESGO</p>
          </div>
        </div>

        <nav class="p-3 space-y-1 text-sm">
          <a href="/alertas.html" class="${esActivo("/alertas.html")}">
            <span>📰</span> Actualidad y Boletines
          </a>
          <a href="/clima.html" class="${esActivo("/clima.html")}">
            <span>🌦️</span> Pronóstico y Alertas
          </a>
          <a href="/parcelas.html" class="${esActivo("/parcelas.html")}">
            <span>🗺️</span> Vista de Campo
          </a>
          <a href="/gestion-parcelas.html" class="${esActivo("/gestion-parcelas.html")}">
            <span>🧭</span> Gestor de Parcelas
          </a>
          <a href="/panel.html" class="${esActivo("/panel.html")}">
            <span>📡</span> Sensores en Vivo
          </a>
          <a href="/diseno2d.html" class="${esActivo("/diseno2d.html")}">
            <span>📐</span> Diseñador 2D e IO
          </a>
          <a href="/riego.html" class="${esActivo("/riego.html")}">
            <span>💧</span> Control de Riego
          </a>
          <a href="/reportes.html" class="${esActivo("/reportes.html")}">
            <span>📈</span> Reportes y Exportación
          </a>
        </nav>
      </div>

      <div class="asir-sidebar-footer">
        <div class="flex items-center justify-between">
          <div>
            <p id="lblUsuarioNombre" class="asir-user-name">Usuario</p>
            <p id="lblUsuarioCorreo" class="asir-user-email">...</p>
          </div>
          <button onclick="cerrarSesion()" title="Cerrar Sesión" class="asir-logout-btn">
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
