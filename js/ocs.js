// js/ocs.js
// Gestión completa de OCs — crear, listar, editar, eliminar

let ocEditandoId = null;   // ID del OC en edición (null = modo crear)
let ocEliminandoId = null; // ID del OC a eliminar
let fotoBase64 = null;     // Foto en base64 para subir
let misOcs = [];           // Cache local de OCs

// ============================================================
// INICIALIZACIÓN
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const usuario = localStorage.getItem("oc_usuario");
  const rol     = localStorage.getItem("oc_rol");

  const navNombre = document.getElementById("nav-nombre");
  const navRol    = document.getElementById("nav-rol");
  const navAdmin  = document.getElementById("nav-admin");
  if (navNombre) navNombre.textContent = usuario;
  if (navRol)    navRol.textContent    = rol;
  if (navAdmin)  navAdmin.style.display = rol === "admin" ? "flex" : "none";

  cargarOcs();
});

// ============================================================
// CARGA Y RENDERIZADO
// ============================================================

async function cargarOcs() {
  const usuario     = localStorage.getItem("oc_usuario");
  const contenedor  = document.getElementById("lista-ocs");
  contenedor.innerHTML = `<div class="cargando"><div class="spinner"></div></div>`;

  try {
    misOcs = await API.get(`/ocs/${usuario}`);

    if (!misOcs || misOcs.length === 0) {
      contenedor.innerHTML = `
        <div class="estado-vacio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          <h3>Sin OCs todavía</h3>
          <p>Crea tu primer personaje original para empezar a publicar.</p>
          <button class="btn-primario" onclick="abrirModalCrear()">+ Crear mi primer OC</button>
        </div>`;
      return;
    }

    contenedor.innerHTML = misOcs.map(oc => renderOcCard(oc)).join("");

  } catch (err) {
    contenedor.innerHTML = `
      <div class="estado-vacio">
        <h3>Error al cargar OCs</h3>
        <p>${err.mensaje || "Intenta de nuevo."}</p>
        <button class="btn-primario" onclick="cargarOcs()">Reintentar</button>
      </div>`;
  }
}

