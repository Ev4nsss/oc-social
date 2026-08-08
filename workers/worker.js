// workers/worker.js
// Cloudflare Worker — Backend completo para OC Social
// Maneja: autenticación JWT, CRUD usuarios/OCs/publicaciones, subida de imágenes

// ============================================================
// UTILIDADES JWT (sin librerías externas, usando Web Crypto API)
// ============================================================

async function crearJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const datos = `${enc(header)}.${enc(payload)}`;
  const clave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(datos));
  const firmaB64 = btoa(String.fromCharCode(...new Uint8Array(firma)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${datos}.${firmaB64}`;
}

async function verificarJWT(token, secret) {
  try {
    const partes = token.split(".");
    if (partes.length !== 3) return null;
    const datos = `${partes[0]}.${partes[1]}`;
    const clave = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const firma = Uint8Array.from(atob(partes[2].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valido = await crypto.subtle.verify("HMAC", clave, firma, new TextEncoder().encode(datos));
    if (!valido) return null;
    const payload = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// UTILIDADES GITHUB API
// ============================================================

async function githubGet(ruta, env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${ruta}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "OC-Social-Worker"
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET error ${res.status}: ${ruta}`);
  return res.json();
}

async function githubPut(ruta, contenidoBase64, mensaje, env, sha = null) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${ruta}`;
  const body = { message: mensaje, content: contenidoBase64 };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "OC-Social-Worker",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT error ${res.status}: ${err}`);
  }
  return res.json();
}

