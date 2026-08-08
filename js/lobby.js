// js/lobby.js
// Lógica del feed/timeline — OC Social

let misOcs = [];           // OCs del usuario actual
let accionPendiente = null; // { tipo: "like"|"comentario", datos: {...} }
let pubsCache = [];         // Cache de publicaciones para operaciones

// ============================================================
// INICIALIZACIÓN
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const usuario = localStorage.getItem("oc_usuario");
  const rol     = localStorage.getItem("oc_rol");

  // Mostrar nombre en sidebar
  const navNombre = document.getElementById("nav-nombre");
  const navRol    = document.getElementById("nav-rol");
  const navAdmin  = document.getElementById("nav-admin");
  if (navNombre) navNombre.textContent = usuario;
  if (navRol)    navRol.textContent    = rol;
  if (navAdmin)  navAdmin.style.display = rol === "admin" ? "flex" : "none";

  // Cargar OCs propios (para likes/comentarios)
  await cargarMisOcs();

  // Cargar feed
  await cargarFeed();
});

async function cargarMisOcs() {
  const usuario = localStorage.getItem("oc_usuario");
  try {
    misOcs = await API.get(`/ocs/${usuario}`);
  } catch {
    misOcs = [];
  }
}

// ============================================================
// CARGA Y RENDERIZADO DEL FEED
// ============================================================

async function cargarFeed() {
  const contenedor = document.getElementById("feed-contenido");
  contenedor.innerHTML = `<div class="cargando"><div class="spinner"></div></div>`;

  try {
    const pubs = await API.get("/publicaciones");
    pubsCache = pubs;

    if (!pubs || pubs.length === 0) {
      contenedor.innerHTML = `
        <div class="estado-vacio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <h3>Sin publicaciones</h3>
          <p>Sé el primero en publicar con tus OCs.</p>
          <a href="publicar.html" class="btn-primario">Crear publicación</a>
        </div>`;
      return;
    }

    contenedor.innerHTML = pubs.map(pub => renderPublicacion(pub)).join("");

  } catch (err) {
    contenedor.innerHTML = `
      <div class="estado-vacio">
        <h3>Error al cargar</h3>
        <p>${err.mensaje || "No se pudo cargar el feed."}</p>
        <button class="btn-primario" onclick="cargarFeed()">Reintentar</button>
      </div>`;
  }
}

