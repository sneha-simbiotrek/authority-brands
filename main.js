let map;
let zipLayer;
let centerMarker;

let activeBrand = null;
let availabilityData = {};

// Columbus center
const COLUMBUS_CENTER = [39.9612, -82.9988];

// Brand metadata
const BRAND_META = {
  hwc: { name: "Homewatch CareGivers", icon: "assets/HWC.svg" },
  mse: { name: "Mister Sparky Electric", icon: "assets/MSE.svg" },
  msq: { name: "Mosquito Squad", icon: "assets/MSQ.svg" },
  tca: { name: "The Cleaning Authority", icon: "assets/TCA.svg" },
};

// Client requirement: all brands always available in clockface (no filter UI)
const FIXED_BRANDS = Object.keys(BRAND_META);

// UI refs
let locationInputEl = null;
let locationSearchBtnEl = null;

// Drawer refs
let brandDrawerEl = null;
let brandDrawerCloseEl = null;
let brandDrawerLogoEl = null;
let brandDrawerNameEl = null;
let downloadPdfBtnEl = null;

document.addEventListener("DOMContentLoaded", async () => {
  initMap();
  await loadAvailability();
  await loadZipGeoJson();

  setupUI();
  setupBrandDrawer();
});

//  MAP

function initMap() {
  map = L.map("map", {
    attributionControl: false,
  }).setView(COLUMBUS_CENTER, 7);

  // crossOrigin must be true so leaflet-image can render tiles into canvas reliably
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: false,
    crossOrigin: true,
  }).addTo(map);

  const zipRenderer = L.canvas({ padding: 0.5 });
  window.__zipRenderer = zipRenderer; // store it globally for reuse

  // Keep clockface inside map container (so it moves correctly)
  const clockface = document.getElementById("clockface");
  if (clockface && clockface.parentElement !== map.getContainer()) {
    map.getContainer().appendChild(clockface);
  }

  map.on("move zoom", positionClockface);
}

async function loadZipGeoJson() {
  const res = await fetch("data/columbus-zips.geojson");
  const geojson = await res.json();

  zipLayer = L.geoJSON(geojson, {
    renderer: window.__zipRenderer,

    style: defaultZipStyle,
    interactive: true,
    onEachFeature: (feature, layer) => {
      const zip = feature.properties.zip;
      layer.options.zipCode = zip;

      layer.on("mouseover", function () {
        this.setStyle({ weight: 2 });

        this.bindTooltip(`ZIP: ${zip}`, {
          sticky: true,
          direction: "top",
          offset: [0, -5],
          className: "zip-tooltip",
        }).openTooltip();
      });

      layer.on("mouseout", function () {
        if (activeBrand) paintZipAvailability();
        else this.setStyle(defaultZipStyle());
        this.closeTooltip();
      });

      layer.on("click", function (e) {
        L.DomEvent.stop(e);
      });
    },
  }).addTo(map);
}

function defaultZipStyle() {
  return {
    color: "#888",
    weight: 1,
    fillOpacity: 0,
  };
}

async function loadAvailability() {
  const res = await fetch("data/availability.json");
  availabilityData = await res.json();
}

//  TOPBAR SEARCH + AUTOCOMPLETE

function setupUI() {
  locationSearchBtnEl = document.getElementById("locationSearchBtn");
  locationInputEl = document.getElementById("locationInput");

  if (!locationSearchBtnEl || !locationInputEl) return;

  setupLocationAutocomplete();

  locationInputEl.addEventListener("input", updateSearchButtonState);

  locationInputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const parsed = parseLocationValue(locationInputEl.value);
    if (parsed === "columbus") runColumbusFlow();
    else alert("Demo only supports 'columbus'");
  });

  locationSearchBtnEl.addEventListener("click", () => {
    const parsed = parseLocationValue(locationInputEl.value);
    if (!parsed) return;

    if (parsed !== "columbus") {
      alert("Demo only supports 'columbus'");
      return;
    }

    runColumbusFlow();
  });

  updateSearchButtonState();
}

function updateSearchButtonState() {
  if (!locationInputEl || !locationSearchBtnEl) return;
  const hasLocation = locationInputEl.value.trim().length > 0;
  locationSearchBtnEl.disabled = !hasLocation;
}

