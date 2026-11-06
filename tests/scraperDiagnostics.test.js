/** @jest-environment node */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { captureCiDiagnostics, startCiTracing, stopCiTracing } = require('../scraperDiagnostics');

const temporaryDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aritzia-diagnostics-'));

afterEach(() => {
  delete process.env.CI;
});

test('captures page evidence and trace after a CI category-load failure', async () => {
  process.env.CI = 'true';
  const outputDir = temporaryDirectory();
  const page = {
    url: () => 'https://www.aritzia.com/en/clothing',
    title: jest.fn().mockResolvedValue('Aritzia Clothing'),
    content: jest.fn().mockResolvedValue('<html>blocked</html>'),
    screenshot: jest.fn(({ path: screenshotPath }) => fs.writeFileSync(screenshotPath, 'png')),
  };
  const context = {
    tracing: {
      stop: jest.fn(({ path: tracePath }) => fs.writeFileSync(tracePath, 'trace')),
    },
  };
  const failure = new Error('selector timed out');

  await captureCiDiagnostics({ context, page, outputDir, failure });

  expect(fs.readFileSync(path.join(outputDir, 'page.html'), 'utf8')).toBe('<html>blocked</html>');
  expect(fs.readFileSync(path.join(outputDir, 'page.png'), 'utf8')).toBe('png');
  expect(fs.readFileSync(path.join(outputDir, 'trace.zip'), 'utf8')).toBe('trace');
  expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'page.json'), 'utf8'))).toMatchObject({
    url: 'https://www.aritzia.com/en/clothing',
    title: 'Aritzia Clothing',
    error: { message: 'selector timed out' },
  });
});

test('does not create diagnostics outside CI', async () => {
  const outputDir = path.join(temporaryDirectory(), 'diagnostics');
  const page = { title: jest.fn(), content: jest.fn(), screenshot: jest.fn() };
  const context = { tracing: { stop: jest.fn() } };

  const captured = await captureCiDiagnostics({ context, page, outputDir, failure: new Error('selector timed out') });

  expect(captured).toBe(false);
  expect(fs.existsSync(outputDir)).toBe(false);
  expect(context.tracing.stop).not.toHaveBeenCalled();
});

test('starts and stops tracing only for CI runs', async () => {
  process.env.CI = 'true';
  const context = { tracing: { start: jest.fn(), stop: jest.fn() } };

  await expect(startCiTracing(context)).resolves.toBe(true);
  await expect(stopCiTracing(context)).resolves.toBe(true);

  expect(context.tracing.start).toHaveBeenCalledWith({ screenshots: true, snapshots: true, sources: true });
  expect(context.tracing.stop).toHaveBeenCalledWith();
});

test('preserves metadata when individual capture operations fail', async () => {
  process.env.CI = 'true';
  const outputDir = temporaryDirectory();
  const page = {
    url: () => 'https://www.aritzia.com/en/clothing',
    title: jest.fn().mockResolvedValue('Aritzia Clothing'),
    content: jest.fn().mockRejectedValue(new Error('HTML capture failed')),
    screenshot: jest.fn().mockRejectedValue(new Error('Screenshot capture failed')),
  };
  const context = { tracing: { stop: jest.fn().mockRejectedValue(new Error('Trace capture failed')) } };
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    await expect(captureCiDiagnostics({
      context,
      page,
      outputDir,
      failure: new Error('selector timed out'),
    })).resolves.toBe(true);
  } finally {
    warning.mockRestore();
  }

  expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'page.json'), 'utf8'))).toMatchObject({
    url: 'https://www.aritzia.com/en/clothing',
    title: 'Aritzia Clothing',
  });
});

test('preserves the final URL when the page title cannot be read', async () => {
  process.env.CI = 'true';
  const outputDir = temporaryDirectory();
  const page = {
    url: () => 'https://www.aritzia.com/en/clothing',
    title: jest.fn().mockRejectedValue(new Error('Title capture failed')),
    content: jest.fn().mockResolvedValue('<html>blocked</html>'),
    screenshot: jest.fn(),
  };
  const context = { tracing: { stop: jest.fn() } };

  await expect(captureCiDiagnostics({
    context,
    page,
    outputDir,
    failure: new Error('selector timed out'),
  })).resolves.toBe(true);

  expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'page.json'), 'utf8'))).toMatchObject({
    url: 'https://www.aritzia.com/en/clothing',
    title: null,
  });
});

test('uploads available scrape diagnostics even after a failed pipeline', () => {
  const workflow = JSON.parse(execFileSync('ruby', [
    '-e',
    'require "yaml"; require "json"; puts JSON.generate(YAML.load_file(ARGV[0]))',
    path.join(__dirname, '..', '.github', 'workflows', 'daily_scrape.yml'),
  ], { encoding: 'utf8' }));

  const uploadStep = workflow.jobs.scrape.steps.find((step) => step.name === 'Upload scrape diagnostics');

  expect(uploadStep).toMatchObject({
    if: 'always()',
    uses: 'actions/upload-artifact@v4',
    with: {
      name: 'aritzia-scrape-diagnostics',
      path: '.validation-artifacts/scraper-diagnostics',
      'if-no-files-found': 'ignore',
    },
  });
});
