import process from 'node:process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
const walk = root => readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${root}/${e.name}`):[`${root}/${e.name}`]);
const allowed = { domain: ['domain'], application:['domain','application'], infrastructure:['domain','application','infrastructure'], presentation:['domain','application','presentation'], composition:['domain','application','infrastructure','presentation','composition'] };
const failures=[];
for (const file of walk('src').filter(f=>/\.tsx?$/.test(f))) {
 const layer=file.split('/')[1]; const code=readFileSync(file,'utf8');
 for(const match of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
  const target=match[1];
  if(target.startsWith('.')) {const destination=relative(resolve('src'),resolve(dirname(file),target)).split('/')[0];if(destination==='..'||!allowed[layer]?.includes(destination)) failures.push(`${file}: forbidden ${target}`);}
  else if(['domain','application'].includes(layer) && !['zod','@js-temporal/polyfill'].includes(target)) failures.push(`${file}: external dependency ${target}`);
 }
 if(/getDatabase\s*\(|drizzle\s*\(|fetch\s*\(|localStorage|sessionStorage/.test(code)) failures.push(`${file}: active I/O forbidden`);
}
for(const file of ['db/index.ts','drizzle.config.ts','netlify/database/migrations','netlify/functions']) if(existsSync(file)) failures.push(`Forbidden activation path: ${file}`);
for(const file of walk('db')) if(/netlify-db|@netlify\/database|createPool|getDatabase\s*\(/.test(readFileSync(file,'utf8'))) failures.push(`${file}: active database import`);
if(failures.length) {process.stderr.write(failures.join('\n'));process.exit(1);} process.stdout.write('Architecture and inactive-persistence checks passed.\n');
