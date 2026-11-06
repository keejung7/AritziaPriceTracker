const fs = require('node:fs');
const path = require('node:path');

const isCi = () => process.env.CI === 'true';

const startCiTracing = async (context) => {
  if (!isCi()) return false;
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  return true;
};

const stopCiTracing = async (context) => {
  if (!isCi()) return false;
  await context.tracing.stop();
  return true;
};

const captureCiDiagnostics = async ({ context, page, outputDir, failure }) => {
  if (!isCi()) return false;

  fs.mkdirSync(outputDir, { recursive: true });

  const metadata = {
    capturedAt: new Date().toISOString(),
    url: page.url(),
    title: await page.title().catch(() => null),
    error: {
      name: failure.name,
      message: failure.message,
    },
  };

  const results = await Promise.allSettled([
    page.content().then((html) => fs.promises.writeFile(path.join(outputDir, 'page.html'), html)),
    Promise.resolve().then(() => page.screenshot({ path: path.join(outputDir, 'page.png'), fullPage: true })),
    Promise.resolve().then(() => context.tracing.stop({ path: path.join(outputDir, 'trace.zip') })),
  ]);

  await fs.promises.writeFile(
    path.join(outputDir, 'page.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`[Diagnostics] ${failures.length} capture operation(s) failed.`);
  }

  return true;
};

module.exports = { captureCiDiagnostics, startCiTracing, stopCiTracing };
