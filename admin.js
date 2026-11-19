const config = window.XIQI_CONFIG;
const client = window.XIQI_ADMIN_CLIENT;

if (!config) {
  showBlockingAdminError("缺少 XIQI_CONFIG，请检查 supabase-config.js 的加载顺序。");
  throw new Error("缺少 XIQI_CONFIG，请检查 supabase-config.js 的加载顺序。");
}

if (!client) {
  showBlockingAdminError("缺少已认证的 Supabase 客户端，请检查 admin-auth.js 的加载顺序。");
  throw new Error("缺少已认证的 Supabase 客户端，请检查 admin-auth.js 的加载顺序。");
}

const form = document.getElementById("productForm");
const productCategorySelect = form?.elements.namedItem("category");
const statusText = document.getElementById("formStatus");
const productList = document.getElementById("productList");
const refreshButton = document.getElementById("refreshProducts");
const inquiryList = document.getElementById("inquiryList");
const analyticsRange = document.getElementById("analyticsRange");
const refreshInquiriesButton = document.getElementById("refreshInquiries");
const categoryForm = document.getElementById("categoryForm");
const categoryList = document.getElementById("categoryList");
const refreshCategoriesButton = document.getElementById("refreshCategories");
const cancelCategoryEditButton = document.getElementById("cancelCategoryEdit");
const categoryStatus = document.getElementById("categoryStatus");
const categorySubmitButton = categoryForm?.querySelector('button[type="submit"]');
const factoryForm = document.getElementById("factoryForm");
const factoryVideoList = document.getElementById("factoryVideoList");
const refreshFactoryVideosButton = document.getElementById("refreshFactoryVideos");
const cancelFactoryEditButton = document.getElementById("cancelFactoryEdit");
const factoryStatus = document.getElementById("factoryStatus");
const factorySubmitButton = factoryForm?.querySelector('button[type="submit"]');
const productGalleryList = document.getElementById("productGalleryList");
const removeProductVideoButton = document.getElementById("removeProductVideo");
const productVideoStatus = document.getElementById("productVideoStatus");
const cancelEditButton = document.getElementById("cancelEdit");
const submitButton = form?.querySelector('button[type="submit"]');
let adminSession = null;
let productCategoriesReady = false;
let productCategoryRows = [];

async function adminWrite(table,action,id,payload) {
  const session=await ensureAdminSession();
  try {
    const response=await fetch('/api/admin-write',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({table,action,id:id||undefined,payload})});
    const result=await response.json();
    if(!response.ok)return{data:null,error:{message:result.error||'管理员写入被拒绝'}};
    return{data:result.data,error:null};
  }catch{return{data:null,error:{message:'后台保存未完成，请检查记录后再重试。'}};}
}

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
    throw new Error("需要先登录后台。");
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
  translateAdminInterface();
  try {
    await ensureAdminSession();
    await Promise.all([
      ...(form ? [(async () => { await loadProductCategoryOptions(); await loadProducts(); })()] : []),
      ...(categoryForm ? [loadCategories()] : []),
      ...(factoryForm ? [loadFactoryVideos()] : []),
      ...(inquiryList ? [loadInquiries()] : []),
      ...(analyticsRange ? [loadAnalytics()] : [])
    ]);
  } catch (error) {
    console.warn(error.message || "Admin session unavailable.");
  }
}

