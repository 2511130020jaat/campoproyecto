// ==========================================================================
// GESTOR GLOBAL DE TEMAS ASIR (Predeterminado / Oscuro / Claro)
// ==========================================================================

(function () {
  const CLAVE_TEMA = "asir_tema_visual";
  const TEMAS_VALIDOS = ["predeterminado", "oscuro", "claro"];

  function obtenerTemaGuardado() {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    return TEMAS_VALIDOS.includes(guardado) ? guardado : "predeterminado";
  }

  function aplicarTema(tema) {
    const limpio = TEMAS_VALIDOS.includes(tema) ? tema : "predeterminado";
    document.documentElement.setAttribute("data-theme", limpio);
    localStorage.setItem(CLAVE_TEMA, limpio);
    actualizarBotonesSelectorTema(limpio);
    window.dispatchEvent(
      new CustomEvent("asir:tema-cambiado", { detail: { tema: limpio } }),
    );
  }

  function actualizarBotonesSelectorTema(temaActivo) {
    document.querySelectorAll("[data-asir-theme-btn]").forEach((btn) => {
      const val = btn.getAttribute("data-asir-theme-btn");
      if (val === temaActivo) {
        btn.className =
          "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold bg-emerald-500 text-slate-950 shadow transition";
      } else {
        btn.className =
          "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition";
      }
    });
  }

  function crearBloqueSelectorHTML() {
    const div = document.createElement("div");
    div.id = "asirThemeSwitcherBox";
    div.className =
      "mx-3 my-2 p-2.5 rounded-xl border border-emerald-500/25 bg-slate-950/50 space-y-1.5";
    div.innerHTML = `
      <div class="flex items-center justify-between px-1">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">🎨 Apariencia</span>
      </div>
      <div class="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
        <button type="button" data-asir-theme-btn="predeterminado" onclick="cambiarTemaASIR('predeterminado')" title="Tema predeterminado ASIR">
          🌌 ASIR
        </button>
        <button type="button" data-asir-theme-btn="oscuro" onclick="cambiarTemaASIR('oscuro')" title="Modo oscuro neutro">
          🌑 Oscuro
        </button>
        <button type="button" data-asir-theme-btn="claro" onclick="cambiarTemaASIR('claro')" title="Modo claro para campo">
          ☀️ Claro
        </button>
      </div>
    `;
    return div;
  }

  function montarSelectorEnSidebar() {
    if (document.getElementById("asirThemeSwitcherBox")) {
      actualizarBotonesSelectorTema(obtenerTemaGuardado());
      return;
    }

    const sidebarCont = document.getElementById("sidebar-container");
    const aside = sidebarCont ? sidebarCont.querySelector("aside") : null;

    if (aside) {
      const nav = aside.querySelector("nav");
      const box = crearBloqueSelectorHTML();
      if (nav && nav.parentNode) {
        nav.parentNode.insertBefore(box, nav.nextSibling);
      } else {
        aside.appendChild(box);
      }
      actualizarBotonesSelectorTema(obtenerTemaGuardado());
    }
  }

  // Aplicar tema de inmediato antes del pintado para evitar parpadeos
  aplicarTema(obtenerTemaGuardado());

  window.cambiarTemaASIR = aplicarTema;

  document.addEventListener("DOMContentLoaded", () => {
    montarSelectorEnSidebar();
    const sidebarCont = document.getElementById("sidebar-container");
    if (sidebarCont) {
      const obs = new MutationObserver(() => montarSelectorEnSidebar());
      obs.observe(sidebarCont, { childList: true, subtree: true });
    }
  });
})();
