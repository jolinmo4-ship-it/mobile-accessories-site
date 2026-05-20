const config = window.XIQI_CONFIG;
const client = window.XIQI_ADMIN_CLIENT;

if (!config) {
  showBlockingAdminError("XIQI_CONFIG missing. Please check supabase-config.js loading order.");
  throw new Error("XIQI_CONFIG missing. Please check supabase-config.js loading order.");
}

if (!client) {
  showBlockingAdminError("Authenticated Supabase client missing. Please check admin-auth.js loading order.");
  throw new Error("Authenticated Supabase client missing. Please check admin-auth.js loading order.");
}

const form = document.getElementById("productForm");
const statusText = document.getElementById("formStatus");
const productList = document.getElementById("productList");
const refreshButton = document.getElementById("refreshProducts");
const inquiryList = document.getElementById("inquiryList");
const refreshInquiriesButton = document.getElementById("refreshInquiries");
const categoryForm = document.getElementById("categoryForm");
const categoryList = document.getElementById("categoryList");
const refreshCategoriesButton = document.getElementById("refreshCategories");
const cancelCategoryEditButton = document.getElementById("cancelCategoryEdit");
const categoryStatus = document.getElementById("categoryStatus");
const categorySubmitButton = categoryForm.querySelector('button[type="submit"]');
const factoryForm = document.getElementById("factoryForm");
const factoryVideoList = document.getElementById("factoryVideoList");
const refreshFactoryVideosButton = document.getElementById("refreshFactoryVideos");
const cancelFactoryEditButton = document.getElementById("cancelFactoryEdit");
const factoryStatus = document.getElementById("factoryStatus");
const factorySubmitButton = factoryForm.querySelector('button[type="submit"]');
const productGalleryList = document.getElementById("productGalleryList");
const removeProductVideoButton = document.getElementById("removeProductVideo");
const productVideoStatus = document.getElementById("productVideoStatus");
const cancelEditButton = document.getElementById("cancelEdit");
const submitButton = form.querySelector('button[type="submit"]');
let adminSession = null;

async function ensureAdminSession() {
  if (!client) {
    window.location.href = "admin-login.html";
    throw new Error("Authenticated Supabase client is not available.");
  }

  const {
    data: { session },
    error
  } = await client.auth.getSession();

  if (error || !session) {
    window.location.href = "admin-login.html";
    throw new Error("Admin login required.");
  }

  adminSession = session;
  window.XIQI_ADMIN_SESSION = session;

  await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  });

  console.log("Supabase admin role:", getJwtRole(session.access_token), session.user?.email || "unknown");

  return adminSession;
}

async function initAdmin() {
  try {
    await ensureAdminSession();
    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadFactoryVideos(),
      loadInquiries()
    ]);
  } catch (error) {
    console.warn(error.message || "Admin session unavailable.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (submitButton.disabled) return;

  setBusy(true);
  setStatus("Saving product...");

  try {
    await ensureAdminSession();
    const formData = new FormData(form);
    const id = formData.get("id");
    const imageUrl = await resolveImageUrl(formData);
    const videoUrl = await resolveProductVideoUrl(formData);
    const gallery = await resolveGalleryUrls(formData);
    const savedProduct = await saveProduct(formData, imageUrl, videoUrl, gallery);
    resetForm();
    setStatus(id ? "Product updated." : "Product added.");
    await loadProducts();
  } catch (error) {
    setStatus(error.message || "Failed to save product.");
  } finally {
    setBusy(false);
  }
});

