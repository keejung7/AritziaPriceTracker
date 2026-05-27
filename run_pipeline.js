const { execFileSync } = require("child_process");
const path = require("path");

const run = (script, env = {}) => {
  console.log(`\n[Pipeline] Starting ${script}...`);

  try {
    execFileSync("node", [script], {
      stdio: "inherit",
      cwd: __dirname,
      env: { ...process.env, ...env },
    });

    console.log(`[Pipeline] Completed ${script}.`);
  } catch (error) {
    console.error(`[Pipeline] Failed to run ${script}.`);
    process.exit(1);
  }
};

const runDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(__dirname, "data", runDate);

const linksPath = path.join(outputDir, `product_links_${runId}.csv`);
const detailsPath = path.join(outputDir, `product_details_${runId}.jsonl`);

const runEnv = {
  PRODUCT_LINKS_PATH: linksPath,
  PRODUCT_DETAILS_PATH: detailsPath,
};

// Run scripts in sequence
run("scraper.js", runEnv);
run("details_scraper.js", runEnv);
run("db/db.js", runEnv);
run("generate_view.js", runEnv);
