/** @jest-environment node */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');

test('pipeline forwards a timestamp-matched database log beside both run artifacts', () => {
  const launches=[];
  const source = process.env.PIPELINE_LOGGING_BASELINE ? execFileSync('git',['show','HEAD:run_pipeline.js'],{cwd:root,encoding:'utf8'}) : fs.readFileSync(path.join(root,'run_pipeline.js'),'utf8');
  vm.runInNewContext(source,{__dirname:root,require:id=>id==='child_process'?{execFileSync:(executable,args,options)=>launches.push({executable,args,options})}:require(id),
    process:{env:{},exit:code=>{throw new Error(`exit ${code}`);}},console:{log(){},error(){}}});
  expect(launches.map(call=>call.args[0])).toEqual(['scraper.js','details_scraper.js','db/db.js']);
  const env=launches[2].options.env;
  expect(env.DB_LOG_PATH).toBe(path.join(path.dirname(env.PRODUCT_DETAILS_PATH),path.basename(env.PRODUCT_DETAILS_PATH).replace('product_details_','db_load_').replace('.jsonl','.log')));
  expect(path.dirname(env.DB_LOG_PATH)).toBe(path.dirname(env.PRODUCT_LINKS_PATH));
});