refreshButton.addEventListener("click", loadProducts);
refreshInquiriesButton.addEventListener("click", loadInquiries);
cancelEditButton.addEventListener("click", resetForm);
refreshCategoriesButton.addEventListener("click", loadCategories);
cancelCategoryEditButton.addEventListener("click", resetCategoryForm);
refreshFactoryVideosButton.addEventListener("click", loadFactoryVideos);
cancelFactoryEditButton.addEventListener("click", resetFactoryForm);
removeProductVideoButton.addEventListener("click", () => {
  form.current_video_url.value = "";
  form.remove_product_video.value = "1";
  removeProductVideoButton.hidden = true;
  productVideoStatus.textContent = "Product video will be removed after saving.";
});

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (categorySubmitButton.disabled) return;

  setButtonBusy(categorySubmitButton, true);
  categoryStatus.textContent = "Saving category...";

  try {
    await ensureAdminSession();
    const formData = new FormData(categoryForm);
    const id = formData.get("id");
    const imageUrl = await resolveCategoryImageUrl(formData);
    await saveCategory(formData, imageUrl);
    resetCategoryForm();
    categoryStatus.textContent = id ? "Category updated." : "Category added.";
    await loadCategories();
  } catch (error) {
    categoryStatus.textContent = error.message || "Failed to save category.";
  } finally {
    setButtonBusy(categorySubmitButton, false);
  }
});

factoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (factorySubmitButton.disabled) return;

  setButtonBusy(factorySubmitButton, true);
  factoryStatus.textContent = "Saving video...";

  try {
    await ensureAdminSession();
    const formData = new FormData(factoryForm);
    const id = formData.get("id");
    const videoUrl = await resolveFactoryVideoUrl(formData);
    await saveFactoryVideo(formData, videoUrl);
    resetFactoryForm();
    factoryStatus.textContent = id ? "Video updated." : "Video added.";
    await loadFactoryVideos();
  } catch (error) {
    factoryStatus.textContent = error.message || "Failed to save video.";
  } finally {
    setButtonBusy(factorySubmitButton, false);
  }
});

async function resolveImageUrl(formData) {
  const fileInput = document.getElementById("imageFile");
  const file = fileInput.files[0];
  const currentImageUrl = formData.get("current_image_url");

  if (!file) {
    if (currentImageUrl) return currentImageUrl;
    throw new Error("Please choose a product image.");
  }

  return uploadImage(file);
}

async function uploadImage(file) {
  await ensureAdminSession();
  const config = getAdminConfig();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] || "";
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const { error } = await client.storage
    .from(config.storageBucket)
    .upload(filename, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) {
    throw new Error(error.message || "Image upload failed.");
  }

  const { data } = client.storage.from(config.storageBucket).getPublicUrl(filename);
  return data.publicUrl;
}

async function uploadFile(file, bucket, folder) {
  await ensureAdminSession();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] || "";
  const filename = `${folder}/${Date.now()}-${crypto.randomUUID()}${ext}`;
  const { error } = await client.storage
    .from(bucket)
    .upload(filename, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) {
    throw new Error(error.message || "File upload failed.");
  }

  const { data } = client.storage.from(bucket).getPublicUrl(filename);
  return data.publicUrl;
}

async function resolveProductVideoUrl(formData) {
  const config = getAdminConfig();
  const file = document.getElementById("productVideoFile").files[0];

  if (formData.get("remove_product_video") === "1") {
    return "";
  }

  if (!file) {
    return formData.get("current_video_url") || "";
  }

  return uploadFile(file, config.storageBucket, "product-videos");
}

