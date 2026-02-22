const fs = require("fs");
const path = require("path");

const refinedPath = path.join(__dirname, "refined.txt");
const outputPath = path.join(__dirname, "..", "data", "availability.json");

if (!fs.existsSync(refinedPath)) {
  console.error("refined.txt not found.");
  process.exit(1);
}

const raw = fs.readFileSync(refinedPath, "utf8");
const lines = raw.split("\n");

const availability = {
  hwc: {},
  mse: {},
  msq: {},
  tca: {},
};

let currentZip = null;

lines.forEach((line) => {
  const trimmed = line.trim();

  // Match ZIP line: 43201: Columbus
  const zipMatch = trimmed.match(/^(\d{5}):/);
  if (zipMatch) {
    currentZip = zipMatch[1];
    return;
  }

  if (!currentZip) return;

  // Match brand lines: HWC - Available
  const brandMatch = trimmed.match(
    /^(HWC|MSE|MSQ|TCA)\s*-\s*(Available|Unavailable)/i,
  );
  if (brandMatch) {
    const brand = brandMatch[1].toLowerCase();
    const status = brandMatch[2].toLowerCase();
    availability[brand][currentZip] = status;
  }
});

fs.writeFileSync(outputPath, JSON.stringify(availability, null, 2));

console.log("availability.json generated successfully.");
