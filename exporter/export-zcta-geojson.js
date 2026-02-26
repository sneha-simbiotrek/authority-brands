

const fs = require("fs");
const path = require("path");

const INPUT_TXT = path.join(__dirname, "refined.txt");
const OUTPUT_GEOJSON = path.join(
  __dirname,
  "..",
  "data",
  "columbus-zips.geojson",
);

// TIGERweb ZCTA layer (ZIP Code Tabulation Areas)
const TIGER_QUERY_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/7/query";

// ArcGIS sometimes has request size limits. Chunk ZIPs to be safe.
const ZIP_CHUNK_SIZE = 25;

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function extractZipsFromRefinedTxt(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const zips = new Set();

  for (const line of lines) {
    const m = line.trim().match(/^(\d{5})\s*:/);
    if (m) zips.add(m[1]);
  }

  return Array.from(zips).sort();
}

async function fetchGeoJsonForZipChunk(zipChunk) {
  const where = `ZCTA5 IN (${zipChunk.map((z) => `'${z}'`).join(",")})`;

  const params = new URLSearchParams({
    where,
    outFields: "ZCTA5",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  const url = `${TIGER_QUERY_URL}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `tigerweb error ${res.status} ${res.statusText}\n${body.slice(0, 200)}`,
    );
  }

  const geojson = await res.json();

  if (!geojson || geojson.type !== "FeatureCollection") {
    throw new Error("unexpected TIGERweb response (not FeatureCollection)");
  }

  // normalize properties: keep only { zip }
  geojson.features = (geojson.features || []).map((f) => {
    const zip = String(f?.properties?.ZCTA5 || "").trim();
    return {
      ...f,
      properties: { zip },
    };
  });

  return geojson;
}

async function run() {
  if (!fs.existsSync(INPUT_TXT)) {
    console.log("missing:", INPUT_TXT);
    console.log("make sure your file is at exporter/refined.txt");
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_TXT, "utf-8");
  const zipList = extractZipsFromRefinedTxt(raw);

  console.log(`found ${zipList.length} zip codes in refined.txt`);

  const allFeatures = [];
  const returnedZipSet = new Set();

  for (let i = 0; i < zipList.length; i += ZIP_CHUNK_SIZE) {
    const chunk = zipList.slice(i, i + ZIP_CHUNK_SIZE);
    console.log(
      `fetching chunk ${Math.floor(i / ZIP_CHUNK_SIZE) + 1} (${chunk.length} zips)`,
    );

    const geojson = await fetchGeoJsonForZipChunk(chunk);

    for (const f of geojson.features || []) {
      allFeatures.push(f);
      if (f?.properties?.zip) returnedZipSet.add(f.properties.zip);
    }
  }

  const missing = zipList.filter((z) => !returnedZipSet.has(z));

  ensureDirFor(OUTPUT_GEOJSON);
  fs.writeFileSync(
    OUTPUT_GEOJSON,
    JSON.stringify(
      { type: "FeatureCollection", features: allFeatures },
      null,
      2,
    ),
  );

  console.log(
    `saved data/columbus-zips.geojson with ${allFeatures.length} polygons`,
  );

  if (missing.length) {
    console.log("these zips were not returned by TIGERweb (no ZCTA match):");
    console.log(missing.join(", "));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
