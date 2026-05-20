const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const loginButton = loginForm.querySelector('button[type="submit"]');
const config = window.XIQI_CONFIG;
const client = supabase.createClient(config.url, config.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

checkExistingSession();

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "Signing in...";
  loginButton.disabled = true;
  loginButton.classList.add("is-loading");

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data.session) throw new Error("Login succeeded but no Supabase session was returned.");

    await client.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });

    const {
      data: { session }
    } = await client.auth.getSession();

    if (!session) {
      throw new Error("Supabase session was not saved. Please try again.");
    }

    window.location.href = "admin.html";
  } catch (error) {
    loginStatus.textContent = error.message || "Login failed.";
  } finally {
    loginButton.disabled = false;
    loginButton.classList.remove("is-loading");
  }
});

async function checkExistingSession() {
  const { data } = await client.auth.getSession();

  if (data.session) {
    window.location.href = "admin.html";
  }
}
