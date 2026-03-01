function esc(s){
  return String(s??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

async function loadLinks(){
  const r = await fetch("config/links.json", { cache: "no-cache" });
  const links = r.ok ? await r.json() : [];
  const wrap = document.querySelector("#links");

  if(!Array.isArray(links) || links.length === 0){
    wrap.innerHTML = `<div class="card"><h2>Sin enlaces</h2><p>Edita <code>web/config/links.json</code></p></div>`;
    return;
  }

  wrap.innerHTML = links.map(l => `
    <div class="card" style="padding:14px;">
      <h2 style="font-size:14px;margin:0 0 6px;">${esc(l.title)}</h2>
      <p style="margin:0;color:var(--muted)">${esc(l.desc||"")}</p>
      <div style="height:10px"></div>
      <a class="pill" href="${esc(l.url)}" target="_blank" rel="noopener">Abrir</a>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => loadLinks().catch(() => {}));