async function githubDelete(ruta, mensaje, sha, env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${ruta}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "OC-Social-Worker",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: mensaje, sha })
  });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub DELETE error ${res.status}`);
  return true;
}

// Lee un JSON del repo privado
async function leerJSON(ruta, env) {
  const archivo = await githubGet(ruta, env);
  if (!archivo) return { datos: null, sha: null };
  const contenido = JSON.parse(atob(archivo.content.replace(/\n/g, "")));
  return { datos: contenido, sha: archivo.sha };
}

// Escribe un JSON en el repo privado
async function escribirJSON(ruta, datos, mensaje, env, sha = null) {
  const contenidoBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(datos, null, 2))));
  return githubPut(ruta, contenidoBase64, mensaje, env, sha);
}

// ============================================================
// REDIMENSIONAMIENTO DE IMÁGENES (usando OffscreenCanvas si disponible)
// ============================================================

async function redimensionarImagen(base64Input, maxW, maxH) {
  const binaryStr = atob(base64Input.split(",").pop());
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/jpeg" });

  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  let nw = maxW, nh = maxH;
  const ratio = width / height;
  if (width > height) { nh = Math.round(maxW / ratio); }
  else { nw = Math.round(maxH * ratio); }
  if (nw > maxW) { nw = maxW; nh = Math.round(maxW / ratio); }
  if (nh > maxH) { nh = maxH; nw = Math.round(maxH * ratio); }

  const canvas = new OffscreenCanvas(nw, nh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, nw, nh);
  const outputBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  const arrayBuffer = await outputBlob.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
}

// ============================================================
// CORS Y RESPUESTAS
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function respJson(datos, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

function respError(msg, status = 400) {
  return respJson({ error: msg }, status);
}

// ============================================================
// MIDDLEWARE — Extrae usuario del JWT
// ============================================================

async function autenticarRequest(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;
  return verificarJWT(token, env.JWT_SECRET);
}

// ============================================================
// HANDLERS DE RUTAS
// ============================================================

// POST /auth/login
async function handleLogin(request, env) {
  const { nombre, contraseña } = await request.json();
  if (!nombre || !contraseña) return respError("Faltan credenciales");

  const { datos: usuarios } = await leerJSON("usuarios.json", env);
  if (!usuarios) return respError("Error al leer usuarios", 500);

  // 🔥 CORRECCIÓN: recortar espacios en ambos lados antes de comparar
  const usuario = usuarios.find(u =>
    u.nombre.trim() === nombre.trim() &&
    u.contraseña.trim() === contraseña.trim()
  );

  if (!usuario) return respError("Credenciales incorrectas", 401);
  if (usuario.activo === false) return respError("Cuenta suspendida", 403);

  const payload = {
    nombre: usuario.nombre,
    rol: usuario.rol,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 días
  };
  const token = await crearJWT(payload, env.JWT_SECRET);
  return respJson({ token, nombre: usuario.nombre, rol: usuario.rol });
}

// GET /auth/verify
async function handleVerify(request, env) {
  const payload = await autenticarRequest(request, env);
  if (!payload) return respError("Token inválido", 401);
  return respJson({ valido: true, nombre: payload.nombre, rol: payload.rol });
}

// ============================================================
// USUARIOS (solo admin)
// ============================================================

// GET /admin/usuarios
async function handleListarUsuarios(request, env, payload) {
  if (payload.rol !== "admin") return respError("Sin permisos", 403);
  const { datos } = await leerJSON("usuarios.json", env);
  const seguros = (datos || []).map(({ contraseña: _, ...u }) => u);
  return respJson(seguros);
}

// POST /admin/usuarios
async function handleCrearUsuario(request, env, payload) {
  if (payload.rol !== "admin") return respError("Sin permisos", 403);
  const { nombre, contraseña } = await request.json();
  if (!nombre || !contraseña) return respError("Nombre y contraseña requeridos");

  const { datos: usuarios, sha } = await leerJSON("usuarios.json", env);
  if (usuarios.find(u => u.nombre === nombre)) return respError("El usuario ya existe");

  const nuevo = { nombre, contraseña, rol: "usuario", activo: true };
  usuarios.push(nuevo);

  await escribirJSON(
    `usuarios/${nombre}/PerfilesOcsDatos.json`, [], `Crear usuario ${nombre}`, env
  );
  await escribirJSON(
    `usuarios/${nombre}/PublicacionesDeOcsDatos.json`, [], `Init pubs ${nombre}`, env
  );
  await escribirJSON("usuarios.json", usuarios, `Nuevo usuario: ${nombre}`, env, sha);

  return respJson({ ok: true });
}

// PUT /admin/usuarios/:nombre
async function handleEditarUsuario(request, env, payload, nombreTarget) {
  if (payload.rol !== "admin") return respError("Sin permisos", 403);
  const body = await request.json();
  const { datos: usuarios, sha } = await leerJSON("usuarios.json", env);
  const idx = usuarios.findIndex(u => u.nombre === nombreTarget);
  if (idx === -1) return respError("Usuario no encontrado", 404);

  if (body.activo !== undefined) usuarios[idx].activo = body.activo;
  if (body.contraseña) usuarios[idx].contraseña = body.contraseña;

  await escribirJSON("usuarios.json", usuarios, `Editar usuario: ${nombreTarget}`, env, sha);
  return respJson({ ok: true });
}

// DELETE /admin/usuarios/:nombre
async function handleEliminarUsuario(request, env, payload, nombreTarget) {
  if (payload.rol !== "admin") return respError("Sin permisos", 403);
  if (nombreTarget === "Evancito") return respError("No puedes eliminar al admin principal");

  const { datos: usuarios, sha } = await leerJSON("usuarios.json", env);
  const nuevos = usuarios.filter(u => u.nombre !== nombreTarget);
  await escribirJSON("usuarios.json", nuevos, `Eliminar usuario: ${nombreTarget}`, env, sha);
  return respJson({ ok: true });
}

// ============================================================
// OCS
// ============================================================

// GET /ocs/:usuario
async function handleListarOcs(request, env, payload, nombreUsuario) {
  const { datos } = await leerJSON(`usuarios/${nombreUsuario}/PerfilesOcsDatos.json`, env);
  return respJson(datos || []);
}

// POST /ocs/:usuario
async function handleCrearOc(request, env, payload, nombreUsuario) {
  if (payload.nombre !== nombreUsuario && payload.rol !== "admin")
    return respError("Sin permisos", 403);

  const body = await request.json();
  const { nombre, apellido, descripcion, foto } = body;
  if (!nombre) return respError("El nombre del OC es requerido");

  const id = crypto.randomUUID();
  let rutaFoto = null;

  if (foto) {
    const fotoRedim = await redimensionarImagen(foto, 300, 300);
    rutaFoto = `usuarios/${nombreUsuario}/Fotos-Perfiles-ocs/${id}.jpg`;
    await githubPut(rutaFoto, fotoRedim, `Foto OC ${id}`, env);
  }

  const { datos: ocs, sha } = await leerJSON(`usuarios/${nombreUsuario}/PerfilesOcsDatos.json`, env);
  const nuevosOcs = ocs || [];
  nuevosOcs.push({ id, nombre, apellido: apellido || "", descripcion: descripcion || "", foto: rutaFoto });
  await escribirJSON(`usuarios/${nombreUsuario}/PerfilesOcsDatos.json`, nuevosOcs, `Nuevo OC: ${nombre}`, env, sha);

  return respJson({ ok: true, id });
}

// PUT /ocs/:usuario/:id
async function handleEditarOc(request, env, payload, nombreUsuario, ocId) {
  if (payload.nombre !== nombreUsuario && payload.rol !== "admin")
    return respError("Sin permisos", 403);

  const body = await request.json();
  const { datos: ocs, sha } = await leerJSON(`usuarios/${nombreUsuario}/PerfilesOcsDatos.json`, env);
  const idx = ocs.findIndex(o => o.id === ocId);
  if (idx === -1) return respError("OC no encontrado", 404);

  if (body.nombre) ocs[idx].nombre = body.nombre;
  if (body.apellido !== undefined) ocs[idx].apellido = body.apellido;
  if (body.descripcion !== undefined) ocs[idx].descripcion = body.descripcion;

  if (body.foto) {
    const fotoRedim = await redimensionarImagen(body.foto, 300, 300);
    const rutaFoto = `usuarios/${nombreUsuario}/Fotos-Perfiles-ocs/${ocId}.jpg`;
    const fotoExistente = await githubGet(rutaFoto, env);
    await githubPut(rutaFoto, fotoRedim, `Update foto OC ${ocId}`, env, fotoExistente?.sha);
    ocs[idx].foto = rutaFoto;
  }

  await escribirJSON(`usuarios/${nombreUsuario}/PerfilesOcsDatos.json`, ocs, `Edit OC ${ocId}`, env, sha);
  return respJson({ ok: true });
}

// DELETE /ocs/:usuario/:id
async function handleEliminarOc(request, env, payload, nombreUsuario, ocId) {
  if (payload.nombre !== nombreUsuario && payload.rol !== "admin")
    return respError("Sin permisos", 403);

  const { datos: ocs, sha } = await leerJSON(`usuarios/${nombreUsuario}/PerfilesOcsDatos.json`, env);
  const oc = ocs.find(o => o.id === ocId);
  if (!oc) return respError("OC no encontrado", 404);

  if (oc.foto) {
    const fotoFile = await githubGet(oc.foto, env);
    if (fotoFile) await githubDelete(oc.foto, `Del foto OC ${ocId}`, fotoFile.sha, env);
  }

  const nuevos = ocs.filter(o => o.id !== ocId);
  await escribirJSON(`usuarios/${nombreUsuario}/PerfilesOcsDatos.json`, nuevos, `Del OC ${ocId}`, env, sha);
  return respJson({ ok: true });
}

// ============================================================
// PUBLICACIONES
// ============================================================

// GET /publicaciones — todas las publicaciones de todos los usuarios
async function handleListarTodasPublicaciones(env) {
  const { datos: usuarios } = await leerJSON("usuarios.json", env);
  if (!usuarios) return respJson([]);

  const todasPubs = [];
  for (const u of usuarios) {
    try {
      const { datos: pubs } = await leerJSON(`usuarios/${u.nombre}/PublicacionesDeOcsDatos.json`, env);
      if (pubs) {
        const { datos: ocs } = await leerJSON(`usuarios/${u.nombre}/PerfilesOcsDatos.json`, env);
        for (const pub of pubs) {
          const ocAutor = (ocs || []).find(o => o.id === pub.ocId);
          todasPubs.push({
            ...pub,
            autorUsuario: u.nombre,
            ocAutor: ocAutor || null
          });
        }
      }
    } catch {
      // continuar con otros usuarios
    }
  }

  todasPubs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return respJson(todasPubs);
}

// GET /publicaciones/:usuario
async function handleListarPublicaciones(env, nombreUsuario) {
  const { datos: pubs } = await leerJSON(`usuarios/${nombreUsuario}/PublicacionesDeOcsDatos.json`, env);
  return respJson(pubs || []);
}

// POST /publicaciones/:usuario
async function handleCrearPublicacion(request, env, payload, nombreUsuario) {
  if (payload.nombre !== nombreUsuario && payload.rol !== "admin")
    return respError("Sin permisos", 403);

  const body = await request.json();
  const { ocId, titulo, texto, imagenes } = body;
  if (!ocId || !titulo) return respError("OC y título son requeridos");

  const { datos: ocs } = await leerJSON(`usuarios/${nombreUsuario}/PerfilesOcsDatos.json`, env);
  if (!ocs?.find(o => o.id === ocId)) return respError("OC no encontrado", 404);

  const id = crypto.randomUUID();
  const rutasImagenes = [];

  if (imagenes && imagenes.length > 0) {
    const limite = imagenes.slice(0, 2);
    for (let i = 0; i < limite.length; i++) {
      const imgRedim = await redimensionarImagen(limite[i], 400, 400);
      const ruta = `usuarios/${nombreUsuario}/Fotos-publicaciones/${id}_${i + 1}.jpg`;
      await githubPut(ruta, imgRedim, `Img pub ${id} #${i + 1}`, env);
      rutasImagenes.push(ruta);
    }
  }

  const nuevaPub = {
    id,
    ocId,
    titulo,
    texto: texto || "",
    imagenes: rutasImagenes,
    fecha: new Date().toISOString(),
    likes: [],
    comentarios: []
  };

  const { datos: pubs, sha } = await leerJSON(`usuarios/${nombreUsuario}/PublicacionesDeOcsDatos.json`, env);
  const nuevasPubs = pubs || [];
  nuevasPubs.push(nuevaPub);
  await escribirJSON(`usuarios/${nombreUsuario}/PublicacionesDeOcsDatos.json`, nuevasPubs, `Nueva pub: ${titulo}`, env, sha);

  return respJson({ ok: true, id });
}