function translateAdminInterface() {
  const translations = new Map([
    ["XiQi Admin", "XiQi 后台管理"], ["Dashboard", "控制台"], ["Products", "产品管理"],
    ["Categories", "分类管理"], ["Factory Videos", "工厂视频"], ["Inquiries", "询盘管理"],
    ["View Website", "查看网站"], ["Logout", "退出登录"], ["Manage your website from one place.", "网站后台数据概览"],
    ["Manage Products", "管理产品"], ["Manage Categories", "管理分类"], ["Manage Videos", "管理工厂视频"], ["View Inquiries", "查看询盘"],
    ["Manage products, media and publishing status.", "管理网站产品信息"], ["Manage product categories.", "管理产品分类"],
    ["Manage factory showcase videos.", "管理工厂展示视频"], ["Review customer inquiries and requested products.", "查看客户询盘和所需产品"],
    ["Products List", "产品列表"], ["Category List", "分类列表"], ["Video List", "视频列表"], ["Inquiry List", "询盘列表"], ["Refresh", "刷新"],
    ["Product Name", "产品名称"], ["Category", "产品分类"], ["Sort Order", "排序"], ["Status", "状态"], ["Published", "已发布"], ["Draft", "草稿"], ["Hidden", "已停用"],
    ["Price", "价格"], ["MOQ", "最小起订量"], ["Material", "材质"], ["Packaging", "包装方式"], ["Lead Time", "交货周期"], ["Short Description", "简短描述"], ["Description", "产品描述"], ["Features", "产品特点"], ["Product Image", "产品主图"], ["Product Gallery Upload", "产品图集上传"], ["Product Video Upload", "产品视频上传"], ["Delete Product Video", "删除产品视频"], ["Add Product", "添加产品"], ["Cancel Edit", "取消编辑"],
    ["Category Name", "分类名称"], ["Slug", "分类标识"], ["Link", "链接"], ["Category Image", "分类图片"], ["Add Category", "添加分类"],
    ["Video Title", "视频标题"], ["MP4 Video", "上传 MP4 视频"], ["Add Video", "添加视频"],
    ["Inquiry Management", "询盘管理"], ["Inquiry Details", "询盘详情"], ["Name", "客户姓名"], ["Email", "邮箱"], ["Message", "留言"], ["Date", "提交时间"], ["View Details", "查看详情"],
  ]);
  document.title = document.title.replace("XiQi Admin", "XiQi 后台").replace("Products", "产品管理").replace("Categories", "分类管理").replace("Factory Videos", "工厂视频").replace("Inquiries", "询盘管理").replace("Dashboard", "控制台");
  document.querySelectorAll("body *:not(script):not(style)").forEach((element) => {
    if (element.children.length === 0) {
      const value = element.textContent.trim();
      if (translations.has(value)) element.textContent = translations.get(value);
    }
  });
  const nav = document.querySelector(".admin-sidebar nav");
  if (nav && !nav.querySelector('a[href="admin-analytics.html"]')) nav.insertAdjacentHTML("beforeend", '<a href="admin-analytics.html">广告数据</a>');
}

