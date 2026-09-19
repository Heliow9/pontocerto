import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MOVYO_ROLLOUT_SETTINGS,assertMovyoBulkCutoverEnabled,nextMovyoRolloutSettings,normalizeMovyoRolloutSettings} from '../src/services/movyo-rollout-core.js';

test('rollout defaults keep pilot and bulk cutover disabled',()=>{
  assert.deepEqual(normalizeMovyoRolloutSettings(null),DEFAULT_MOVYO_ROLLOUT_SETTINGS);
  assert.equal(DEFAULT_MOVYO_ROLLOUT_SETTINGS.movyoPilotApproved,false);
  assert.equal(DEFAULT_MOVYO_ROLLOUT_SETTINGS.bulkCutoverEnabled,false);
});

test('bulk cutover returns 409 until pilot and bulk flags are enabled',()=>{
  assert.throws(()=>assertMovyoBulkCutoverEnabled({movyoPilotApproved:false,bulkCutoverEnabled:false}),(error:any)=>error?.status===409&&error?.code==='MOVYO_BULK_CUTOVER_DISABLED');
  assert.throws(()=>assertMovyoBulkCutoverEnabled({movyoPilotApproved:true,bulkCutoverEnabled:false}),(error:any)=>error?.status===409&&error?.code==='MOVYO_BULK_CUTOVER_DISABLED');
  assert.equal(assertMovyoBulkCutoverEnabled({movyoPilotApproved:true,bulkCutoverEnabled:true}),true);
});

test('bulk cannot be enabled before pilot approval',()=>{
  assert.throws(()=>nextMovyoRolloutSettings(DEFAULT_MOVYO_ROLLOUT_SETTINGS,{bulkCutoverEnabled:true}),(error:any)=>error?.status===409&&error?.code==='MOVYO_PILOT_NOT_APPROVED');
});

test('revoking pilot approval also disables bulk cutover',()=>{
  assert.deepEqual(nextMovyoRolloutSettings({movyoPilotApproved:true,bulkCutoverEnabled:true},{movyoPilotApproved:false}),{movyoPilotApproved:false,bulkCutoverEnabled:false});
});
