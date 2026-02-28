(function () {
  const KEY = "sidebar_collapsed";
  function setCollapsed(c) {
    document.documentElement.classList.toggle("sidebar-collapsed", c);
    localStorage.setItem(KEY, c ? "1" : "0");
  }
  document.addEventListener("DOMContentLoaded", () => {

    // Footer profesional (seguridad + autor)
    const ensureFooter = () => {
      if (document.querySelector(".app-footer")) return;
      const main = document.querySelector(".main .container") || document.querySelector(".main");
      if (!main) return;
      const year = new Date().getFullYear();
      const footer = document.createElement("footer");
      footer.className = "app-footer";
      footer.innerHTML = `
        <div class="left"><strong>Creado por</strong> JorgeArmandoRoblesM@gmail.com</div>
        <div class="right">© ${year} <strong>Logística</strong> — Acceso no autorizado será registrado y denunciado. <strong>Auditoría activa</strong>.</div>
      `;
      main.appendChild(footer);
    };

    setCollapsed(localStorage.getItem(KEY) === "1");
    const btn = document.querySelector("[data-sidebar-toggle]");
    if (btn) btn.addEventListener("click", () => {
      setCollapsed(!document.documentElement.classList.contains("sidebar-collapsed"));
    });

    const logoEl = document.querySelector(".logo");
    if (logoEl && !logoEl.querySelector("img")) {
      const img = document.createElement("img");
      img.src = "assets/logo.png";
      img.alt = "Logo";
      img.onerror = () => { logoEl.textContent = "✓"; };
      logoEl.appendChild(img);
    }
  });
})();
