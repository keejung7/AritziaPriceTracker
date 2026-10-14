/** @jest-environment node */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const { createCatalogTestDatabase, validateTestDatabaseUrl } = require('./helpers/catalogTestDatabase');

test('ordinary raw loading logs input identity, insert counts, refresh stages and raw failures', async () => {
  const db=await createCatalogTestDatabase();
  const pool=new Pool({connectionString:validateTestDatabaseUrl()});
  const client=await pool.connect();
  // Keep each suite isolated while running the actual loader executable and parser.
  const dir=fs.mkdtempSync('/private/tmp/aritzia-final-loader.');
  const runId='2026-10-13T19-00-00-000Z';
  const artifact=path.join(dir,`product_details_${runId}.jsonl`), log=path.join(dir,`db_load_${runId}.log`);
  const artifactData={product_link:'https://www.aritzia.com/en/product/shirt/123456.html',product_name:'Shirt',product_brand:'Brand',scraped_at:'2026-10-13T10:00:00Z',source_categories:['tops'],colors:[{'1274':{color_text:'Black',original_price:'$100',sale_price:'$60',sizes:[{size:'ONE',status:'In Stock'}]}}]};
  fs.writeFileSync(artifact,JSON.stringify(artifactData)+'\n');
  const sourceRoot=path.resolve(__dirname,'..');
  const loaderSource=process.env.PIPELINE_LOGGING_BASELINE ? execFileSync('git',['show','HEAD:db/db.js'],{cwd:sourceRoot,encoding:'utf8'}) : fs.readFileSync(path.join(sourceRoot,'db/db.js'),'utf8');
  // A tiny Node launcher redirects only SQL's schema qualifier. Real loader,
  // parser, logger, PostgreSQL insert counts and refresh SQL remain exercised.
  const launcher=`const fs=require('node:fs');const Module=require('node:module');const pg=require(${JSON.stringify(require.resolve('pg'))});
    const original=pg.Client.prototype.query;pg.Client.prototype.query=function(sql,...args){return original.call(this,typeof sql==='string'?sql.replaceAll('aritzia_products',process.env.TEST_SCHEMA):sql,...args)};
    const m=new Module(${JSON.stringify(path.join(sourceRoot,'db/db.js'))});m.filename=${JSON.stringify(path.join(sourceRoot,'db/db.js'))};m.paths=Module._nodeModulePaths(${JSON.stringify(path.join(sourceRoot,'db'))});require.main=m;process.mainModule=m;m._compile(fs.readFileSync(process.env.TEST_LOADER_SOURCE,'utf8'),m.filename);`;
  const source=path.join(dir,'loader.js'); fs.writeFileSync(source,loaderSource);
  const env={...process.env,DATABASE_URL:validateTestDatabaseUrl(),PRODUCT_DETAILS_PATH:artifact,DB_LOG_PATH:log,TEST_SCHEMA:db.schema,TEST_LOADER_SOURCE:source};
  try {
    // Commit the helper's bootstrap before the child process reads its schema.
    await db.query('COMMIT');
    execFileSync(process.execPath,['-e',launcher],{env,encoding:'utf8'});
    const output=fs.readFileSync(log,'utf8');
    expect(output).toContain(`Loading artifact: ${artifact}`);
    expect(output).toContain(`runId=${runId}`);
    expect(output).toContain('Transaction committed: products=1, categories=1, productCategories=1, colors=1, productColors=1, priceSnapshots=1, stockSnapshots=1');
    expect(output).toContain('catalog stage=derive_current_colors');
    expect(output).toContain('catalog snapshotId=');
    expect(output).toContain('Completed successfully');
    // Repeat ingestion reports actual affected rows, including idempotent raw rows.
    execFileSync(process.execPath,['-e',launcher],{env,encoding:'utf8'});
    expect(fs.readFileSync(log,'utf8')).toContain('priceSnapshots=0, stockSnapshots=0');
    await client.query(`ALTER TABLE ${db.schema}.price_snapshots ADD CONSTRAINT reject_new_prices CHECK(original_price<0) NOT VALID`);
    artifactData.scraped_at='2026-10-14T10:00:00Z'; fs.writeFileSync(artifact,JSON.stringify(artifactData)+'\n');
    expect(()=>execFileSync(process.execPath,['-e',launcher],{env,encoding:'utf8',stdio:'pipe'})).toThrow();
    expect(fs.readFileSync(log,'utf8')).toContain('Transaction rolled back during priceSnapshots');
    expect(fs.readFileSync(log,'utf8')).toContain('Failed:');
    expect((await client.query(`SELECT count(*)::int AS count FROM ${db.schema}.price_snapshots`)).rows[0].count).toBe(1);
  } finally {
    await client.query(`DROP SCHEMA ${db.schema} CASCADE`);client.release();await pool.end();await db.close();
  }
},30000);