function parseLocationValue(raw) {
  const v = (raw || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "columbus") return "columbus";
  if (v === "columbus, ohio") return "columbus";
  if (v.startsWith("columbus")) return "columbus";
  return v;
}

function runColumbusFlow() {
  map.setView(COLUMBUS_CENTER, 11);
  dropCenterPinAndOpenClockface();
}

function dropCenterPinAndOpenClockface() {
  if (centerMarker) map.removeLayer(centerMarker);

  centerMarker = L.marker(COLUMBUS_CENTER).addTo(map);

  centerMarker.bindTooltip("COLUMBUS", {
    permanent: true,
    direction: "bottom",
    offset: [-14, 24],
    opacity: 1,
  });

  showClockface();
}

/* Custom autocomplete (no datalist, no arrow) */
function setupLocationAutocomplete() {
  if (!locationInputEl) return;

  locationInputEl.removeAttribute("list");
  locationInputEl.setAttribute("autocomplete", "off");
  locationInputEl.setAttribute("autocorrect", "off");
  locationInputEl.setAttribute("autocapitalize", "off");
  locationInputEl.setAttribute("spellcheck", "false");

  const popup = document.createElement("div");
  popup.id = "locationPopup";
  popup.style.position = "fixed";
  popup.style.zIndex = "9999";
  popup.style.display = "none";
  popup.style.background = "#1b1b1b";
  popup.style.borderRadius = "12px";
  popup.style.overflow = "hidden";
  popup.style.boxShadow = "0 12px 30px rgba(0,0,0,0.35)";

  const item = document.createElement("div");
  item.textContent = "Columbus, Ohio";
  item.style.padding = "16px 18px";
  item.style.cursor = "pointer";
  item.style.color = "#fff";
  item.style.fontSize = "18px";
  item.style.fontWeight = "600";

  item.addEventListener(
    "mouseenter",
    () => (item.style.background = "#2a2a2a"),
  );
  item.addEventListener(
    "mouseleave",
    () => (item.style.background = "transparent"),
  );

  popup.appendChild(item);
  document.body.appendChild(popup);

  const positionPopup = () => {
    const r = locationInputEl.getBoundingClientRect();
    popup.style.left = `${r.left}px`;
    popup.style.top = `${r.bottom + 10}px`;
    popup.style.width = `${r.width}px`;
  };

  const showPopup = () => {
    positionPopup();
    popup.style.display = "block";
  };

  const hidePopup = () => {
    popup.style.display = "none";
  };

  const shouldShow = (val) => {
    const v = (val || "").trim().toLowerCase();
    return v.length >= 3 && v.startsWith("col");
  };

  locationInputEl.addEventListener("input", () => {
    if (shouldShow(locationInputEl.value)) showPopup();
    else hidePopup();
  });

  // IMPORTANT: use mousedown so blur doesn't cancel the selection
  item.addEventListener("mousedown", (e) => {
    e.preventDefault();
    locationInputEl.value = "Columbus, Ohio";
    hidePopup();
    updateSearchButtonState();
    runColumbusFlow();
  });

  document.addEventListener("click", (e) => {
    if (e.target === locationInputEl) return;
    if (popup.contains(e.target)) return;
    hidePopup();
  });

  window.addEventListener("resize", () => {
    if (popup.style.display === "block") positionPopup();
  });

  window.addEventListener(
    "scroll",
    () => {
      if (popup.style.display === "block") positionPopup();
    },
    true,
  );
}

//  CLOCKFACE

function positionClockface() {
  const clockface = document.getElementById("clockface");
  if (!clockface || clockface.classList.contains("hidden")) return;

  const point = map.latLngToContainerPoint(COLUMBUS_CENTER);

  // clockface is 260x260, so offset by half
  clockface.style.left = `${point.x - 130}px`;
  clockface.style.top = `${point.y - 130}px`;
}

