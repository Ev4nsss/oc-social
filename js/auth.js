// js/auth.js
// Maneja login, logout, sesión y redirecciones

document.addEventListener("DOMContentLoaded", () => {
  inicializarAuth();
});

function inicializarAuth() {
  const esLogin = document.body.dataset.pagina === "login";
  const token = localStorage.getItem("oc_token");

  if (esLogin) {
    if (token) verificarSesionYRedirigir();
    configurarFormLogin();
    return;
  }

  if (!token) {
    window.location.href = "/index.html";
    return;
  }
  verificarSesionYRedirigir(false);
}

async function verificarSesionYRedirigir(redirigirSiValido = true) {
  try {
    const data = await API.get("/auth/verify");
    localStorage.setItem("oc_usuario", data.nombre);
    localStorage.setItem("oc_rol", data.rol);

    if (redirigirSiValido) {
      window.location.href = "/html/lobby.html";
    } else {
      actualizarNavUsuario(data.nombre, data.rol);
    }
  } catch (err) {
    if (err.status === 401) {
      localStorage.clear();
      if (!redirigirSiValido) window.location.href = "/index.html";
    }
  }
}

function configurarFormLogin() {
  const form = document.getElementById("form-login");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("input-nombre").value.trim();
    // ¡Corregido! También quitamos espacios a la contraseña
    const contraseña = document.getElementById("input-pass").value.trim();
    const btnLogin = document.getElementById("btn-login");
    const errorDiv = document.getElementById("login-error");

    if (!nombre || !contraseña) {
      errorDiv.textContent = "Por favor completa todos los campos.";
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = "Iniciando...";
    errorDiv.textContent = "";

    try {
      const data = await API.post("/auth/login", { nombre, contraseña });
      localStorage.setItem("oc_token", data.token);
      localStorage.setItem("oc_usuario", data.nombre);
      localStorage.setItem("oc_rol", data.rol);
      window.location.href = "/html/lobby.html";
    } catch (err) {
      errorDiv.textContent = err.mensaje || "Error al iniciar sesión.";
      btnLogin.disabled = false;
      btnLogin.textContent = "Iniciar sesión";
    }
  });
}

function actualizarNavUsuario(nombre, rol) {
  const navNombre = document.getElementById("nav-nombre");
  if (navNombre) navNombre.textContent = nombre;

  const navAdmin = document.getElementById("nav-admin");
  if (navAdmin) navAdmin.style.display = rol === "admin" ? "flex" : "none";
}

function cerrarSesion() {
  localStorage.clear();
  window.location.href = "/index.html";
}

window.cerrarSesion = cerrarSesion;
