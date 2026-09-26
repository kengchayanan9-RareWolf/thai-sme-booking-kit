// Maintainers: run after editing templates/client.example.yaml or the seed/site shape.
//   npm run regen
import fs from 'node:fs';
import { loadClient, buildSeed, seedSource, siteFallback } from '../skills/thai-sme-booking/scripts/build-config.mjs';

const T = 'skills/thai-sme-booking/templates';
const c = loadClient(`${T}/client.example.yaml`);
fs.writeFileSync(`${T}/apps-script/Seed.js`, seedSource(buildSeed(c)));
fs.writeFileSync(`${T}/site/src/data/site.json`, JSON.stringify(siteFallback(c), null, 2) + '\n');
console.log('✓ Seed.js and site.json regenerated from client.example.yaml');