async function loadAnalytics() {
  const status = document.getElementById("analyticsStatus");
  if (status) status.textContent = "正在加载广告数据...";
  try {
    const response = await fetch(`/api/analytics-query?range=${encodeURIComponent(analyticsRange?.value || "today")}`, { headers: { Authorization: `Bearer ${window.XIQI_ADMIN_SESSION?.access_token || ""}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "广告数据加载失败。");
    renderAnalytics(result.events || [], result.productNames || {});
    if (status) status.textContent = "";
  } catch (error) { if (status) status.textContent = error.message || "广告数据加载失败。"; }
}

function renderAnalytics(events, productNames = {}) {
  const counts = { product_view: 0, add_to_inquiry: 0, inquiry_submit: 0 };
  const campaignRows = new Map(); const productRows = new Map();
  const labels = { turkey: "土耳其", iraq: "伊拉克", brazil: "巴西" };
  events.forEach((event) => {
    if (counts[event.event_type] !== undefined) counts[event.event_type] += 1;
    const key = event.campaign || "未知 Campaign"; const row = campaignRows.get(key) || { key, ad_visit: 0, product_view: 0, add_to_inquiry: 0, inquiry_submit: 0 };
    if (row[event.event_type] !== undefined) row[event.event_type] += 1; campaignRows.set(key, row);
    if (event.product_id && ["product_view", "add_to_inquiry"].includes(event.event_type)) { const p = productRows.get(event.product_id) || { id: event.product_id, product_view: 0, add_to_inquiry: 0 }; p[event.event_type] += 1; productRows.set(event.product_id, p); }
  });
  const sessions = new Set(events.filter((event) => event.event_type === "ad_visit").map((event) => `${event.session_id || event.campaign || ""}`)).size;
  document.getElementById("analyticsStats").innerHTML = [["广告访问", sessions], ["产品浏览", counts.product_view], ["加入询盘", counts.add_to_inquiry], ["提交询盘", counts.inquiry_submit], ["询盘转化率", `${sessions ? ((counts.inquiry_submit / sessions) * 100).toFixed(1) : "0.0"}%`]].map(([label, value]) => `<div class="admin-stat-card"><strong>${escapeHtml(String(value))}</strong><span>${label}</span></div>`).join("");
  document.getElementById("analyticsCampaigns").innerHTML = `<table class="analytics-table"><thead><tr><th>国家 / Campaign</th><th>广告访问</th><th>产品浏览</th><th>加入询盘</th><th>提交询盘</th></tr></thead><tbody>${[...campaignRows.values()].map((row) => `<tr><td>${escapeHtml(labels[row.key] || row.key)}</td><td>${row.ad_visit}</td><td>${row.product_view}</td><td>${row.add_to_inquiry}</td><td>${row.inquiry_submit}</td></tr>`).join("") || '<tr><td colspan="5">暂无广告数据</td></tr>'}</tbody></table>`;
  document.getElementById("analyticsProducts").innerHTML = `<table class="analytics-table"><thead><tr><th>产品名称</th><th>产品 ID</th><th>产品浏览次数</th><th>加入询盘次数</th></tr></thead><tbody>${[...productRows.values()].map((row) => `<tr><td>${escapeHtml(productNames[row.id] || "未知产品")}</td><td>${escapeHtml(row.id)}</td><td>${row.product_view}</td><td>${row.add_to_inquiry}</td></tr>`).join("") || '<tr><td colspan="4">暂无热门产品数据</td></tr>'}</tbody></table>`;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (submitButton.disabled) return;

  setBusy(true);
  setStatus("正在保存产品...");

  try {
    await ensureAdminSession();
    if (!productCategoriesReady || !productCategorySelect?.value) {
      throw new Error(productCategoriesReady ? "请选择产品分类。" : "产品分类加载失败，请刷新页面重试");
    }
    const formData = new FormData(form);
    const id = formData.get("id");
    const imageUrl = await resolveImageUrl(formData);
    const videoUrl = await resolveProductVideoUrl(formData);
    const gallery = await resolveGalleryUrls(formData);
    const savedProduct = await saveProduct(formData, imageUrl, videoUrl, gallery);
    const linked = await window.XIQI_LINK_IMAGES('products', savedProduct.id, [imageUrl, ...gallery], adminSession);
    const previousUrls=[formData.get('current_image_url'),formData.get('current_video_url'),...normalizeGallery(formData.get('current_gallery'))].filter(url=>url&&![imageUrl,videoUrl,...gallery].includes(url));
    const cleanup=await window.XIQI_CLEANUP_MANAGED_URLS(previousUrls,adminSession).catch(()=>({pending:1}));
    resetForm();
    setStatus(linked ? (id ? "产品已更新。" : "产品已添加。") : "商品已保存，图片关联待核对；不要重复新增商品。");
    if(cleanup.pending)setStatus('商品已保存，部分旧受管媒体等待安全清理；原始文件保留。');
    await loadProducts();
  } catch (error) {
    setStatus(error.message || "产品保存失败。");
  } finally {
    setBusy(false);
  }
});

refreshButton?.addEventListener("click", loadProducts);
refreshInquiriesButton?.addEventListener("click", loadInquiries);
cancelEditButton?.addEventListener("click", resetForm);
refreshCategoriesButton?.addEventListener("click", loadCategories);
cancelCategoryEditButton?.addEventListener("click", resetCategoryForm);
refreshFactoryVideosButton?.addEventListener("click", loadFactoryVideos);
cancelFactoryEditButton?.addEventListener("click", resetFactoryForm);
removeProductVideoButton?.addEventListener("click", () => {
  form.current_video_url.value = "";
  form.remove_product_video.value = "1";
  removeProductVideoButton.hidden = true;
  productVideoStatus.textContent = "产品视频将在保存后删除。";
});

categoryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (categorySubmitButton.disabled) return;

  setButtonBusy(categorySubmitButton, true);
  categoryStatus.textContent = "正在保存分类...";

  try {
    await ensureAdminSession();
    const formData = new FormData(categoryForm);
    const id = formData.get("id");
    const imageUrl = await resolveCategoryImageUrl(formData);
    const savedCategory = await saveCategory(formData, imageUrl);
    const linked = await window.XIQI_LINK_IMAGES('categories', savedCategory.id, imageUrl ? [imageUrl] : [], adminSession);
    const cleanup=await window.XIQI_CLEANUP_MANAGED_URLS([formData.get('current_image_url')].filter(url=>url&&url!==imageUrl),adminSession).catch(()=>({pending:1}));
    resetCategoryForm();
    categoryStatus.textContent = linked ? (id ? "分类已更新。" : "分类已添加。") : "分类已保存，图片关联待核对；不要重复新增分类。";
    if(cleanup.pending)categoryStatus.textContent='分类已保存，旧受管图片等待安全清理。';
    await loadCategories();
  } catch (error) {
    categoryStatus.textContent = error.message || "分类保存失败。";
  } finally {
    setButtonBusy(categorySubmitButton, false);
  }
});

factoryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (factorySubmitButton.disabled) return;

  setButtonBusy(factorySubmitButton, true);
  factoryStatus.textContent = "正在保存视频...";

  try {
    await ensureAdminSession();
    const formData = new FormData(factoryForm);
    const id = formData.get("id");
    const videoUrl = await resolveFactoryVideoUrl(formData);
    await saveFactoryVideo(formData, videoUrl);
    const cleanup=await window.XIQI_CLEANUP_MANAGED_URLS([formData.get('current_video_url')].filter(url=>url&&url!==videoUrl),adminSession).catch(()=>({pending:1}));
    resetFactoryForm();
    factoryStatus.textContent = id ? "视频已更新。" : "视频已添加。";
    if(cleanup.pending)factoryStatus.textContent='视频已保存，旧受管视频等待安全清理。';
    await loadFactoryVideos();
  } catch (error) {
    factoryStatus.textContent = error.message || "视频保存失败。";
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
    throw new Error("请选择产品主图。");
  }

  return uploadImage(file);
}

async function uploadImage(file, folder = '') {
  const session = await ensureAdminSession();
  return window.XIQI_UPLOAD_IMAGE(file, session, () => uploadFile(file, getAdminConfig().storageBucket, folder));
}

async function uploadFile(file, bucket, folder) {
  const session=await ensureAdminSession();
  const capability=await window.XIQI_MEDIA_CAPABILITY();
  if(capability.storageProvider==='r2'){
    if(!capability.mediaUploadV2||!capability.serverVideoUploads||!file.type.startsWith('video/')||!window.XIQI_MANAGED_UPLOAD)throw Error('R2视频上传未启用，禁止回退写入Supabase');
    return window.XIQI_MANAGED_UPLOAD(file,session);
  }
  // Compatibility image upload is also authenticated on the server; no browser Storage writes.
  if(!file.type.startsWith('image/')||file.size>2*1024*1024)throw Error('视频上传请使用已配置的R2服务端通道；旧视频播放不受影响。');
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('无法读取图片'));r.readAsDataURL(file);});
  const response=await fetch('/api/image-upload',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({requestId:crypto.randomUUID(),mime:file.type,data})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'图片上传失败');return result.asset.url;
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
    throw new Error("产品名称为必填项。");
  }
  if (!productCategoriesReady || !payload.category) {
    throw new Error(productCategoriesReady ? "请选择产品分类。" : "产品分类加载失败，请刷新页面重试");
  }

  if (id) {
    const { data, error } = await adminWrite('products','update',id,payload);

    if (error) throw error;
    return data;
  }

  const { data, error } = await adminWrite('products','create',null,payload);

  if (error) throw error;
  return data;
}

async function resolveGalleryUrls(formData) {
  const config = getAdminConfig();
  const files = Array.from(document.getElementById("galleryFiles").files || []);
  const currentGallery = parseGallery(formData.get("current_gallery"));

  if (!files.length) return currentGallery;

  for (let index = 0; index < files.length; index += 1) {
    const imageUrl = await uploadImage(files[index], "product-gallery");
    currentGallery.push(imageUrl);
  }

  return currentGallery;
}

async function loadProducts() {
  await ensureAdminSession();
  const config = getAdminConfig();

  productList.innerHTML = "<p>正在加载产品...</p>";

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

async function loadProductCategoryOptions() {
  if (!productCategorySelect) return;

  productCategoriesReady = false;
  productCategorySelect.disabled = true;
  productCategoryRows = [];
  productCategorySelect.replaceChildren(new Option("请选择产品分类", ""));

  try {
    await ensureAdminSession();
    const { data, error } = await client
      .from("categories")
      .select("id,name,slug,status,sort_order")
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    productCategoryRows = (data || []).filter((category) => clean(category.name));
    for (const category of productCategoryRows) {
      productCategorySelect.add(new Option(category.name, category.name));
    }

    productCategoriesReady = productCategoryRows.length > 0;
    productCategorySelect.disabled = !productCategoriesReady;
    if (!productCategoriesReady) {
      setStatus("暂无可用的已发布产品分类。");
    }
  } catch (error) {
    productCategorySelect.replaceChildren(new Option("请选择产品分类", ""));
    productCategorySelect.disabled = true;
    setStatus("产品分类加载失败，请刷新页面重试");
    console.warn("产品分类加载失败。", error?.message || error);
  }
}

function ensureProductCategoryOption(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value || !productCategorySelect) return;
  const exists = Array.from(productCategorySelect.options).some((option) => option.value === value);
  if (exists) return;

  const normalized = value.toLocaleLowerCase();
  const matchingCategory = productCategoryRows.find((category) =>
    [category.name, category.slug].some((candidate) => String(candidate || "").trim().toLocaleLowerCase() === normalized)
  );
  const displayName = matchingCategory ? `${matchingCategory.name}（现有值：${value}）` : value;
  const legacyOption = new Option(displayName, value);
  legacyOption.dataset.legacy = "true";
  productCategorySelect.add(legacyOption);
}

function renderProducts(products) {
  if (!products.length) {
    productList.innerHTML = "<p>暂无产品。</p>";
    return;
  }

  productList.innerHTML = products.map((product) => `
    <article class="admin-product">
      <img src="${escapeAttribute(product.image_url || "")}" alt="">
      <div>
        <h3>${escapeHtml(product.name || "未命名产品")}</h3>
        <p>${escapeHtml(product.category || "Uncategorized")}</p>
        <p>${escapeHtml(product.short_desc || "")}</p>
        <p>${escapeHtml(product.price || "")}</p>
      </div>
      <div class="admin-product-actions">
        <button type="button" data-action="edit" data-id="${escapeAttribute(product.id)}">编辑</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(product.id)}">删除</button>
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
  ensureProductCategoryOption(product.category || "");
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
  productVideoStatus.textContent = (product.video_url || product.product_video) ? "已添加产品视频。" : "";
  submitButton.textContent = "更新产品";
  cancelEditButton.hidden = false;
  setStatus("正在编辑产品。");
  renderProductGallery(normalizeGallery(product.gallery));
}

async function deleteProduct(product) {
  await ensureAdminSession();
  const config = getAdminConfig();

  if (!product) return;

  const confirmed = window.confirm(`确定要删除${product.name || "这个产品"}吗？`);

  if (!confirmed) return;

  setStatus("正在删除产品...");
  await deleteProductStorageFiles(product);
  const { error } = await adminWrite('products','delete',product.id);

  if (error) {
    setStatus(error.message || "产品删除失败。");
    return;
  }

  setStatus("产品已删除。");
  const cleanup=await window.XIQI_CLEANUP_MANAGED_URLS([product.image_url,product.video_url,...normalizeGallery(product.gallery)].filter(Boolean),adminSession).catch(()=>({pending:1}));
  if(cleanup.pending)setStatus('产品记录已删除，新受管媒体等待安全清理；迁移原文件保留。');
  await loadProducts();
}

async function deleteProductStorageFiles(product) {
  await window.XIQI_REQUEST_MEDIA_DELETE('products',product.id,adminSession);
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
    productGalleryList.innerHTML = "<p>暂无图集图片。</p>";
    return;
  }

  productGalleryList.innerHTML = images.map((image, index) => `
    <article class="gallery-manage-item">
      <img src="${escapeAttribute(image)}" alt="">
      <input type="number" value="${index + 1}" data-action="sort" data-index="${index}">
      <button type="button" data-action="main" data-url="${escapeAttribute(image)}">Set Main</button>
      <button type="button" data-action="delete" data-index="${index}">删除</button>
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

  const { error } = await adminWrite('products','update',productId,{image_url:imageUrl});

  if (error) {
    window.alert(error.message || "设置主图失败。");
    return;
  }

  form.current_image_url.value = imageUrl;
  setStatus("主图已更新。");
  await loadProducts();
}

function deleteGalleryImage(index) {
  const confirmed = window.confirm("确定要删除这张图集图片吗？");

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

  return uploadImage(file, "categories");
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
    throw new Error("分类名称为必填项。");
  }

  if (id) {
    const { data, error } = await adminWrite('categories','update',id,payload);
    if (error) throw error;
    return data;
  }

  const { data, error } = await adminWrite('categories','create',null,payload);
  if (error) throw error;
  return data;
}

async function loadCategories() {
  await ensureAdminSession();

  categoryList.innerHTML = "<p>正在加载分类...</p>";

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
    categoryList.innerHTML = "<p>暂无分类。</p>";
    return;
  }

  categoryList.innerHTML = categories.map((category) => `
    <article class="admin-product">
      <img src="${escapeAttribute(category.image_url || "")}" alt="">
      <div>
        <h3>${escapeHtml(category.name || "未命名分类")}</h3>
        <p>${escapeHtml(category.slug || "")}</p>
        <p>${escapeHtml(category.description || "")}</p>
        <p>${escapeHtml(category.link || "")}</p>
        <span class="status-pill">${escapeHtml(category.status || "hidden")}</span>
      </div>
      <div class="admin-product-actions">
        <button type="button" data-action="edit" data-id="${escapeAttribute(category.id)}">编辑</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(category.id)}">删除</button>
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
  categorySubmitButton.textContent = "更新分类";
  cancelCategoryEditButton.hidden = false;
  categoryStatus.textContent = "正在编辑分类。";
}

async function deleteCategory(category) {
  await ensureAdminSession();

  if (!category) return;

  const confirmed = window.confirm(`确定要删除${category.name || "这个分类"}吗？`);
  if (!confirmed) return;
  await window.XIQI_REQUEST_MEDIA_DELETE('categories',category.id,adminSession);

  const { error } = await adminWrite('categories','delete',category.id);

  if (error) {
    categoryStatus.textContent = error.message || "分类删除失败。";
    return;
  }

  categoryStatus.textContent = "分类已删除。";
  await window.XIQI_CLEANUP_MANAGED_URLS([category.image_url].filter(Boolean),adminSession).catch(()=>{});
  await loadCategories();
}

function resetCategoryForm() {
  categoryForm.reset();
  categoryForm.id.value = "";
  categoryForm.current_image_url.value = "";
  categorySubmitButton.textContent = "添加分类";
  cancelCategoryEditButton.hidden = true;
}

async function resolveFactoryVideoUrl(formData) {
  const session = await ensureAdminSession();
  console.log("Authenticated factory video user:", session.user?.email || "unknown");

  const file = document.getElementById("factoryVideoFile").files[0];
  const currentVideoUrl = formData.get("current_video_url");

  if (!file) {
    if (currentVideoUrl) return currentVideoUrl;
    throw new Error("请选择 MP4 视频。");
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
    const { error } = await adminWrite('factory_media','update',id,payload);
    if (error) throw error;
    return;
  }

  const { error } = await adminWrite('factory_media','create',null,payload);
  if (error) throw error;
}

async function loadFactoryVideos() {
  await ensureAdminSession();

  factoryVideoList.innerHTML = "<p>正在加载视频...</p>";

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
    factoryVideoList.innerHTML = "<p>暂无工厂视频。</p>";
    return;
  }

  factoryVideoList.innerHTML = videos.map((video) => `
    <article class="admin-product">
      <video class="admin-video-preview" src="${escapeAttribute(video.video_url || "")}" muted></video>
      <div>
        <h3>${escapeHtml(video.title || "未命名视频")}</h3>
        <p>${escapeHtml(video.description || "")}</p>
        <span class="status-pill">${escapeHtml(video.status || "draft")}</span>
      </div>
      <div class="admin-product-actions">
        <button type="button" data-action="edit" data-id="${escapeAttribute(video.id)}">编辑</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(video.id)}">删除</button>
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
  factorySubmitButton.textContent = "更新视频";
  cancelFactoryEditButton.hidden = false;
  factoryStatus.textContent = "正在编辑视频。";
}

async function deleteFactoryVideo(video) {
  await ensureAdminSession();

  if (!video) return;

  const confirmed = window.confirm(`确定要删除${video.title || "这个视频"}吗？`);
  if (!confirmed) return;
  await window.XIQI_REQUEST_MEDIA_DELETE('factory_media',video.id,adminSession);

  const { error } = await adminWrite('factory_media','delete',video.id);

  if (error) {
    factoryStatus.textContent = error.message || "视频删除失败。";
    return;
  }

  factoryStatus.textContent = "视频已删除。";
  await window.XIQI_CLEANUP_MANAGED_URLS([video.video_url].filter(Boolean),adminSession).catch(()=>{});
  await loadFactoryVideos();
}

function resetFactoryForm() {
  factoryForm.reset();
  factoryForm.id.value = "";
  factoryForm.current_video_url.value = "";
  factorySubmitButton.textContent = "添加视频";
  cancelFactoryEditButton.hidden = true;
}

async function loadInquiries() {
  await ensureAdminSession();

  inquiryList.innerHTML = "<p>正在加载询盘...</p>";

  try {
    let result = await client
      .from("inquiries")
      .select("id,name,email,whatsapp,product,message,cart_items,status,created_at")
      .order("created_at", { ascending: false });

    if (result.error && /cart_items|column/i.test(result.error.message || "")) {
      result = await client
        .from("inquiries")
        .select("id,name,email,whatsapp,product,message,status,created_at")
        .order("created_at", { ascending: false });
    }

    const { data, error } = result;

    if (error) throw error;
    renderInquiries(data || []);
  } catch (error) {
    inquiryList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderInquiries(inquiries) {
  if (!inquiries.length) {
    inquiryList.innerHTML = "<p>暂无询盘。</p>";
    return;
  }

  inquiryList.innerHTML = inquiries.map((inquiry) => `
    <article class="admin-inquiry" data-inquiry-id="${escapeAttribute(inquiry.id)}">
      <div>
        <h3>${escapeHtml(inquiry.name || "未命名客户")}</h3>
        <select class="inquiry-status-select" data-action="status" data-id="${escapeAttribute(inquiry.id)}">
          ${renderStatusOptions(inquiry.status)}
        </select>
        <div class="inquiry-meta">
          <p><strong>邮箱：</strong> ${escapeHtml(inquiry.email || "-")}</p>
          <p><strong>WhatsApp：</strong> ${escapeHtml(inquiry.whatsapp || "-")}</p>
          <p><strong>意向产品：</strong> ${escapeHtml(inquiry.product || "-")}</p>
          ${renderAdminInquiryProducts(inquiry.cart_items)}
          <p><strong>提交时间：</strong> ${escapeHtml(formatDate(inquiry.created_at))}</p>
        </div>
        <div class="inquiry-detail" hidden>
          <p class="inquiry-message">${escapeHtml(inquiry.message || "")}</p>
        </div>
      </div>
      <div class="inquiry-actions">
        <button type="button" data-action="view" data-id="${escapeAttribute(inquiry.id)}">查看详情</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(inquiry.id)}">删除</button>
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

function renderAdminInquiryProducts(cartItems) {
  if (!Array.isArray(cartItems) || !cartItems.length) return "";
  return `<div class="admin-inquiry-cart"><h4>询盘产品</h4><div class="admin-inquiry-products">${cartItems.map((item) => {
    const image = safeInquiryImage(item.product_image);
    return `<article class="admin-inquiry-product">${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(item.product_name || "产品")}" loading="lazy" width="88" height="88">` : `<div class="admin-inquiry-product-placeholder" aria-hidden="true">暂无图片</div>`}<div><h5>${escapeHtml(item.product_name || item.product_id || "产品")}</h5><p><strong>产品 ID：</strong> ${escapeHtml(item.product_id || "-")}</p>${item.category ? `<p><strong>产品分类：</strong> ${escapeHtml(item.category)}</p>` : ""}<p><strong>数量：</strong> ${escapeHtml(item.quantity ?? "-")}</p>${item.note ? `<p><strong>备注：</strong> ${escapeHtml(item.note)}</p>` : ""}</div></article>`;
  }).join("")}</div></div>`;
}

function safeInquiryImage(value) {
  const image = String(value || "").trim();
  try { const url = new URL(image, window.location.href); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch { return ""; }
}

function renderStatusOptions(status) {
  const current = normalizeInquiryStatus(status);
  const statuses = ["new", "replied", "closed"];
  const labels = { new: "新询盘", replied: "已回复", closed: "已关闭" };

  return statuses.map((item) => `
    <option value="${item}" ${item === current ? "selected" : ""}>${labels[item] || item}</option>
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
  button.textContent = detail.hidden ? "查看详情" : "隐藏详情";
}

