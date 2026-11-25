// ==========================================================================
// GESTOR GLOBAL DE TEMAS ASIR (Predeterminado / Oscuro / Claro)
// Control desplegable minimalista (Dropdown popover)
// ==========================================================================

(function () {
  const CLAVE_TEMA = "asir_tema_visual";
  const TEMAS_VALIDOS = ["predeterminado", "oscuro", "claro"];

  const INFO_TEMAS = {
    predeterminado: { nombre: "ASIR Dark", icono: "🌱", color: "#2CC56A" },
    oscuro:         { nombre: "Oscuro Neutro", icono: "🌑", color: "#94a3b8" },
    claro:          { nombre: "Modo Claro", icono: "☀️", color: "#f59e0b" }
  };

  function obtenerTemaGuardado() {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    return TEMAS_VALIDOS.includes(guardado) ? guardado : "predeterminado";
  }

  function aplicarTema(tema) {
    const limpio = TEMAS_VALIDOS.includes(tema) ? tema : "predeterminado";
    document.documentElement.setAttribute("data-theme", limpio);
    localStorage.setItem(CLAVE_TEMA, limpio);
    actualizarBotonPillActivo(limpio);
    window.dispatchEvent(
      new CustomEvent("asir:tema-cambiado", { detail: { tema: limpio } }),
    );
  }

  function actualizarBotonPillActivo(temaActivo) {
    const txt = document.getElementById("asirTxtTemaActual");
    const ico = document.getElementById("asirIcoTemaActual");
    const info = INFO_TEMAS[temaActivo] || INFO_TEMAS.predeterminado;

    if (txt) txt.textContent = info.nombre;
    if (ico) ico.textContent = info.icono;

    document.querySelectorAll(".asir-opcion-tema").forEach((opt) => {
      const t = opt.getAttribute("data-val-tema");
      const check = opt.querySelector(".asir-check-tema");
      if (t === temaActivo) {
        opt.style.background = "rgba(44, 197, 106, 0.12)";
        opt.style.color = "#2CC56A";
        if (check) check.style.opacity = "1";
      } else {
        opt.style.background = "transparent";
        opt.style.color = "#a1b2a7";
        if (check) check.style.opacity = "0";
      }
    });
  }

  function alternarMenuTema(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById("asirMenuDesplegableTema");
    if (!menu) return;
    const estaAbierto = menu.style.display === "block";
    menu.style.display = estaAbierto ? "none" : "block";
  }

  function cerrarMenuTema() {
    const menu = document.getElementById("asirMenuDesplegableTema");
    if (menu) menu.style.display = "none";
  }

  function crearBloqueSelectorHTML() {
    const contenedor = document.createElement("div");
    contenedor.id = "asirThemeSwitcherBox";
    contenedor.style.cssText = "position:relative;margin:8px 10px;font-family:'Inter',sans-serif;";

    contenedor.innerHTML = `
      <!-- Botón Pill Desplegable Minimalista -->
      <button
        type="button"
        id="asirBtnTemaTrigger"
        onclick="window.asirAlternarMenuTema(event)"
        style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#0d1410;border:1px solid #1a2c20;border-radius:10px;cursor:pointer;color:#cde0d4;font-size:11.5px;font-weight:600;transition:all 0.15s ease;"
        onmouseover="this.style.borderColor='rgba(44,197,106,0.4)';this.style.background='#121c16'"
        onmouseout="this.style.borderColor='#1a2c20';this.style.background='#0d1410'"
      >
        <span style="display:flex;align-items:center;gap:7px;">
          <span id="asirIcoTemaActual" style="font-size:13px;">🌱</span>
          <span id="asirTxtTemaActual">ASIR Dark</span>
        </span>
        <span style="font-size:9px;color:#5a7765;">▲▼</span>
      </button>

      <!-- Menú Flotante hacia arriba (Pop-up) -->
      <div
        id="asirMenuDesplegableTema"
        style="display:none;position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:#0a110d;border:1px solid #1f3527;border-radius:12px;padding:5px;box-shadow:0 -8px 24px rgba(0,0,0,0.65);z-index:9999;"
      >
        <div style="padding:4px 8px 6px;font-size:10px;font-weight:700;color:#456651;text-transform:uppercase;letter-spacing:0.06em;">
          Apariencia
        </div>

        <div
          class="asir-opcion-tema"
          data-val-tema="predeterminado"
          onclick="window.asirSeleccionarTema('predeterminado')"
          style="display:flex;align-items:center;justify-content:space-between;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:11.5px;font-weight:600;transition:all 0.15s ease;margin-bottom:2px;"
          onmouseover="if(this.getAttribute('data-val-tema')!==localStorage.getItem('asir_tema_visual'))this.style.background='rgba(255,255,255,0.05)'"
          onmouseout="if(this.getAttribute('data-val-tema')!==localStorage.getItem('asir_tema_visual'))this.style.background='transparent'"
        >
          <span style="display:flex;align-items:center;gap:7px;">
            <span>🌱</span> ASIR Dark
          </span>
          <span class="asir-check-tema" style="font-size:11px;color:#2CC56A;opacity:0;">✓</span>
        </div>

        <div
          class="asir-opcion-tema"
          data-val-tema="oscuro"
          onclick="window.asirSeleccionarTema('oscuro')"
          style="display:flex;align-items:center;justify-content:space-between;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:11.5px;font-weight:600;transition:all 0.15s ease;margin-bottom:2px;"
          onmouseover="if(this.getAttribute('data-val-tema')!==localStorage.getItem('asir_tema_visual'))this.style.background='rgba(255,255,255,0.05)'"
          onmouseout="if(this.getAttribute('data-val-tema')!==localStorage.getItem('asir_tema_visual'))this.style.background='transparent'"
        >
          <span style="display:flex;align-items:center;gap:7px;">
            <span>🌑</span> Oscuro Neutro
          </span>
          <span class="asir-check-tema" style="font-size:11px;color:#2CC56A;opacity:0;">✓</span>
        </div>

        <div
          class="asir-opcion-tema"
          data-val-tema="claro"
          onclick="window.asirSeleccionarTema('claro')"
          style="display:flex;align-items:center;justify-content:space-between;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:11.5px;font-weight:600;transition:all 0.15s ease;"
          onmouseover="if(this.getAttribute('data-val-tema')!==localStorage.getItem('asir_tema_visual'))this.style.background='rgba(255,255,255,0.05)'"
          onmouseout="if(this.getAttribute('data-val-tema')!==localStorage.getItem('asir_tema_visual'))this.style.background='transparent'"
        >
          <span style="display:flex;align-items:center;gap:7px;">
            <span>☀️</span> Modo Claro
          </span>
          <span class="asir-check-tema" style="font-size:11px;color:#2CC56A;opacity:0;">✓</span>
        </div>
      </div>
    `;

    return contenedor;
  }

  let yaMontado = false;
  function montarSelectorEnSidebar() {
    if (yaMontado || document.getElementById("asirThemeSwitcherBox")) {
      actualizarBotonPillActivo(obtenerTemaGuardado());
      return;
    }

    const sidebarCont = document.getElementById("sidebar-container");
    const aside = sidebarCont ? sidebarCont.querySelector("aside") : null;

    if (aside) {
      const footer = aside.querySelector(".asir-sidebar-footer");
      const box = crearBloqueSelectorHTML();
      if (footer && footer.parentNode) {
        footer.parentNode.insertBefore(box, footer);
        yaMontado = true;
      } else {
        aside.appendChild(box);
        yaMontado = true;
      }
      actualizarBotonPillActivo(obtenerTemaGuardado());
    }
  }

  // Métodos expuestos para HTML onclick
  window.cambiarTemaASIR = aplicarTema;
  window.asirAlternarMenuTema = alternarMenuTema;
  window.asirSeleccionarTema = function (t) {
    aplicarTema(t);
    cerrarMenuTema();
  };

  // Cerrar dropdown si se hace clic fuera
  document.addEventListener("click", (e) => {
    const box = document.getElementById("asirThemeSwitcherBox");
    if (box && !box.contains(e.target)) {
      cerrarMenuTema();
    }
  });

  // Aplicar tema de inmediato
  aplicarTema(obtenerTemaGuardado());

  document.addEventListener("DOMContentLoaded", () => {
    montarSelectorEnSidebar();

    // Si aún no está listo el aside (por carga diferida de sidebar.js), intentar en pulsos controlados sin bucle infinito
    let intentos = 0;
    const timer = setInterval(() => {
      intentos++;
      montarSelectorEnSidebar();
      if (yaMontado || intentos > 20) {
        clearInterval(timer);
      }
    }, 100);
  });
})();
