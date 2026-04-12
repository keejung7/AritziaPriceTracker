const { execSync } = require("child_process");

const run = (script) => {
  console.log(`\n[Pipeline] Starting ${script}...`);
  try {
    // inherit stdio to see logs in real-time
    execSync(`node ${script}`, { stdio: "inherit", cwd: __dirname });
    console.log(`[Pipeline] Completed ${script}.`);
  } catch (error) {
    console.error(`[Pipeline] Failed to run ${script}.`);
    process.exit(1);
  }
};

// Run scripts in sequence
run("scraper.js");
run("details_scraper.js");
run("generate_view.js");
