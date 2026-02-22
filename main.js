let map;
let zipLayer;
let centerMarker;
let activeBrand = null;

let availabilityData = {};

// Start with NO brands selected (so search stays disabled until user selects)
let selectedBrands = [];

// Columbus center
const COLUMBUS_CENTER = [39.9612, -82.9988];

// Brand metadata (icons must exist in /assets)
const BRAND_META = {
  hwc: { name: "Homewatch CareGivers", icon: "assets/HWC.svg" },
  mse: { name: "Mister Sparky Electric", icon: "assets/MSE.svg" },
  msq: { name: "Mosquito Squad", icon: "assets/MSQ.svg" },
  tca: { name: "The Cleaning Authority", icon: "assets/TCA.svg" },
};

// Shared UI refs
let locationInputEl = null;
let locationSearchBtnEl = null;

// ==============================
// INIT
// ==============================

document.addEventListener("DOMContentLoaded", async () => {
  initMap();
  await loadAvailability();
  await loadZipGeoJson();
  setupUI();
});

// ==============================
// MAP SETUP
// ==============================

function initMap() {
  // map = L.map("map").setView(COLUMBUS_CENTER, 7);
  map = L.map("map", {
    attributionControl: false,
  }).setView(COLUMBUS_CENTER, 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: false,
  }).addTo(map);

  // Make clockface live INSIDE the map container so it moves with pan/zoom
  const clockface = document.getElementById("clockface");
  if (clockface && clockface.parentElement !== map.getContainer()) {
    map.getContainer().appendChild(clockface);
  }

  // Keep clockface centered on Columbus while dragging / zooming
  map.on("move zoom", positionClockface);
}

async function loadZipGeoJson() {
  const res = await fetch("data/columbus-zips.geojson");
  const geojson = await res.json();

  zipLayer = L.geoJSON(geojson, {
    style: defaultZipStyle,
    interactive: true,

    onEachFeature: (feature, layer) => {
      const zip = feature.properties.zip;
      layer.options.zipCode = zip;

      // show zip on hover
      layer.on("mouseover", function (e) {
        this.setStyle({
          weight: 2,
        });

        this.bindTooltip(`ZIP: ${zip}`, {
          sticky: true,
          direction: "top",
          offset: [0, -5],
          className: "zip-tooltip",
        }).openTooltip();
      });

      layer.on("mouseout", function () {
        // restore original style
        if (activeBrand) {
          paintZipAvailability();
        } else {
          this.setStyle(defaultZipStyle());
        }

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

// ==============================
// AVAILABILITY DATA
// ==============================

async function loadAvailability() {
  const res = await fetch("data/availability.json");
  availabilityData = await res.json();
}

// ==============================
// SEARCH BUTTON STATE
// ==============================

function updateSearchButtonState() {
  if (!locationInputEl || !locationSearchBtnEl) return;

  const hasLocation = locationInputEl.value.trim().length > 0;
  const hasBrand = selectedBrands.length > 0;

  locationSearchBtnEl.disabled = !(hasLocation && hasBrand);
}

// ==============================
// UI + SEARCH
// ==============================

function setupUI() {
  locationSearchBtnEl = document.getElementById("locationSearchBtn");
  locationInputEl = document.getElementById("locationInput");

  // Ensure button state stays correct while typing
  locationInputEl.addEventListener("input", updateSearchButtonState);

  // Search click
  locationSearchBtnEl.addEventListener("click", () => {
    const value = locationInputEl.value.trim().toLowerCase();

    // guard (button should already be disabled if invalid)
    if (!value || !selectedBrands.length) return;

    if (value !== "columbus") {
      alert("Demo only supports 'columbus'");
      return;
    }

    map.setView(COLUMBUS_CENTER, 11);
    dropCenterPin();
  });

  setupBrandFilter();
  updateSearchButtonState();
}

function dropCenterPin() {
  if (centerMarker) {
    map.removeLayer(centerMarker);
  }

  centerMarker = L.marker(COLUMBUS_CENTER).addTo(map);

  // Tooltip at bottom (your fix)
  centerMarker.bindTooltip("COLUMBUS", {
    permanent: true,
    direction: "bottom",
    offset: [0, 18],
    opacity: 1,
  });

  centerMarker.on("click", showClockface);
}

// ==============================
// CLOCKFACE POSITION (STICKY)
// ==============================

function positionClockface() {
  const clockface = document.getElementById("clockface");
  if (!clockface || clockface.classList.contains("hidden")) return;

  const point = map.latLngToContainerPoint(COLUMBUS_CENTER);

  // clockface is 260x260, so offset by half
  clockface.style.left = `${point.x - 130}px`;
  clockface.style.top = `${point.y - 130}px`;
}

// ==============================
// CLOCKFACE RENDER + BEHAVIOR
// ==============================

function showClockface() {
  const clockface = document.getElementById("clockface");
  const brandContainer = document.getElementById("clockfaceBrands");

  clockface.classList.remove("hidden");
  brandContainer.innerHTML = "";

  // Put it exactly around Columbus pin
  positionClockface();

  const brandsToShow = selectedBrands.length
    ? selectedBrands
    : Object.keys(BRAND_META);

  const radius = 100;
  const total = brandsToShow.length;

  // If a brand is active, enable "has-selection" mode, else remove it
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

    // Mark selected node (stays white while others go dark when has-selection is on)
    if (activeBrand === brandId) node.classList.add("is-selected");

    node.innerHTML = `<img src="${BRAND_META[brandId].icon}" />`;

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
  // Toggle off if same brand clicked again → back to homepage state
  if (activeBrand === brandId) {
    activeBrand = null;
    resetZipStyles();
    syncClockfaceSelectionUI();
    return;
  }

  activeBrand = brandId;
  syncClockfaceSelectionUI();
  paintZipAvailability();
}

// ==============================
// PAINT ZIP POLYGONS
// ==============================

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

// ==============================
// BRAND FILTER PANEL
// ==============================

function setupBrandFilter() {
  const btn = document.getElementById("brandFilterBtn");
  const panel = document.getElementById("brandFilterPanel");
  const checkboxes = document.querySelectorAll(".brand-checkbox");
  const selectAll = document.getElementById("selectAllBrands");

  btn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
  });

  // Default: none selected (matches your search rule)
  selectAll.checked = false;
  checkboxes.forEach((cb) => (cb.checked = false));
  selectedBrands = [];
  updateSearchButtonState();

  selectAll.addEventListener("change", (e) => {
    if (e.target.checked) {
      selectedBrands = Object.keys(BRAND_META);
      checkboxes.forEach((cb) => (cb.checked = true));
    } else {
      selectedBrands = [];
      checkboxes.forEach((cb) => (cb.checked = false));
    }

    updateSearchButtonState();

    // If clockface is open, re-render nodes based on selection set
    if (!document.getElementById("clockface").classList.contains("hidden")) {
      showClockface();
    }
  });

  checkboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      selectedBrands = Array.from(checkboxes)
        .filter((c) => c.checked)
        .map((c) => c.value);

      selectAll.checked = selectedBrands.length === checkboxes.length;

      updateSearchButtonState();

      // If clockface is open, re-render nodes based on selection set
      if (!document.getElementById("clockface").classList.contains("hidden")) {
        showClockface();
      }
    });
  });
}