function renderOcCard(oc) {
  const avatarUrl = oc.foto
    ? API.imgUrl(oc.foto)
    : "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%2371767b' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 20c0-4 3.6-7 8-7s8 3 8 7'/%3E%3C/svg%3E";

  const nombreCompleto = `${escHtml(oc.nombre)}${oc.apellido ? " " + escHtml(oc.apellido) : ""}`;

  return `
    <div class="oc-card" id="oc-card-${oc.id}">
      <img class="oc-card-avatar"
           src="${avatarUrl}"
           alt="${nombreCompleto}"
           loading="lazy"
           onerror="this.src='data:image/svg+xml,%3Csvg viewBox=\\'0 0 24 24\\' fill=\\'%2371767b\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Ccircle cx=\\'12\\' cy=\\'8\\' r=\\'4\\'/%3E%3Cpath d=\\'M4 20c0-4 3.6-7 8-7s8 3 8 7\\'/%3E%3C/svg%3E'" />

      <div class="oc-card-info">
        <div class="oc-card-nombre">${nombreCompleto}</div>
        ${oc.descripcion
          ? `<div class="oc-card-desc">${escHtml(oc.descripcion)}</div>`
          : `<div class="oc-card-desc" style="font-style:italic;opacity:0.5">Sin descripción</div>`
        }
      </div>

      <div class="oc-card-acciones">
        <button class="btn-icono" onclick="abrirModalEditar('${oc.id}')" title="Editar OC">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icono" onclick="abrirModalEliminar('${oc.id}')" title="Eliminar OC"
                style="color:var(--rojo)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// ============================================================
// MODAL CREAR
// ============================================================

function abrirModalCrear() {
  ocEditandoId = null;
  fotoBase64   = null;

  document.getElementById("modal-oc-titulo").textContent = "Nuevo OC";
  document.getElementById("input-oc-nombre").value       = "";
  document.getElementById("input-oc-apellido").value     = "";
  document.getElementById("input-oc-desc").value         = "";
  document.getElementById("modal-oc-error").textContent  = "";
  document.getElementById("btn-guardar-oc").textContent  = "Crear OC";
  document.getElementById("preview-foto-oc").src =
    "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%2371767b' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 20c0-4 3.6-7 8-7s8 3 8 7'/%3E%3C/svg%3E";
  document.getElementById("input-foto-oc").value = "";

  document.getElementById("modal-oc").style.display = "flex";
  setTimeout(() => document.getElementById("input-oc-nombre").focus(), 100);
}

// ============================================================
// MODAL EDITAR
// ============================================================

function abrirModalEditar(ocId) {
  const oc = misOcs.find(o => o.id === ocId);
  if (!oc) return;

  ocEditandoId = ocId;
  fotoBase64   = null;

  document.getElementById("modal-oc-titulo").textContent  = "Editar OC";
  document.getElementById("input-oc-nombre").value        = oc.nombre;
  document.getElementById("input-oc-apellido").value      = oc.apellido || "";
  document.getElementById("input-oc-desc").value          = oc.descripcion || "";
  document.getElementById("modal-oc-error").textContent   = "";
  document.getElementById("btn-guardar-oc").textContent   = "Guardar cambios";
  document.getElementById("input-foto-oc").value          = "";

  const preview = document.getElementById("preview-foto-oc");
  preview.src = oc.foto
    ? API.imgUrl(oc.foto)
    : "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%2371767b' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 20c0-4 3.6-7 8-7s8 3 8 7'/%3E%3C/svg%3E";

  document.getElementById("modal-oc").style.display = "flex";
  setTimeout(() => document.getElementById("input-oc-nombre").focus(), 100);
}

function cerrarModalOc(e) {
  if (!e || e.target === document.getElementById("modal-oc")) {
    document.getElementById("modal-oc").style.display = "none";
    ocEditandoId = null;
    fotoBase64   = null;
  }
}

// ============================================================
// PREVISUALIZAR FOTO
// ============================================================

async function previsualizarFotoOc(input) {
  const file = input.files[0];
  if (!file) return;

  // Validar tipo y tamaño (máx 5 MB)
  if (!file.type.startsWith("image/")) {
    UTIL.toast("Solo se permiten imágenes", "error");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    UTIL.toast("La imagen no puede superar 5 MB", "error");
    return;
  }

  try {
    fotoBase64 = await UTIL.fileABase64(file);
    document.getElementById("preview-foto-oc").src = fotoBase64;
  } catch {
    UTIL.toast("Error al leer la imagen", "error");
  }
}

// ============================================================
// GUARDAR (crear o editar)
// ============================================================

async function guardarOc() {
  const nombre    = document.getElementById("input-oc-nombre").value.trim();
  const apellido  = document.getElementById("input-oc-apellido").value.trim();
  const desc      = document.getElementById("input-oc-desc").value.trim();
  const errorDiv  = document.getElementById("modal-oc-error");
  const btn       = document.getElementById("btn-guardar-oc");
  const usuario   = localStorage.getItem("oc_usuario");

  errorDiv.textContent = "";

  if (!nombre) {
    errorDiv.textContent = "El nombre del OC es obligatorio.";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Guardando…";

  const body = { nombre, apellido, descripcion: desc };
  if (fotoBase64) body.foto = fotoBase64;

  try {
    if (ocEditandoId) {
      // ── EDITAR ──
      await API.put(`/ocs/${usuario}/${ocEditandoId}`, body);
      UTIL.toast("OC actualizado correctamente", "exito");
    } else {
      // ── CREAR ──
      await API.post(`/ocs/${usuario}`, body);
      UTIL.toast("OC creado correctamente", "exito");
    }

    cerrarModalOc();
    await cargarOcs(); // Recargar lista

  } catch (err) {
    errorDiv.textContent = err.mensaje || "Error al guardar el OC.";
  } finally {
    btn.disabled    = false;
    btn.textContent = ocEditandoId ? "Guardar cambios" : "Crear OC";
  }
}

// ============================================================
// ELIMINAR
// ============================================================

function abrirModalEliminar(ocId) {
  const oc = misOcs.find(o => o.id === ocId);
  if (!oc) return;

  ocEliminandoId = ocId;
  const nombreCompleto = `${oc.nombre}${oc.apellido ? " " + oc.apellido : ""}`;
  document.getElementById("confirmar-oc-nombre").textContent = nombreCompleto;
  document.getElementById("modal-confirmar").style.display = "flex";
}

function cerrarModalConfirmar(e) {
  if (!e || e.target === document.getElementById("modal-confirmar")) {
    document.getElementById("modal-confirmar").style.display = "none";
    ocEliminandoId = null;
  }
}

async function ejecutarEliminarOc() {
  if (!ocEliminandoId) return;

  const usuario = localStorage.getItem("oc_usuario");
  const btn     = document.getElementById("btn-confirmar-del");
  btn.disabled  = true;
  btn.textContent = "Eliminando…";

  try {
    await API.delete(`/ocs/${usuario}/${ocEliminandoId}`);
    UTIL.toast("OC eliminado", "exito");
    cerrarModalConfirmar();
    await cargarOcs();
  } catch (err) {
    UTIL.toast(err.mensaje || "Error al eliminar el OC", "error");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Sí, eliminar";
    ocEliminandoId  = null;
  }
}

// ============================================================
// UTILIDAD
// ============================================================

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