function renderPublicacion(pub) {
  const miUsuario = localStorage.getItem("oc_usuario");
  const esAutor   = pub.autorUsuario === miUsuario;
  const esAdmin   = localStorage.getItem("oc_rol") === "admin";

  // Avatar del OC autor
  const avatarUrl = pub.ocAutor?.foto
    ? API.imgUrl(pub.ocAutor.foto)
    : "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%2371767b' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 20c0-4 3.6-7 8-7s8 3 8 7'/%3E%3C/svg%3E";

  const nombreCompleto = pub.ocAutor
    ? `${pub.ocAutor.nombre}${pub.ocAutor.apellido ? " " + pub.ocAutor.apellido : ""}`
    : "OC eliminado";

  // ¿Alguno de mis OCs ya dio like?
  const miLikeOcId = misOcs.find(o => pub.likes.includes(o.id))?.id;
  const tieneLike  = !!miLikeOcId;

  // Imágenes
  const imgHtml = pub.imagenes?.length > 0 ? `
    <div class="pub-imagenes ${pub.imagenes.length === 1 ? "uno" : "dos"}">
      ${pub.imagenes.map(ruta => `
        <img class="pub-img" src="${API.imgUrl(ruta)}" alt="Imagen de publicación"
             loading="lazy" onclick="verImagenGrande('${API.imgUrl(ruta)}')" />
      `).join("")}
    </div>` : "";

  // Comentarios
  const comentariosHtml = pub.comentarios?.length > 0 ? `
    <div class="pub-comentarios">
      ${pub.comentarios.slice(0, 2).map(c => renderComentario(c, pub.id, pub.autorUsuario)).join("")}
      ${pub.comentarios.length > 2 ? `
        <button class="pub-accion-btn" onclick="verTodosComentarios('${pub.id}', '${pub.autorUsuario}')">
          Ver los ${pub.comentarios.length} comentarios
        </button>` : ""}
    </div>` : "";

  return `
    <article class="publicacion" data-pub-id="${pub.id}" data-pub-usuario="${pub.autorUsuario}">
      <!-- Avatar -->
      <div class="pub-avatar-col">
        <div class="pub-avatar">
          <img src="${avatarUrl}" alt="${nombreCompleto}" loading="lazy"
               onerror="this.src='data:image/svg+xml,%3Csvg viewBox=\\'0 0 24 24\\' fill=\\'%2371767b\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Ccircle cx=\\'12\\' cy=\\'8\\' r=\\'4\\'/%3E%3Cpath d=\\'M4 20c0-4 3.6-7 8-7s8 3 8 7\\'/%3E%3C/svg%3E'" />
        </div>
      </div>

      <!-- Contenido -->
      <div class="pub-contenido">
        <div class="pub-header">
          <span class="pub-nombre">${escHtml(nombreCompleto)}</span>
          <span class="pub-usuario-real">@${escHtml(pub.autorUsuario)}</span>
          <span class="pub-fecha">${UTIL.fechaRelativa(pub.fecha)}</span>
        </div>

        <div class="pub-titulo">${escHtml(pub.titulo)}</div>
        <div class="pub-texto">${escHtml(pub.texto)}</div>

        ${imgHtml}

        <!-- Acciones -->
        <div class="pub-acciones">
          <!-- Comentar -->
          <button class="pub-accion-btn"
              onclick="iniciarComentario('${pub.id}', '${pub.autorUsuario}')"
              title="Comentar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <span>${pub.comentarios?.length || 0}</span>
          </button>

          <!-- Like -->
          <button class="pub-accion-btn ${tieneLike ? "liked" : ""}"
              id="like-btn-${pub.id}"
              onclick="toggleLike('${pub.id}', '${pub.autorUsuario}', '${miLikeOcId || ""}')"
              title="${tieneLike ? "Quitar like" : "Dar like"}">
            <svg viewBox="0 0 24 24" fill="${tieneLike ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
            <span id="like-count-${pub.id}">${pub.likes?.length || 0}</span>
          </button>

          <span class="pub-accion-sep"></span>

          <!-- Eliminar (solo autor o admin) -->
          ${esAutor || esAdmin ? `
            <button class="pub-accion-btn btn-eliminar"
                onclick="confirmarEliminarPub('${pub.id}', '${pub.autorUsuario}')"
                title="Eliminar publicación">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
            </button>` : ""}
        </div>

        ${comentariosHtml}

        <!-- Formulario de comentario inline (oculto por defecto) -->
        <div id="form-coment-${pub.id}" class="form-comentario" style="display:none">
          <textarea
            id="textarea-coment-${pub.id}"
            placeholder="Comenta como tu OC…"
            rows="1"
            maxlength="500"
            oninput="autoResize(this)"
          ></textarea>
          <button class="btn-primario" style="padding:8px 14px;font-size:13px"
              onclick="enviarComentario('${pub.id}', '${pub.autorUsuario}')">
            Responder
          </button>
        </div>
      </div>
    </article>`;
}

function renderComentario(c, pubId, pubUsuario) {
  const miUsuario = localStorage.getItem("oc_usuario");
  const esAdmin   = localStorage.getItem("oc_rol") === "admin";
  const puedeDel  = c.ocUsuario === miUsuario || esAdmin;

  // Buscar datos del OC comentarista
  const avatarUrl = "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%2371767b' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 20c0-4 3.6-7 8-7s8 3 8 7'/%3E%3C/svg%3E";

  return `
    <div class="comentario" id="coment-${c.id}">
      <div class="coment-avatar">
        <img src="${avatarUrl}" alt="OC" loading="lazy" id="coment-avatar-${c.id}" />
      </div>
      <div class="coment-contenido">
        <div class="coment-header">
          <span class="coment-nombre" id="coment-nombre-${c.id}">${escHtml(c.ocId)}</span>
          <span class="coment-fecha">${UTIL.fechaRelativa(c.fecha)}</span>
          ${puedeDel ? `
            <button class="btn-del-coment"
                onclick="eliminarComentario('${pubId}', '${pubUsuario}', '${c.id}')">
              ✕
            </button>` : ""}
        </div>
        <div class="coment-texto">${escHtml(c.texto)}</div>
      </div>
    </div>`;
}

// ============================================================
// LIKES
// ============================================================

async function toggleLike(pubId, pubUsuario, ocIdActual) {
  if (misOcs.length === 0) {
    UTIL.toast("Necesitas un OC para dar likes. ¡Crea uno primero!", "error");
    return;
  }

  // Si ya tiene like con un OC, quitarlo directamente
  if (ocIdActual) {
    await ejecutarLike(pubId, pubUsuario, ocIdActual);
    return;
  }

  // Sino, pedir que elija un OC
  accionPendiente = { tipo: "like", pubId, pubUsuario };
  abrirSelectorOc("¿Con qué OC das like?");
}

