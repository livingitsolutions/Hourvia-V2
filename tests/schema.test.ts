import { it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
it('requires organization IDs on every tenant table',()=>{
 for(const [name,table] of Object.entries(schema)) {
  if(['users','organizations'].includes(name)) continue;
  const config=getTableConfig(table);
  expect(config.columns.find(c=>c.name==='organization_id')?.notNull,name).toBe(true);
 }
});
it('keeps tenant references composite and billing reservations unique',()=>{
 const project=getTableConfig(schema.projects);
 expect(project.foreignKeys.some(f=>f.reference().columns.map(c=>c.name).join(',')==='organization_id,client_id')).toBe(true);
 const allocations=getTableConfig(schema.billingAllocations);
 expect(allocations.uniqueConstraints.some(c=>c.columns.map(col=>col.name).join(',')==='organization_id,entry_id')).toBe(true);
});
it('declares monitoring collection off in PostgreSQL metadata',()=>{
 const cols=getTableConfig(schema.monitoringPolicies).columns;
 for(const name of ['idle_detection','applications','websites','screenshots','productivity']) expect(cols.find(c=>c.name===name)?.default).toBe(false);
});
