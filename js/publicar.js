// js/publicar.js
// Lógica de creación de publicaciones

let misOcs        = [];
let ocSeleccionado = null;
let imagenes       = [null, null]; // [base64img1, base64img2]

// ============================================================
// INICIALIZACIÓN
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const usuario = localStorage.getItem("oc_usuario");
  const rol     = localStorage.getItem("oc_rol");

  const navNombre = document.getElementById("nav-nombre");
  const navRol    = document.getElementById("nav-rol");
  const navAdmin  = document.getElementById("nav-admin");
  if (navNombre) navNombre.textContent = usuario;
  if (navRol)    navRol.textContent    = rol;
  if (navAdmin)  navAdmin.style.display = rol === "admin" ? "flex" : "none";

  // Contador de título
  document.getElementById("input-titulo")?.addEventListener("input", function () {
    document.getElementById("contador-titulo").textContent = `${this.value.length}/100`;
  });

  await cargarOcsParaPublicar();
});

async function cargarOcsParaPublicar() {
  const usuario         = localStorage.getItem("oc_usuario");
  const cargandoEl      = document.getElementById("cargando-inicial");
  const formEl          = document.getElementById("form-publicar");
  const avisoEl         = document.getElementById("aviso-sin-ocs");

  try {
    misOcs = await API.get(`/ocs/${usuario}`);

    cargandoEl.style.display = "none";

    if (!misOcs || misOcs.length === 0) {
      avisoEl.style.display = "block";
      return;
    }

    formEl.style.display = "block";
    renderSelectorOc();

  } catch (err) {
    cargandoEl.innerHTML = `
      <div class="estado-vacio">
        <h3>Error</h3>
        <p>${err.mensaje || "No se pudieron cargar tus OCs."}</p>
        <button class="btn-primario" onclick="cargarOcsParaPublicar()">Reintentar</button>
      </div>`;
  }
}

// ============================================================
// SELECTOR DE OC VISUAL (tarjetas horizontales)
// ============================================================

function renderSelectorOc() {
  const contenedor = document.getElementById("selector-oc-pub");

  contenedor.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      ${misOcs.map(oc => `
        <div class="selector-oc-item" id="oc-selector-${oc.id}"
             onclick="seleccionarOc('${oc.id}')"
             style="flex:0 0 auto;min-width:140px;max-width:180px">
          <img class="selector-oc-img"
               src="${oc.foto ? API.imgUrl(oc.foto) : "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%2371767b' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 20c0-4 3.6-7 8-7s8 3 8 7'/%3E%3C/svg%3E"}"
               alt="${escHtml(oc.nombre)}"
               onerror="this.src='data:image/svg+xml,%3Csvg viewBox=\\'0 0 24 24\\' fill=\\'%2371767b\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Ccircle cx=\\'12\\' cy=\\'8\\' r=\\'4\\'/%3E%3Cpath d=\\'M4 20c0-4 3.6-7 8-7s8 3 8 7\\'/%3E%3C/svg%3E'" />
          <span class="selector-oc-nombre">
            ${escHtml(oc.nombre)}${oc.apellido ? " " + escHtml(oc.apellido) : ""}
          </span>
        </div>
      `).join("")}
    </div>
    <p id="aviso-oc" style="font-size:13px;color:var(--texto-secundario);margin-top:6px">
      Haz clic en el OC que firmará esta publicación.
    </p>`;

  // Si solo hay uno, seleccionarlo automáticamente
  if (misOcs.length === 1) seleccionarOc(misOcs[0].id);
}

function seleccionarOc(ocId) {
  ocSeleccionado = ocId;

  // Resaltar el OC seleccionado
  misOcs.forEach(oc => {
    const el = document.getElementById(`oc-selector-${oc.id}`);
    if (!el) return;
    if (oc.id === ocId) {
      el.style.borderColor = "var(--azul)";
      el.style.background  = "var(--azul-fondo)";
    } else {
      el.style.borderColor = "var(--borde)";
      el.style.background  = "";
    }
  });

  const aviso = document.getElementById("aviso-oc");
  const ocData = misOcs.find(o => o.id === ocId);
  if (aviso && ocData) {
    aviso.textContent = `✓ Publicando como: ${ocData.nombre}${ocData.apellido ? " " + ocData.apellido : ""}`;
    aviso.style.color = "var(--verde)";
  }
}

// ============================================================
// IMÁGENES
// ============================================================

async function previsualizarImagen(input, num) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    UTIL.toast("Solo se permiten imágenes", "error");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    UTIL.toast("La imagen no puede superar 8 MB", "error");
    return;
  }

  try {
    const base64 = await UTIL.fileABase64(file);
    imagenes[num - 1] = base64;

    const preview     = document.getElementById(`preview-img${num}`);
    const placeholder = document.getElementById(`placeholder-img${num}`);
    const btnQuitar   = document.getElementById(`btn-quitar-img${num}`);

    if (preview)     { preview.src = base64; preview.style.display = "block"; }
    if (placeholder)   placeholder.style.display = "none";
    if (btnQuitar)     btnQuitar.style.display = "block";

  } catch {
    UTIL.toast("Error al leer la imagen", "error");
  }
}

function quitarImagen(num) {
  imagenes[num - 1] = null;

  const preview     = document.getElementById(`preview-img${num}`);
  const placeholder = document.getElementById(`placeholder-img${num}`);
  const btnQuitar   = document.getElementById(`btn-quitar-img${num}`);
  const input       = document.getElementById(`input-img${num}`);

  if (preview)     { preview.src = ""; preview.style.display = "none"; }
  if (placeholder)   placeholder.style.display = "flex";
  if (btnQuitar)     btnQuitar.style.display = "none";
  if (input)         input.value = "";
}

// ============================================================
// PUBLICAR
// ============================================================

async function publicar() {
  const titulo   = document.getElementById("input-titulo").value.trim();
  const texto    = document.getElementById("input-texto").value.trim();
  const errorDiv = document.getElementById("pub-error");
  const btn      = document.getElementById("btn-publicar");
  const usuario  = localStorage.getItem("oc_usuario");

  errorDiv.textContent = "";

  // Validaciones
  if (!ocSeleccionado) {
    errorDiv.textContent = "Debes seleccionar un OC para publicar.";
    return;
  }
  if (!titulo) {
    errorDiv.textContent = "El título es obligatorio.";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Publicando…";

  // Construir body — solo incluir imágenes no nulas
  const imagenesASubir = imagenes.filter(Boolean);

  const body = {
    ocId: ocSeleccionado,
    titulo,
    texto,
    imagenes: imagenesASubir
  };

  try {
    await API.post(`/publicaciones/${usuario}`, body);
    UTIL.toast("¡Publicación creada!", "exito");

    // Redirigir al lobby tras un momento
    setTimeout(() => { window.location.href = "lobby.html"; }, 800);

  } catch (err) {
    errorDiv.textContent = err.mensaje || "Error al publicar. Intenta de nuevo.";
    btn.disabled    = false;
    btn.textContent = "Publicar";
  }
}

// ============================================================
// UTILIDADES CONTADOR
// ============================================================

function actualizarContadorTexto(el) {
  const contador = document.getElementById("contador-texto");
  if (contador) contador.textContent = `${el.value.length}/1000`;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