function showClockface() {
  const clockface = document.getElementById("clockface");
  const brandContainer = document.getElementById("clockfaceBrands");
  if (!clockface || !brandContainer) return;

  clockface.classList.remove("hidden");
  brandContainer.innerHTML = "";

  positionClockface();

  const brandsToShow = FIXED_BRANDS;
  const radius = 100;
  const total = brandsToShow.length;

  if (activeBrand) clockface.classList.add("has-selection");
  else clockface.classList.remove("has-selection");

  brandsToShow.forEach((brandId, index) => {
    const angle = (index / total) * 2 * Math.PI;

    const x = 130 + radius * Math.cos(angle) - 26;
    const y = 130 + radius * Math.sin(angle) - 26;

    const node = document.createElement("div");
    node.className = "brand-node";
    node.dataset.brand = brandId;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;

    if (activeBrand === brandId) node.classList.add("is-selected");

    node.innerHTML = `<img src="${BRAND_META[brandId].icon}" alt="${BRAND_META[brandId].name}" />`;

    node.addEventListener("click", (e) => {
      e.stopPropagation();
      activateBrand(brandId);
    });

    brandContainer.appendChild(node);
  });
}

function syncClockfaceSelectionUI() {
  const clockface = document.getElementById("clockface");
  const brandNodes = document.querySelectorAll(".brand-node");
  if (!clockface) return;

  if (activeBrand) clockface.classList.add("has-selection");
  else clockface.classList.remove("has-selection");

  brandNodes.forEach((node) => {
    const id = node.dataset.brand;
    if (activeBrand && id === activeBrand) node.classList.add("is-selected");
    else node.classList.remove("is-selected");
  });
}

function activateBrand(brandId) {
  // Toggle off
  if (activeBrand === brandId) {
    activeBrand = null;
    resetZipStyles();
    syncClockfaceSelectionUI();
    closeBrandDrawer();
    return;
  }

  activeBrand = brandId;
  syncClockfaceSelectionUI();
  paintZipAvailability();
  openBrandDrawer(brandId);
}

//  ZIP PAINT

function paintZipAvailability() {
  if (!zipLayer) return;
  if (!activeBrand) return;
  if (!availabilityData[activeBrand]) return;

  zipLayer.eachLayer((layer) => {
    const zip = layer.options.zipCode;
    const status = availabilityData[activeBrand][zip];

    if (!status) {
      layer.setStyle(defaultZipStyle());
      return;
    }

    if (status === "available") {
      layer.setStyle({
        color: "#535353",
        fillColor: "#4caf50",
        fillOpacity: 0.35,
        weight: 1,
      });
    } else {
      layer.setStyle({
        color: "#535353",
        fillColor: "#e53935",
        fillOpacity: 0.35,
        weight: 1,
      });
    }
  });
}

function resetZipStyles() {
  if (!zipLayer) return;
  zipLayer.eachLayer((layer) => {
    layer.setStyle(defaultZipStyle());
  });
}

//  BRAND DRAWER

function setupBrandDrawer() {
  brandDrawerEl = document.getElementById("brandDrawer");
  brandDrawerCloseEl = document.getElementById("brandDrawerClose");
  brandDrawerLogoEl = document.getElementById("brandDrawerLogo");
  brandDrawerNameEl = document.getElementById("brandDrawerName");
  downloadPdfBtnEl = document.getElementById("downloadPdfBtn");

  // If you haven't added the drawer markup yet, don't crash
  if (
    !brandDrawerEl ||
    !brandDrawerCloseEl ||
    !brandDrawerLogoEl ||
    !brandDrawerNameEl ||
    !downloadPdfBtnEl
  ) {
    return;
  }

  brandDrawerCloseEl.addEventListener("click", () => {
    closeBrandDrawer();
  });

  downloadPdfBtnEl.addEventListener("click", async () => {
    if (!activeBrand) return;
    await generateBrandPdf(activeBrand);
  });
}

function openBrandDrawer(brandId) {
  if (!brandDrawerEl) return;

  const meta = BRAND_META[brandId];
  if (!meta) return;

  brandDrawerLogoEl.src = meta.icon;
  brandDrawerLogoEl.alt = meta.name;
  brandDrawerNameEl.textContent = meta.name;

  brandDrawerEl.classList.add("is-open");
  brandDrawerEl.setAttribute("aria-hidden", "false");
}

function closeBrandDrawer() {
  if (!brandDrawerEl) return;
  brandDrawerEl.classList.remove("is-open");
  brandDrawerEl.setAttribute("aria-hidden", "true");
}