async function saveProduct(formData, imageUrl, videoUrl, gallery) {
  await ensureAdminSession();
  const config = getAdminConfig();

  const id = formData.get("id");
  const payload = {
    name: clean(formData.get("name")),
    category: clean(formData.get("category")),
    short_desc: clean(formData.get("short_desc")),
    description: clean(formData.get("description")),
    image_url: imageUrl,
    price: clean(formData.get("price")),
    moq: clean(formData.get("moq")),
    material: clean(formData.get("material")),
    packaging: clean(formData.get("packaging")),
    lead_time: clean(formData.get("lead_time")),
    features: clean(formData.get("features")),
    gallery,
    video_url: videoUrl,
    status: clean(formData.get("status")) || "published",
    sort_order: Number(formData.get("sort_order") || 0)
  };

  if (!payload.name) {
    throw new Error("Product name is required.");
  }

  if (id) {
    const { data, error } = await client
      .from(config.productsTable)
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await client
    .from(config.productsTable)
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function resolveGalleryUrls(formData) {
  const config = getAdminConfig();
  const files = Array.from(document.getElementById("galleryFiles").files || []);
  const currentGallery = parseGallery(formData.get("current_gallery"));

  if (!files.length) return currentGallery;

  for (let index = 0; index < files.length; index += 1) {
    const imageUrl = await uploadFile(files[index], config.storageBucket, "product-gallery");
    currentGallery.push(imageUrl);
  }

  return currentGallery;
}

async function loadProducts() {
  await ensureAdminSession();
  const config = getAdminConfig();

  productList.innerHTML = "<p>Loading products...</p>";

  try {
    const { data, error } = await client
      .from(config.productsTable)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;
    renderProducts(data || []);
  } catch (error) {
    productList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderProducts(products) {
  if (!products.length) {
    productList.innerHTML = "<p>No products yet.</p>";
    return;
  }

  productList.innerHTML = products.map((product) => `
    <article class="admin-product">
      <img src="${escapeAttribute(product.image_url || "")}" alt="">
      <div>
        <h3>${escapeHtml(product.name || "Untitled Product")}</h3>
        <p>${escapeHtml(product.category || "Uncategorized")}</p>
        <p>${escapeHtml(product.short_desc || "")}</p>
        <p>${escapeHtml(product.price || "")}</p>
      </div>
      <div class="admin-product-actions">
        <button type="button" data-action="edit" data-id="${escapeAttribute(product.id)}">Edit</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(product.id)}">Delete</button>
      </div>
    </article>
  `).join("");

  productList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const product = products.find((item) => item.id === button.dataset.id);

      if (button.dataset.action === "edit") {
        editProduct(product);
      }

      if (button.dataset.action === "delete") {
        deleteProduct(product);
      }
    });
  });
}

function editProduct(product) {
  if (!product) return;

  form.id.value = product.id || "";
  form.current_image_url.value = product.image_url || "";
  form.current_video_url.value = product.video_url || product.product_video || "";
  form.current_gallery.value = JSON.stringify(normalizeGallery(product.gallery));
  form.remove_product_video.value = "";
  form.name.value = product.name || "";
  form.category.value = product.category || "";
  form.sort_order.value = product.sort_order || 0;
  form.status.value = product.status || "published";
  form.price.value = product.price || "";
  form.moq.value = product.moq || "";
  form.material.value = product.material || "";
  form.packaging.value = product.packaging || "";
  form.lead_time.value = product.lead_time || "";
  form.short_desc.value = product.short_desc || "";
  form.description.value = product.description || "";
  form.features.value = product.features || "";
  removeProductVideoButton.hidden = !(product.video_url || product.product_video);
  productVideoStatus.textContent = (product.video_url || product.product_video) ? "Product video attached." : "";
  submitButton.textContent = "Update Product";
  cancelEditButton.hidden = false;
  setStatus("Editing product.");
  renderProductGallery(normalizeGallery(product.gallery));
}

async function deleteProduct(product) {
  await ensureAdminSession();
  const config = getAdminConfig();

  if (!product) return;

  const confirmed = window.confirm(`Delete ${product.name || "this product"}?`);

  if (!confirmed) return;

  setStatus("Deleting product...");
  await deleteProductStorageFiles(product);
  const { error } = await client
    .from(config.productsTable)
    .delete()
    .eq("id", product.id);

  if (error) {
    setStatus(error.message || "Failed to delete product.");
    return;
  }

  setStatus("Product deleted.");
  await loadProducts();
}

