// js/config.js
// ⚠️ ÚNICO ARCHIVO QUE DEBES EDITAR: pon la URL de tu Cloudflare Worker aquí

const CONFIG = {
  WORKER_URL: "https://oc-social-worker.tsuyuasuiuwu1173.workers.dev",
  // Sin slash final
};

// API helper — wrapper sobre fetch con auth automática
const API = {
  _token() {
    return localStorage.getItem("oc_token") || "";
  },

  async _req(method, endpoint, body = null, esFormData = false) {
    const headers = { Authorization: `Bearer ${this._token()}` };
    if (body && !esFormData) headers["Content-Type"] = "application/json";

    const opciones = {
      method,
      headers,
      body: body ? (esFormData ? body : JSON.stringify(body)) : null
    };

    const res = await fetch(`${CONFIG.WORKER_URL}${endpoint}`, opciones);
    const data = await res.json().catch(() => ({ error: "Respuesta inválida" }));

    if (!res.ok) throw { status: res.status, mensaje: data.error || "Error desconocido" };
    return data;
  },

  get: (endpoint) => API._req("GET", endpoint),
  post: (endpoint, body) => API._req("POST", endpoint, body),
  put: (endpoint, body) => API._req("PUT", endpoint, body),
  delete: (endpoint) => API._req("DELETE", endpoint),

  // Para imágenes: devuelve URL de proxy
  imgUrl(ruta) {
    if (!ruta) return "img/default-avatar.png";
    return `${CONFIG.WORKER_URL}/img/${ruta}`;
  }
};

// Utilidades generales
const UTIL = {
  // Convertir File a base64 con data URL
  fileABase64(file) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  },

  // Mostrar notificación toast
  toast(msg, tipo = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Formatear fecha relativa estilo Twitter
  fechaRelativa(isoString) {
    const fecha = new Date(isoString);
    const ahora = new Date();
    const diff = (ahora - fecha) / 1000;
    if (diff < 60) return "ahora";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return fecha.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  },

  // Truncar texto
  truncar(texto, max = 100) {
    if (!texto) return "";
    return texto.length > max ? texto.slice(0, max) + "…" : texto;
  }
};