function getZipListsForBrand(brandId) {
  const brandMap = availabilityData?.[brandId] || {};
  const available = [];
  const unavailable = [];

  Object.keys(brandMap).forEach((zip) => {
    const status = brandMap[zip];
    if (status === "available") available.push(zip);
    else if (status === "unavailable") unavailable.push(zip);
  });

  const sortZip = (a, b) => Number(a) - Number(b);
  available.sort(sortZip);
  unavailable.sort(sortZip);

  return { available, unavailable };
}

function getMapSnapshotDataUrl() {
  return new Promise((resolve, reject) => {
    if (!map) return reject(new Error("Map not initialized"));
    if (!window.leafletImage)
      return reject(new Error("leaflet-image not loaded"));

    // hide overlays so snapshot is clean map only
    const clockface = document.getElementById("clockface");
    const drawer = document.getElementById("brandDrawer");

    const prevClockfaceDisplay = clockface ? clockface.style.display : "";
    const prevDrawerDisplay = drawer ? drawer.style.display : "";

    if (clockface) clockface.style.display = "none";
    if (drawer) drawer.style.display = "none";

    window.leafletImage(map, (err, canvas) => {
      // restore overlays
      if (clockface) clockface.style.display = prevClockfaceDisplay;
      if (drawer) drawer.style.display = prevDrawerDisplay;

      if (err) return reject(err);

      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function svgUrlToPngDataUrl(svgUrl, size = 64) {
  const res = await fetch(svgUrl);
  const svgText = await res.text();

  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = blobUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;

    ctx.drawImage(img, x, y, w, h);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function generateBrandPdf(brandId) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library not loaded. Check jsPDF script include.");
    return;
  }

  const meta = BRAND_META[brandId];
  if (!meta) return;

  const { available, unavailable } = getZipListsForBrand(brandId);

  const doc = new window.jspdf.jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // --- Header: logo + name
  let y = 46;

  let logoPng = null;
  try {
    logoPng = await svgUrlToPngDataUrl(meta.icon, 56);
  } catch {
    logoPng = null;
  }

  if (logoPng) {
    doc.addImage(logoPng, "PNG", margin, y - 26, 32, 32);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(meta.name, margin + (logoPng ? 44 : 0), y);

  y += 18;

  // Divider
  doc.setDrawColor(210);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  // --- Map snapshot image (top)
  let mapImg = null;
  try {
    mapImg = await getMapSnapshotDataUrl();
  } catch {
    mapImg = null;
  }

  if (mapImg) {
    const imgW = pageW - margin * 2;
    const imgH = 270; // tuned for A4 layout

    doc.addImage(mapImg, "PNG", margin, y, imgW, imgH);
    y += imgH + 18;
  } else {
    y += 8;
  }

  // --- Two columns under the image
  const gutter = 24;
  const colW = (pageW - margin * 2 - gutter) / 2;
  const leftX = margin;
  const rightX = margin + colW + gutter;

  const drawColumnHeaders = (topY) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("AVAILABLE", leftX, topY);
    doc.text("UNAVAILABLE", rightX, topY);

    const lineY = topY + 10;
    doc.setDrawColor(230);
    doc.line(leftX, lineY, leftX + colW, lineY);
    doc.line(rightX, lineY, rightX + colW, lineY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    return lineY + 18;
  };

  // If there's not enough space on first page, start lists on a new page
  if (y > pageH - margin - 120) {
    doc.addPage();
    y = margin;
  }

  let startY = drawColumnHeaders(y);

  const lineH = 14;

  // write two columns page-aware (keeps both lists aligned by row count)
  let i = 0;
  let j = 0;

  while (i < available.length || j < unavailable.length) {
    if (startY > pageH - margin) {
      doc.addPage();
      startY = margin;
      startY = drawColumnHeaders(startY);
    }

    if (i < available.length) {
      doc.text(String(available[i]), leftX, startY);
      i++;
    }

    if (j < unavailable.length) {
      doc.text(String(unavailable[j]), rightX, startY);
      j++;
    }

    startY += lineH;
  }

  const safeName = meta.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  doc.save(`${safeName}-columbus-report.pdf`);
}
