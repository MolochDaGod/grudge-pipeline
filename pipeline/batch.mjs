#!/usr/bin/env node
/**
 * batch.mjs — Pipeline Batch Runner
 *
 * Usage:
 *   node pipeline/batch.mjs all
 *   node pipeline/batch.mjs convert --dry-run
 *   node pipeline/batch.mjs optimize --category=characters
 *   node pipeline/batch.mjs avatar --verbose
 *   node pipeline/batch.mjs validate
 */
import { runConvert } from './convert.mjs';
import { runOptimize } from './optimize.mjs';
import { runAvatar } from './avatar.mjs';
import { runValidate } from './validate.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'all';
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');
const categoryFilter = args.find(a => a.startsWith('--category='))?.split('=')[1]
  || (args.indexOf('--category') >= 0 ? args[args.indexOf('--category') + 1] : null);

const opts = { dryRun, categoryFilter, verbose };

async function main() {
  const startTime = Date.now();
  console.log(`[pipeline] Grudge Pipeline v1.0.0`);
  console.log(`[pipeline] Command: ${command} ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('');

  const allStats = {};

  switch (command) {
    case 'convert':
      allStats.convert = await runConvert(opts);
      break;
    case 'optimize':
      allStats.optimize = await runOptimize(opts);
      break;
    case 'avatar':
      allStats.avatar = await runAvatar(opts);
      break;
    case 'validate':
      allStats.validate = await runValidate(opts);
      break;
    case 'all':
      console.log(''); allStats.convert = await runConvert(opts);
      console.log(''); allStats.optimize = await runOptimize(opts);
      console.log(''); allStats.avatar = await runAvatar(opts);
      console.log(''); allStats.validate = await runValidate(opts);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Usage: node pipeline/batch.mjs [convert|optimize|avatar|validate|all]');
      console.log('Options: --dry-run --category=NAME --verbose');
      process.exit(1);
  }

  console.log('');
  console.log(`[pipeline] ═══ COMPLETE ═══`);
  console.log(`[pipeline] Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
