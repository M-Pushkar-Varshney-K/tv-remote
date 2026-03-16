const fs = require("fs");
const path = require("path");

const src = path.join(".next", "static");
const dest = path.join(".next", "standalone", ".next", "static");

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });

console.log("Copied .next/static into standalone");