async function updateInquiryStatus(id, status) {
  await ensureAdminSession();

  const { error } = await adminWrite('inquiries','update',id,{status});

  if (error) {
    window.alert(error.message || "询盘状态更新失败。");
    await loadInquiries();
  }
}

async function deleteInquiry(inquiry) {
  await ensureAdminSession();

  if (!inquiry) return;

  const confirmed = window.confirm(`确定要删除${inquiry.name || "这位客户"}的询盘吗？`);

  if (!confirmed) return;

  console.log("deleting inquiry id", inquiry.id);

  const { data: deletedRecord, error } = await adminWrite('inquiries','delete',inquiry.id);
  const data=deletedRecord?[deletedRecord]:[];

  if (error) {
    console.log("delete error", error);
    window.alert(error.message || "询盘删除失败。");
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
  productCategorySelect?.querySelectorAll('option[data-legacy="true"]').forEach((option) => option.remove());
  if (productCategorySelect) productCategorySelect.selectedIndex = 0;
  form.id.value = "";
  form.current_image_url.value = "";
  form.current_video_url.value = "";
  form.current_gallery.value = "";
  form.remove_product_video.value = "";
  productGalleryList.innerHTML = "";
  productVideoStatus.textContent = "";
  removeProductVideoButton.hidden = true;
  submitButton.textContent = "添加产品";
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
    throw new Error("缺少 XIQI_CONFIG，请检查 supabase-config.js 的加载顺序。");
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