async function deleteProductStorageFiles(product) {
  const config = getAdminConfig();
  const urls = [
    product.image_url,
    ...(normalizeGallery(product.gallery)),
    product.video_url
  ].filter(Boolean);

  const paths = [...new Set(urls.map((url) => storagePathFromPublicUrl(url)).filter(Boolean))];

  if (!paths.length) return;

  const { error } = await client.storage.from(config.storageBucket).remove(paths);

  if (error) {
    console.log("Storage cleanup failed:", error);
  }
}

function storagePathFromPublicUrl(url) {
  const config = getAdminConfig();

  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${config.storageBucket}/`;
    const index = parsed.pathname.indexOf(marker);

    if (index === -1) return "";

    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return "";
  }
}

function renderProductGallery(images) {
  if (!images.length) {
    productGalleryList.innerHTML = "<p>No gallery images yet.</p>";
    return;
  }

  productGalleryList.innerHTML = images.map((image, index) => `
    <article class="gallery-manage-item">
      <img src="${escapeAttribute(image)}" alt="">
      <input type="number" value="${index + 1}" data-action="sort" data-index="${index}">
      <button type="button" data-action="main" data-url="${escapeAttribute(image)}">Set Main</button>
      <button type="button" data-action="delete" data-index="${index}">Delete</button>
    </article>
  `).join("");

  productGalleryList.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => updateGallerySort(input.dataset.index, input.value));
  });

  productGalleryList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "main") setMainProductImage(button.dataset.url);
      if (button.dataset.action === "delete") deleteGalleryImage(button.dataset.index);
    });
  });
}

function updateGallerySort(index, sortOrder) {
  const gallery = parseGallery(form.current_gallery.value);
  const [item] = gallery.splice(Number(index), 1);
  const target = Math.max(0, Math.min(gallery.length, Number(sortOrder || 1) - 1));

  gallery.splice(target, 0, item);
  form.current_gallery.value = JSON.stringify(gallery);
  renderProductGallery(gallery);
}

async function setMainProductImage(imageUrl) {
  await ensureAdminSession();
  const config = getAdminConfig();

  const productId = form.id.value;

  if (!productId) return;

  const { error } = await client
    .from(config.productsTable)
    .update({ image_url: imageUrl })
    .eq("id", productId);

  if (error) {
    window.alert(error.message || "Failed to set main image.");
    return;
  }

  form.current_image_url.value = imageUrl;
  setStatus("Main image updated.");
  await loadProducts();
}

function deleteGalleryImage(index) {
  const confirmed = window.confirm("Delete this gallery image?");

  if (!confirmed) return;

  const gallery = parseGallery(form.current_gallery.value);
  gallery.splice(Number(index), 1);
  form.current_gallery.value = JSON.stringify(gallery);
  renderProductGallery(gallery);
}

async function resolveCategoryImageUrl(formData) {
  const config = getAdminConfig();
  const file = document.getElementById("categoryImageFile").files[0];
  const currentImageUrl = formData.get("current_image_url");

  if (!file) {
    return currentImageUrl || "";
  }

  return uploadFile(file, config.storageBucket, "categories");
}

async function saveCategory(formData, imageUrl) {
  await ensureAdminSession();

  const id = formData.get("id");
  const name = clean(formData.get("name"));
  const slug = clean(formData.get("slug")) || slugify(name);
  const link = clean(formData.get("link")) || `product.html?category=${encodeURIComponent(slug || name)}`;
  const payload = {
    name,
    slug,
    image_url: imageUrl,
    description: clean(formData.get("description")),
    link,
    sort_order: Number(formData.get("sort_order") || 0),
    status: clean(formData.get("status")) || "published"
  };

  if (!payload.name) {
    throw new Error("Category name is required.");
  }

  if (id) {
    const { error } = await client.from("categories").update(payload).eq("id", id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("categories").insert([payload]);
  if (error) throw error;
}

async function loadCategories() {
  await ensureAdminSession();

  categoryList.innerHTML = "<p>Loading categories...</p>";

  try {
    const { data, error } = await client
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;
    renderCategories(data || []);
  } catch (error) {
    categoryList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderCategories(categories) {
  if (!categories.length) {
    categoryList.innerHTML = "<p>No categories yet.</p>";
    return;
  }

  categoryList.innerHTML = categories.map((category) => `
    <article class="admin-product">
      <img src="${escapeAttribute(category.image_url || "")}" alt="">
      <div>
        <h3>${escapeHtml(category.name || "Untitled Category")}</h3>
        <p>${escapeHtml(category.slug || "")}</p>
        <p>${escapeHtml(category.description || "")}</p>
        <p>${escapeHtml(category.link || "")}</p>
        <span class="status-pill">${escapeHtml(category.status || "hidden")}</span>
      </div>
      <div class="admin-product-actions">
        <button type="button" data-action="edit" data-id="${escapeAttribute(category.id)}">Edit</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(category.id)}">Delete</button>
      </div>
    </article>
  `).join("");

  categoryList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const category = categories.find((item) => item.id === button.dataset.id);

      if (button.dataset.action === "edit") editCategory(category);
      if (button.dataset.action === "delete") deleteCategory(category);
    });
  });
}

function editCategory(category) {
  if (!category) return;

  categoryForm.id.value = category.id || "";
  categoryForm.current_image_url.value = category.image_url || "";
  categoryForm.name.value = category.name || "";
  categoryForm.slug.value = category.slug || slugify(category.name || "");
  categoryForm.description.value = category.description || "";
  categoryForm.link.value = category.link || "";
  categoryForm.sort_order.value = category.sort_order || 0;
  categoryForm.status.value = category.status === "draft" ? "hidden" : category.status || "published";
  categorySubmitButton.textContent = "Update Category";
  cancelCategoryEditButton.hidden = false;
  categoryStatus.textContent = "Editing category.";
}

async function deleteCategory(category) {
  await ensureAdminSession();

  if (!category) return;

  const confirmed = window.confirm(`Delete ${category.name || "this category"}?`);
  if (!confirmed) return;

  const { error } = await client.from("categories").delete().eq("id", category.id);

  if (error) {
    categoryStatus.textContent = error.message || "Failed to delete category.";
    return;
  }

  categoryStatus.textContent = "Category deleted.";
  await loadCategories();
}

function resetCategoryForm() {
  categoryForm.reset();
  categoryForm.id.value = "";
  categoryForm.current_image_url.value = "";
  categorySubmitButton.textContent = "Add Category";
  cancelCategoryEditButton.hidden = true;
}

async function resolveFactoryVideoUrl(formData) {
  const session = await ensureAdminSession();
  console.log("Authenticated factory video user:", session.user?.email || "unknown");

  const file = document.getElementById("factoryVideoFile").files[0];
  const currentVideoUrl = formData.get("current_video_url");

  if (!file) {
    if (currentVideoUrl) return currentVideoUrl;
    throw new Error("Please choose an MP4 video.");
  }

  return uploadFile(file, "factory-videos", "homepage");
}

async function saveFactoryVideo(formData, videoUrl) {
  const session = await ensureAdminSession();
  console.log("Authenticated factory media user:", session.user?.email || "unknown");

  const id = formData.get("id");
  const payload = {
    title: clean(formData.get("title")),
    description: clean(formData.get("description")),
    video_url: videoUrl,
    sort_order: Number(formData.get("sort_order") || 0),
    status: clean(formData.get("status")) || "published"
  };

  if (!payload.title) {
    throw new Error("Video title is required.");
  }

  if (id) {
    const { error } = await client.from("factory_media").update(payload).eq("id", id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("factory_media").insert([payload]);
  if (error) throw error;
}

async function loadFactoryVideos() {
  await ensureAdminSession();

  factoryVideoList.innerHTML = "<p>Loading videos...</p>";

  try {
    const { data, error } = await client
      .from("factory_media")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;
    renderFactoryVideos(data || []);
  } catch (error) {
    factoryVideoList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderFactoryVideos(videos) {
  if (!videos.length) {
    factoryVideoList.innerHTML = "<p>No factory videos yet.</p>";
    return;
  }

  factoryVideoList.innerHTML = videos.map((video) => `
    <article class="admin-product">
      <video class="admin-video-preview" src="${escapeAttribute(video.video_url || "")}" muted></video>
      <div>
        <h3>${escapeHtml(video.title || "Untitled Video")}</h3>
        <p>${escapeHtml(video.description || "")}</p>
        <span class="status-pill">${escapeHtml(video.status || "draft")}</span>
      </div>
      <div class="admin-product-actions">
        <button type="button" data-action="edit" data-id="${escapeAttribute(video.id)}">Edit</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(video.id)}">Delete</button>
      </div>
    </article>
  `).join("");

  factoryVideoList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const video = videos.find((item) => item.id === button.dataset.id);

      if (button.dataset.action === "edit") editFactoryVideo(video);
      if (button.dataset.action === "delete") deleteFactoryVideo(video);
    });
  });
}

function editFactoryVideo(video) {
  if (!video) return;

  factoryForm.id.value = video.id || "";
  factoryForm.current_video_url.value = video.video_url || "";
  factoryForm.title.value = video.title || "";
  factoryForm.description.value = video.description || "";
  factoryForm.sort_order.value = video.sort_order || 0;
  factoryForm.status.value = video.status || "published";
  factorySubmitButton.textContent = "Update Video";
  cancelFactoryEditButton.hidden = false;
  factoryStatus.textContent = "Editing video.";
}

async function deleteFactoryVideo(video) {
  await ensureAdminSession();

  if (!video) return;

  const confirmed = window.confirm(`Delete ${video.title || "this video"}?`);
  if (!confirmed) return;

  const { error } = await client.from("factory_media").delete().eq("id", video.id);

  if (error) {
    factoryStatus.textContent = error.message || "Failed to delete video.";
    return;
  }

  factoryStatus.textContent = "Video deleted.";
  await loadFactoryVideos();
}

function resetFactoryForm() {
  factoryForm.reset();
  factoryForm.id.value = "";
  factoryForm.current_video_url.value = "";
  factorySubmitButton.textContent = "Add Video";
  cancelFactoryEditButton.hidden = true;
}

async function loadInquiries() {
  await ensureAdminSession();

  inquiryList.innerHTML = "<p>Loading inquiries...</p>";

  try {
    const { data, error } = await client
      .from("inquiries")
      .select("id,name,email,whatsapp,product,message,status,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    renderInquiries(data || []);
  } catch (error) {
    inquiryList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderInquiries(inquiries) {
  if (!inquiries.length) {
    inquiryList.innerHTML = "<p>No inquiries yet.</p>";
    return;
  }

  inquiryList.innerHTML = inquiries.map((inquiry) => `
    <article class="admin-inquiry" data-inquiry-id="${escapeAttribute(inquiry.id)}">
      <div>
        <h3>${escapeHtml(inquiry.name || "Unnamed Customer")}</h3>
        <select class="inquiry-status-select" data-action="status" data-id="${escapeAttribute(inquiry.id)}">
          ${renderStatusOptions(inquiry.status)}
        </select>
        <div class="inquiry-meta">
          <p><strong>Email:</strong> ${escapeHtml(inquiry.email || "-")}</p>
          <p><strong>WhatsApp:</strong> ${escapeHtml(inquiry.whatsapp || "-")}</p>
          <p><strong>Interested Product:</strong> ${escapeHtml(inquiry.product || "-")}</p>
          <p><strong>Submitted:</strong> ${escapeHtml(formatDate(inquiry.created_at))}</p>
        </div>
        <div class="inquiry-detail" hidden>
          <p class="inquiry-message">${escapeHtml(inquiry.message || "")}</p>
        </div>
      </div>
      <div class="inquiry-actions">
        <button type="button" data-action="view" data-id="${escapeAttribute(inquiry.id)}">View Details</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(inquiry.id)}">Delete</button>
      </div>
    </article>
  `).join("");

  inquiryList.querySelectorAll('button[data-action="view"]').forEach((button) => {
    button.addEventListener("click", () => {
      toggleInquiryDetail(button);
    });
  });

  inquiryList.querySelectorAll('button[data-action="delete"]').forEach((button) => {
    button.addEventListener("click", () => {
      console.log("delete button clicked");
      const inquiry = inquiries.find((item) => String(item.id) === String(button.dataset.id));
      deleteInquiry(inquiry);
    });
  });

  inquiryList.querySelectorAll(".inquiry-status-select").forEach((select) => {
    select.addEventListener("change", () => {
      updateInquiryStatus(select.dataset.id, select.value);
    });
  });
}

function renderStatusOptions(status) {
  const current = normalizeInquiryStatus(status);
  const statuses = ["new", "replied", "closed"];

  return statuses.map((item) => `
    <option value="${item}" ${item === current ? "selected" : ""}>${capitalize(item)}</option>
  `).join("");
}

function normalizeInquiryStatus(status) {
  const value = String(status || "new").toLowerCase();
  return ["new", "replied", "closed"].includes(value) ? value : "new";
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toggleInquiryDetail(button) {
  const card = button.closest(".admin-inquiry");
  const detail = card?.querySelector(".inquiry-detail");

  if (!detail) return;

  detail.hidden = !detail.hidden;
  button.textContent = detail.hidden ? "View Details" : "Hide Details";
}

async function updateInquiryStatus(id, status) {
  await ensureAdminSession();

  const { error } = await client
    .from("inquiries")
    .update({ status })
    .eq("id", id);

  if (error) {
    window.alert(error.message || "Failed to update inquiry status.");
    await loadInquiries();
  }
}

async function deleteInquiry(inquiry) {
  await ensureAdminSession();

  if (!inquiry) return;

  const confirmed = window.confirm(`Delete inquiry from ${inquiry.name || "this customer"}?`);

  if (!confirmed) return;

  console.log("deleting inquiry id", inquiry.id);

  const { data, error } = await client
    .from("inquiries")
    .delete()
    .eq("id", inquiry.id)
    .select();

  if (error) {
    console.log("delete error", error);
    window.alert(error.message || "Failed to delete inquiry.");
    return;
  }

  console.log("delete success", data);
  await loadInquiries();
}

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString();
}

function resetForm() {
  form.reset();
  form.id.value = "";
  form.current_image_url.value = "";
  form.current_video_url.value = "";
  form.current_gallery.value = "";
  form.remove_product_video.value = "";
  productGalleryList.innerHTML = "";
  productVideoStatus.textContent = "";
  removeProductVideoButton.hidden = true;
  submitButton.textContent = "Add Product";
  cancelEditButton.hidden = true;
}

function setBusy(isBusy) {
  setButtonBusy(submitButton, isBusy);
}

function setButtonBusy(button, isBusy) {
  button.disabled = isBusy;
  button.classList.toggle("is-loading", isBusy);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseGallery(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeGallery(value) {
  return parseGallery(value);
}

function setStatus(message) {
  statusText.textContent = message;
}

function getAdminConfig() {
  const config = window.XIQI_CONFIG;

  if (!config) {
    throw new Error("XIQI_CONFIG missing. Please check supabase-config.js loading order.");
  }

  return config;
}

function showBlockingAdminError(message) {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

window.XIQI_ADMIN_READY
  .then(() => initAdmin())
  .catch((error) => {
    console.warn(error.message || "Admin authentication failed.");
  });
