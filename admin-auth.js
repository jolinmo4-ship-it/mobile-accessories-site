const adminConfig = window.XIQI_CONFIG;

if (!adminConfig) {
  window.XIQI_ADMIN_AUTH_ERROR = "缺少 XIQI_CONFIG，请检查 supabase-config.js 的加载顺序。";
} else {
  window.XIQI_ADMIN_CLIENT = supabase.createClient(adminConfig.url, adminConfig.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

window.XIQI_ADMIN_READY = new Promise((resolve, reject) => {
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const session = await protectAdminPage();
      const nav=document.querySelector('.admin-sidebar nav');if(nav&&!nav.querySelector('a[href="admin-ads.html"]')){const a=document.createElement('a');a.href='admin-ads.html';a.textContent='广告投放';nav.appendChild(a);}
      resolve(session);
    } catch (error) {
      reject(error);
    }
  });
});

async function protectAdminPage() {
  if (window.XIQI_ADMIN_AUTH_ERROR) {
    showAdminAuthError(window.XIQI_ADMIN_AUTH_ERROR);
    throw new Error(window.XIQI_ADMIN_AUTH_ERROR);
  }

  const client = window.XIQI_ADMIN_CLIENT;
  const {
    data: { session },
    error
  } = await client.auth.getSession();

  if (error || !session) {
    window.location.href = "admin-login.html";
    throw new Error("需要先登录后台。");
  }

  await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  });

  const role = getJwtRole(session.access_token);
  console.log("Supabase session ready.");

  window.XIQI_ADMIN_SESSION = session;
  document.body.classList.add("admin-authenticated");
  bindLogout(client);

  return session;
}

function bindLogout(client) {
  const logoutButton = document.getElementById("logoutButton");

  if (!logoutButton) return;

  logoutButton.addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "admin-login.html";
  });
}

function showAdminAuthError(message) {
  document.addEventListener("DOMContentLoaded", () => {
    document.body.insertAdjacentHTML("afterbegin", `<div style="padding:16px;color:#b91c1c;background:#fee2e2;font-weight:700">${message}</div>`);
  });
}

function getJwtRole(accessToken) {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    return payload.role || "unknown";
  } catch {
    return "unknown";
  }
}
