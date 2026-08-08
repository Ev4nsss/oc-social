// js/admin.js
// Panel de administración — OC Social

let usuariosActuales = []; // cache de usuarios (sin contraseñas)
let usuarioAEliminar = null;

// ============================================================
// INICIALIZACIÓN
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const usuario = localStorage.getItem("oc_usuario");
  const rol     = localStorage.getItem("oc_rol");

  // Redirigir si no es admin
  if (rol !== "admin") {
    UTIL.toast("Acceso denegado. Solo administradores.", "error");
    window.location.href = "lobby.html";
    return;
  }

  const navNombre = document.getElementById("nav-nombre");
  const navRol    = document.getElementById("nav-rol");
  if (navNombre) navNombre.textContent = usuario;
  if (navRol)    navRol.textContent    = rol;

  // Mostrar lista de usuarios
  await cargarUsuarios();
});

// ============================================================
// TABS
// ============================================================

function cambiarTab(pestania) {
  // Activar tab visual
  document.getElementById("tab-lista").classList.toggle("activo", pestania === "lista");
  document.getElementById("tab-nuevo").classList.toggle("activo", pestania === "nuevo");

  // Mostrar panel correspondiente
  document.getElementById("panel-lista").style.display  = pestania === "lista" ? "block" : "none";
  document.getElementById("panel-nuevo").style.display = pestania === "nuevo" ? "block" : "none";
}

// ============================================================
// CARGA DE USUARIOS
// ============================================================

async function cargarUsuarios() {
  const contenedor = document.getElementById("lista-usuarios");
  contenedor.innerHTML = `<div class="cargando"><div class="spinner"></div></div>`;

  try {
    usuariosActuales = await API.get("/admin/usuarios");
    renderUsuarios();
  } catch (err) {
    contenedor.innerHTML = `
      <div class="estado-vacio">
        <h3>Error al cargar usuarios</h3>
        <p>${err.mensaje || "No tienes permisos o falló la conexión."}</p>
        <button class="btn-primario" onclick="cargarUsuarios()">Reintentar</button>
      </div>`;
  }
}

function renderUsuarios() {
  const contenedor = document.getElementById("lista-usuarios");

  if (!usuariosActuales || usuariosActuales.length === 0) {
    contenedor.innerHTML = `
      <div class="estado-vacio">
        <h3>Sin usuarios</h3>
        <p>Algo salió mal, debería haber al menos Evancito.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = usuariosActuales.map(u => `
    <div class="oc-card" id="usuario-${escHtml(u.nombre)}">
      <div class="oc-card-avatar" style="background:var(--bg-hover);display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="var(--texto-secundario)">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      </div>
      <div class="oc-card-info">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div class="oc-card-nombre" style="margin-bottom:0">${escHtml(u.nombre)}</div>
          ${u.rol === "admin" ? '<span class="badge badge-admin">Admin</span>' : ""}
          ${u.activo === false ? '<span class="badge badge-suspendido">Suspendido</span>' : ""}
        </div>
        <div style="color:var(--texto-secundario);font-size:13px">
          Rol: ${escHtml(u.rol)} · Estado: ${u.activo ? "Activo" : "Suspendido"}
        </div>
      </div>
      <div class="oc-card-acciones" style="flex-direction:column;gap:6px">
        ${u.nombre !== "Evancito" ? `
          <button class="btn-secundario" style="padding:6px 12px;font-size:13px;width:100%"
              onclick="toggleSuspender('${escHtml(u.nombre)}', ${!u.activo})">
            ${u.activo ? "Suspender" : "Reactivar"}
          </button>
          <button class="btn-peligro" style="padding:6px 12px;font-size:13px;width:100%"
              onclick="confirmarEliminar('${escHtml(u.nombre)}')">
            Eliminar
          </button>
        ` : `
          <span style="color:var(--texto-secundario);font-size:12px">Admin principal</span>
        `}
      </div>
    </div>`).join("");
}

// ============================================================
// CREAR USUARIO
// ============================================================

async function crearUsuario() {
  const nombre    = document.getElementById("input-nuevo-nombre").value.trim();
  const pass      = document.getElementById("input-nuevo-pass").value.trim();
  const errorDiv  = document.getElementById("error-nuevo");
  const btn       = document.getElementById("btn-crear-usuario");

  errorDiv.textContent = "";

  if (!nombre || !pass) {
    errorDiv.textContent = "Nombre y contraseña son obligatorios.";
    return;
  }
  if (nombre.length < 3) {
    errorDiv.textContent = "El nombre debe tener al menos 3 caracteres.";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Creando…";

  try {
    await API.post("/admin/usuarios", { nombre, contraseña: pass });
    UTIL.toast(`Usuario "${nombre}" creado`, "exito");

    // Limpiar campos
    document.getElementById("input-nuevo-nombre").value = "";
    document.getElementById("input-nuevo-pass").value   = "";

    // Volver a la lista
    cambiarTab("lista");
    await cargarUsuarios();

  } catch (err) {
    errorDiv.textContent = err.mensaje || "Error al crear usuario.";
  } finally {
    btn.disabled    = false;
    btn.textContent = "Crear usuario";
  }
}

// ============================================================
// SUSPENDER / REACTIVAR
// ============================================================

async function toggleSuspender(nombreUsuario, reactivar) {
  const accion = reactivar ? "reactivar" : "suspender";
  if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} a ${nombreUsuario}?`)) return;

  try {
    await API.put(`/admin/usuarios/${nombreUsuario}`, { activo: reactivar });
    UTIL.toast(`Usuario ${reactivar ? "reactivado" : "suspendido"}`, "exito");
    await cargarUsuarios();
  } catch (err) {
    UTIL.toast(err.mensaje || "Error", "error");
  }
}

// ============================================================
// ELIMINAR USUARIO
// ============================================================

function confirmarEliminar(nombreUsuario) {
  usuarioAEliminar = nombreUsuario;
  document.getElementById("confirmar-usuario-nombre").textContent = nombreUsuario;
  document.getElementById("modal-confirmar-del").style.display = "flex";
}

function cerrarModalConfirmar(e) {
  if (!e || e.target === document.getElementById("modal-confirmar-del")) {
    document.getElementById("modal-confirmar-del").style.display = "none";
    usuarioAEliminar = null;
  }
}

async function ejecutarEliminarUsuario() {
  if (!usuarioAEliminar) return;

  const btn = document.getElementById("btn-confirmar-del-usuario");
  btn.disabled  = true;
  btn.textContent = "Eliminando…";

  try {
    await API.delete(`/admin/usuarios/${usuarioAEliminar}`);
    UTIL.toast("Usuario eliminado", "exito");
    cerrarModalConfirmar();
    await cargarUsuarios();
  } catch (err) {
    UTIL.toast(err.mensaje || "Error al eliminar", "error");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Sí, eliminar";
    usuarioAEliminar = null;
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
