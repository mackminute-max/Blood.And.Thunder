import { readFileSync, writeFileSync } from 'node:fs';
import { parseSetupJson } from '../src/configuration/load.ts';
import { migrateV02Configuration } from '../src/persistence/migrate-v02.ts';
try {
  if(process.argv.length!==4)throw new Error('Usage: node scripts/migrate-v02.ts old.configuration.json new.configuration.json');
  const migrated=migrateV02Configuration(parseSetupJson(readFileSync(process.argv[2]!,'utf8'),'configuration'));
  writeFileSync(process.argv[3]!,JSON.stringify(migrated,null,2)+'\n',{flag:'wx'});
  console.log('Migrated configuration to simulation 0.9.0. Sign commands now queue for line activation; review defaults before running. Historical replay remains incompatible.');
} catch(error){console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1;}