// DELETE /publicaciones/:usuario/:id
async function handleEliminarPublicacion(request, env, payload, nombreUsuario, pubId) {
  if (payload.nombre !== nombreUsuario && payload.rol !== "admin")
    return respError("Sin permisos", 403);

  const { datos: pubs, sha } = await leerJSON(`usuarios/${nombreUsuario}/PublicacionesDeOcsDatos.json`, env);
  const pub = pubs?.find(p => p.id === pubId);
  if (!pub) return respError("Publicación no encontrada", 404);

  for (const imgRuta of pub.imagenes || []) {
    const imgFile = await githubGet(imgRuta, env);
    if (imgFile) await githubDelete(imgRuta, `Del img pub ${pubId}`, imgFile.sha, env);
  }

  const nuevas = pubs.filter(p => p.id !== pubId);
  await escribirJSON(`usuarios/${nombreUsuario}/PublicacionesDeOcsDatos.json`, nuevas, `Del pub ${pubId}`, env, sha);
  return respJson({ ok: true });
}

// ============================================================
// LIKES
// ============================================================

// POST /likes/:usuarioPub/:pubId
async function handleToggleLike(request, env, payload, usuarioPub, pubId) {
  const { ocId } = await request.json();
  if (!ocId) return respError("ocId requerido");

  const { datos: misOcs } = await leerJSON(`usuarios/${payload.nombre}/PerfilesOcsDatos.json`, env);
  if (!misOcs?.find(o => o.id === ocId)) return respError("OC no te pertenece", 403);

  const { datos: pubs, sha } = await leerJSON(`usuarios/${usuarioPub}/PublicacionesDeOcsDatos.json`, env);
  const pub = pubs?.find(p => p.id === pubId);
  if (!pub) return respError("Publicación no encontrada", 404);

  const idx = pub.likes.indexOf(ocId);
  if (idx === -1) {
    pub.likes.push(ocId);
  } else {
    pub.likes.splice(idx, 1);
  }

  await escribirJSON(`usuarios/${usuarioPub}/PublicacionesDeOcsDatos.json`, pubs, `Like toggle ${pubId}`, env, sha);
  return respJson({ ok: true, likes: pub.likes });
}