async function ejecutarLike(pubId, pubUsuario, ocId) {
  const btn       = document.getElementById(`like-btn-${pubId}`);
  const countSpan = document.getElementById(`like-count-${pubId}`);
  if (btn) btn.disabled = true;

  try {
    const res = await API.post(`/likes/${pubUsuario}/${pubId}`, { ocId });
    const nuevoCount = res.likes.length;
    const tieneLike  = res.likes.includes(ocId);

    if (countSpan) countSpan.textContent = nuevoCount;
    if (btn) {
      btn.className = `pub-accion-btn ${tieneLike ? "liked" : ""}`;
      btn.title = tieneLike ? "Quitar like" : "Dar like";
      // Actualizar onclick para el nuevo estado
      btn.setAttribute("onclick",
        `toggleLike('${pubId}', '${pubUsuario}', '${tieneLike ? ocId : ""}')`);
      const svg = btn.querySelector("svg");
      if (svg) svg.setAttribute("fill", tieneLike ? "currentColor" : "none");
    }
  } catch (err) {
    UTIL.toast(err.mensaje || "Error al procesar like", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
// COMENTARIOS
// ============================================================

function iniciarComentario(pubId, pubUsuario) {
  if (misOcs.length === 0) {
    UTIL.toast("Necesitas un OC para comentar. ¡Crea uno primero!", "error");
    return;
  }

  // Mostrar/ocultar formulario inline
  const formEl = document.getElementById(`form-coment-${pubId}`);
  if (!formEl) return;

  const visible = formEl.style.display !== "none";
  formEl.style.display = visible ? "none" : "flex";
  if (!visible) {
    const ta = document.getElementById(`textarea-coment-${pubId}`);
    if (ta) ta.focus();
  }
}

async function enviarComentario(pubId, pubUsuario) {
  const ta    = document.getElementById(`textarea-coment-${pubId}`);
  const texto = ta?.value?.trim();

  if (!texto) { UTIL.toast("El comentario no puede estar vacío", "error"); return; }

  if (misOcs.length === 0) {
    UTIL.toast("Necesitas un OC para comentar", "error");
    return;
  }

  // Si solo tiene un OC, usarlo directamente
  if (misOcs.length === 1) {
    await ejecutarComentario(pubId, pubUsuario, misOcs[0].id, texto);
    return;
  }

  // Si tiene varios, mostrar selector
  accionPendiente = { tipo: "comentario", pubId, pubUsuario, texto };
  abrirSelectorOc("¿Con qué OC comentas?");
}

async function ejecutarComentario(pubId, pubUsuario, ocId, texto) {
  const ta    = document.getElementById(`textarea-coment-${pubId}`);
  const form  = document.getElementById(`form-coment-${pubId}`);

  try {
    const res = await API.post(`/comentarios/${pubUsuario}/${pubId}`, { ocId, texto });

    // Añadir comentario al DOM sin recargar todo
    const contenedorComents = document.querySelector(
      `[data-pub-id="${pubId}"] .pub-comentarios`
    );

    const nuevoHtml = renderComentario(res.comentario, pubId, pubUsuario);

    if (contenedorComents) {
      contenedorComents.insertAdjacentHTML("beforeend", nuevoHtml);
    } else {
      // Crear sección de comentarios si no existía
      const pubEl = document.querySelector(`[data-pub-id="${pubId}"] .pub-contenido`);
      if (pubEl) {
        const seccion = document.createElement("div");
        seccion.className = "pub-comentarios";
        seccion.innerHTML = nuevoHtml;
        form?.parentNode?.insertBefore(seccion, form);
      }
    }

    // Actualizar contador
    const btn = document.querySelector(`[data-pub-id="${pubId}"] .pub-accion-btn`);
    if (btn) {
      const span = btn.querySelector("span");
      if (span) span.textContent = parseInt(span.textContent || "0") + 1;
    }

    // Limpiar formulario
    if (ta) ta.value = "";
    if (form) form.style.display = "none";

    // Cargar datos del OC en el avatar del comentario recién añadido
    const ocData = misOcs.find(o => o.id === ocId);
    if (ocData && res.comentario?.id) {
      const avatarEl  = document.getElementById(`coment-avatar-${res.comentario.id}`);
      const nombreEl  = document.getElementById(`coment-nombre-${res.comentario.id}`);
      if (avatarEl && ocData.foto) avatarEl.src = API.imgUrl(ocData.foto);
      if (nombreEl) nombreEl.textContent = `${ocData.nombre}${ocData.apellido ? " " + ocData.apellido : ""}`;
    }

    UTIL.toast("Comentario publicado", "exito");
  } catch (err) {
    UTIL.toast(err.mensaje || "Error al comentar", "error");
  }
}

async function eliminarComentario(pubId, pubUsuario, comentId) {
  if (!confirm("¿Eliminar este comentario?")) return;
  try {
    await API.delete(`/comentarios/${pubUsuario}/${pubId}/${comentId}`);
    const el = document.getElementById(`coment-${comentId}`);
    if (el) el.remove();
    UTIL.toast("Comentario eliminado");
  } catch (err) {
    UTIL.toast(err.mensaje || "Error al eliminar", "error");
  }
}

function verTodosComentarios(pubId, pubUsuario) {
  const pub = pubsCache.find(p => p.id === pubId);
  if (!pub) return;

  const contenido = document.getElementById("modal-comentarios-contenido");
  if (!contenido) return;

  contenido.innerHTML = pub.comentarios.length === 0
    ? `<p style="color:var(--texto-secundario);padding:16px 0">Sin comentarios aún.</p>`
    : pub.comentarios.map(c => renderComentario(c, pubId, pubUsuario)).join("");

  document.getElementById("modal-comentarios").style.display = "flex";
}

function cerrarModalComentarios(e) {
  if (!e || e.target === document.getElementById("modal-comentarios")) {
    document.getElementById("modal-comentarios").style.display = "none";
  }
}

// ============================================================
// SELECTOR DE OC
// ============================================================

function abrirSelectorOc(titulo) {
  const overlay = document.getElementById("selector-oc-overlay");
  const lista   = document.getElementById("selector-oc-lista");
  const tituloEl = document.getElementById("selector-oc-titulo");

  if (tituloEl) tituloEl.textContent = titulo;

  lista.innerHTML = misOcs.map(oc => `
    <div class="selector-oc-item" onclick="seleccionarOcParaAccion('${oc.id}')">
      <img class="selector-oc-img"
           src="${oc.foto ? API.imgUrl(oc.foto) : "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%2371767b' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 20c0-4 3.6-7 8-7s8 3 8 7'/%3E%3C/svg%3E"}"
           alt="${escHtml(oc.nombre)}" />
      <span class="selector-oc-nombre">${escHtml(oc.nombre)}${oc.apellido ? " " + escHtml(oc.apellido) : ""}</span>
    </div>
  `).join("");

  overlay.style.display = "flex";
}

async function seleccionarOcParaAccion(ocId) {
  cerrarSelectorOc();
  if (!accionPendiente) return;

  const { tipo, pubId, pubUsuario, texto } = accionPendiente;
  accionPendiente = null;

  if (tipo === "like") {
    await ejecutarLike(pubId, pubUsuario, ocId);
  } else if (tipo === "comentario") {
    await ejecutarComentario(pubId, pubUsuario, ocId, texto);
  }
}

function cerrarSelectorOc(e) {
  if (!e || e.target === document.getElementById("selector-oc-overlay")) {
    document.getElementById("selector-oc-overlay").style.display = "none";
    accionPendiente = null;
  }
}

// ============================================================
// ELIMINAR PUBLICACIÓN
// ============================================================

async function confirmarEliminarPub(pubId, pubUsuario) {
  if (!confirm("¿Eliminar esta publicación? Esta acción no se puede deshacer.")) return;
  try {
    await API.delete(`/publicaciones/${pubUsuario}/${pubId}`);
    const el = document.querySelector(`[data-pub-id="${pubId}"]`);
    if (el) {
      el.style.opacity = "0";
      el.style.transition = "opacity 0.3s";
      setTimeout(() => el.remove(), 300);
    }
    UTIL.toast("Publicación eliminada", "exito");
  } catch (err) {
    UTIL.toast(err.mensaje || "Error al eliminar", "error");
  }
}

// ============================================================
// UTILIDADES DOM
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

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function verImagenGrande(url) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.9);
    z-index:9999;display:flex;align-items:center;justify-content:center;
    cursor:zoom-out;padding:16px;
  `;
  overlay.innerHTML = `<img src="${url}" style="max-width:100%;max-height:90vh;border-radius:8px;object-fit:contain" />`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}
