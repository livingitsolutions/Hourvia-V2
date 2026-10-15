import { describe, it, expect } from 'vitest';
import { assertOwnership, may, monitoringDefaults, permissions, roles, timezoneSchema, timeEntrySchema, type Membership } from '../src/domain/model';
import { amountForSeconds, billingBoundary, sumMoney } from '../src/domain/billing';
const org='a1111111-1111-4111-8111-111111111111'; const user='b1111111-1111-4111-8111-111111111111'; const other='c1111111-1111-4111-8111-111111111111';
const member:Membership={organizationId:org,userId:user,role:'OWNER',active:true,delegated:[],version:1};
describe('authorization matrix',()=>{
 for(const role of roles) for(const permission of permissions) it(`${role}: ${permission} requires correct grants`,()=>{
  expect(may({...member,role},permission,org)).toBe(role==='OWNER');
  expect(may({...member,role,delegated:[permission]},permission,org)).toBe(!['EMPLOYEE','CONTRACTOR'].includes(role));
  expect(may({...member,role,delegated:[permission]},permission,other)).toBe(false);
  expect(may({...member,role,active:false,delegated:[permission]},permission,org)).toBe(false);
 });
});
it('enforces exactly one accountable owner',()=>{const organization={id:org,name:'Living IT',ownerUserId:user,timezone:'UTC',version:1};expect(()=>assertOwnership(organization,[member])).not.toThrow();for(const m of [[],[member,{...member,userId:other}],[{...member,userId:other}]])expect(()=>assertOwnership(organization,m)).toThrow();});
it('defaults every monitoring feature off and expires offline immediately',()=>{const p=monitoringDefaults(org,user);expect([p.idleDetection,p.applications,p.websites,p.screenshots,p.productivity]).toEqual([false,false,false,false,false]);expect(p.offlineLeaseSeconds).toBe(0);expect(p.retentionDays).toBe(30);});
it('validates UTC and exact integer seconds',()=>{const entry={organizationId:org,id:user,userId:user,projectId:other,version:1,start:'2026-10-12T10:00:00Z',end:'2026-10-12T10:00:01Z',seconds:1,billable:true};expect(timeEntrySchema.safeParse(entry).success).toBe(true);for(const change of [{seconds:1.5},{seconds:2},{start:'2026-10-12T10:00:00+02:00'},{seconds:-1}])expect(timeEntrySchema.safeParse({...entry,...change}).success).toBe(false);});
it('rejects unknown timezone',()=>{expect(timezoneSchema.safeParse('America/New_York').success).toBe(true);expect(timezoneSchema.safeParse('Mars/Olympus').success).toBe(false);});
it('uses local midnights across spring DST',()=>{const b=billingBoundary('2026-03-08','America/New_York','weekly');expect(b.start).toBe('2026-03-08T05:00:00Z');expect((Date.parse(b.end)-Date.parse(b.start))/3600000).toBe(167);});
it('handles fall DST and each cadence',()=>{expect((Date.parse(billingBoundary('2026-11-01','America/New_York','weekly').end)-Date.parse('2026-11-01T04:00:00Z'))/3600000).toBe(169);expect(billingBoundary('2026-02-01','UTC','monthly').end).toBe('2026-03-01T00:00:00Z');expect(billingBoundary('2026-02-16','UTC','semi-monthly').end).toBe('2026-03-01T00:00:00Z');expect(billingBoundary('2026-02-01','UTC','semi-monthly').end).toBe('2026-02-16T00:00:00Z');expect(billingBoundary('2026-02-01','UTC','biweekly').end).toBe('2026-02-15T00:00:00Z');expect(billingBoundary('2026-02-01','UTC','custom','2026-02-03').end).toBe('2026-02-03T00:00:00Z');expect(()=>billingBoundary('2026-02-02','UTC','monthly')).toThrow();expect(()=>billingBoundary('2026-02-01','UTC','custom','2026-02-01')).toThrow();});
it('preserves money precision and rounds half up per line',()=>{expect(amountForSeconds(1n,1800)).toBe(1n);expect(amountForSeconds(9007199254740993n,3600)).toBe(9007199254740993n);expect(amountForSeconds(10000n,1)).toBe(3n);expect(()=>amountForSeconds(10n,1.2)).toThrow();expect(()=>amountForSeconds(-1n,1)).toThrow();expect(sumMoney([{currency:'USD',minor:10n},{currency:'USD',minor:-2n}],'USD')).toBe(8n);expect(()=>sumMoney([{currency:'EUR',minor:2n}],'USD')).toThrow();});