// ============================================================
// COMENTARIOS
// ============================================================

// POST /comentarios/:usuarioPub/:pubId
async function handleAgregarComentario(request, env, payload, usuarioPub, pubId) {
  const { ocId, texto } = await request.json();
  if (!ocId || !texto?.trim()) return respError("OC y texto requeridos");

  const { datos: misOcs } = await leerJSON(`usuarios/${payload.nombre}/PerfilesOcsDatos.json`, env);
  if (!misOcs?.find(o => o.id === ocId)) return respError("OC no te pertenece", 403);

  const { datos: pubs, sha } = await leerJSON(`usuarios/${usuarioPub}/PublicacionesDeOcsDatos.json`, env);
  const pub = pubs?.find(p => p.id === pubId);
  if (!pub) return respError("Publicación no encontrada", 404);

  const comentario = {
    id: crypto.randomUUID(),
    ocId,
    ocUsuario: payload.nombre,
    texto: texto.trim(),
    fecha: new Date().toISOString()
  };
  pub.comentarios.push(comentario);

  await escribirJSON(`usuarios/${usuarioPub}/PublicacionesDeOcsDatos.json`, pubs, `Comentario en ${pubId}`, env, sha);
  return respJson({ ok: true, comentario });
}

// DELETE /comentarios/:usuarioPub/:pubId/:comentId
async function handleEliminarComentario(request, env, payload, usuarioPub, pubId, comentId) {
  const { datos: pubs, sha } = await leerJSON(`usuarios/${usuarioPub}/PublicacionesDeOcsDatos.json`, env);
  const pub = pubs?.find(p => p.id === pubId);
  if (!pub) return respError("Publicación no encontrada", 404);

  const coment = pub.comentarios.find(c => c.id === comentId);
  if (!coment) return respError("Comentario no encontrado", 404);

  if (coment.ocUsuario !== payload.nombre && payload.rol !== "admin")
    return respError("Sin permisos", 403);

  pub.comentarios = pub.comentarios.filter(c => c.id !== comentId);
  await escribirJSON(`usuarios/${usuarioPub}/PublicacionesDeOcsDatos.json`, pubs, `Del comentario ${comentId}`, env, sha);
  return respJson({ ok: true });
}

// ============================================================
// IMÁGENES — Proxy para servir imágenes del repo privado
// ============================================================

async function handleServirImagen(ruta, env) {
  const archivo = await githubGet(ruta, env);
  if (!archivo) return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  const bytes = Uint8Array.from(atob(archivo.content.replace(/\n/g, "")), c => c.charCodeAt(0));
  return new Response(bytes, {
    headers: { ...CORS_HEADERS, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" }
  });
}

// ============================================================
// ROUTER PRINCIPAL
// ============================================================

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    const partes = path.split("/").filter(Boolean);
    const method = request.method;

    try {
      // ── AUTH ──────────────────────────────────────────────
      if (partes[0] === "auth") {
        if (partes[1] === "login" && method === "POST") return handleLogin(request, env);
        if (partes[1] === "verify" && method === "GET") return handleVerify(request, env);
      }

      // ── IMÁGENES ──────────────────────────────────────────
      if (partes[0] === "img") {
        const rutaImagen = partes.slice(1).join("/");
        return handleServirImagen(rutaImagen, env);
      }

      // Para el resto de rutas, requerir autenticación
      const payload = await autenticarRequest(request, env);
      if (!payload) return respError("No autenticado", 401);

      // ── ADMIN USUARIOS ────────────────────────────────────
      if (partes[0] === "admin" && partes[1] === "usuarios") {
        if (method === "GET") return handleListarUsuarios(request, env, payload);
        if (method === "POST") return handleCrearUsuario(request, env, payload);
        if (partes[2] && method === "PUT") return handleEditarUsuario(request, env, payload, partes[2]);
        if (partes[2] && method === "DELETE") return handleEliminarUsuario(request, env, payload, partes[2]);
      }

      // ── OCS ───────────────────────────────────────────────
      if (partes[0] === "ocs") {
        const nombreUsuario = partes[1];
        if (!nombreUsuario) return respError("Usuario requerido");
        if (method === "GET") return handleListarOcs(request, env, payload, nombreUsuario);
        if (method === "POST") return handleCrearOc(request, env, payload, nombreUsuario);
        if (partes[2] && method === "PUT") return handleEditarOc(request, env, payload, nombreUsuario, partes[2]);
        if (partes[2] && method === "DELETE") return handleEliminarOc(request, env, payload, nombreUsuario, partes[2]);
      }

      // ── PUBLICACIONES ─────────────────────────────────────
      if (partes[0] === "publicaciones") {
        if (!partes[1]) return handleListarTodasPublicaciones(env);
        const nombreUsuario = partes[1];
        if (method === "GET") return handleListarPublicaciones(env, nombreUsuario);
        if (method === "POST") return handleCrearPublicacion(request, env, payload, nombreUsuario);
        if (partes[2] && method === "DELETE") return handleEliminarPublicacion(request, env, payload, nombreUsuario, partes[2]);
      }

      // ── LIKES ─────────────────────────────────────────────
      if (partes[0] === "likes" && partes[1] && partes[2] && method === "POST") {
        return handleToggleLike(request, env, payload, partes[1], partes[2]);
      }

      // ── COMENTARIOS ───────────────────────────────────────
      if (partes[0] === "comentarios") {
        if (partes[1] && partes[2] && method === "POST")
          return handleAgregarComentario(request, env, payload, partes[1], partes[2]);
        if (partes[1] && partes[2] && partes[3] && method === "DELETE")
          return handleEliminarComentario(request, env, payload, partes[1], partes[2], partes[3]);
      }

      return respError("Ruta no encontrada", 404);

    } catch (err) {
      console.error("Worker error:", err);
      return respError(`Error interno: ${err.message}`, 500);
    }
  }
};
