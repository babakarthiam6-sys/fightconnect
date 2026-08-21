import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CONFIG } from '@/constants/config';

/**
 * Le taux de commission vit à deux endroits : le serveur l'applique, le mobile
 * l'affiche avant que la demande n'existe. Les laisser diverger annoncerait un
 * décompte que la facturation démentirait — la pire des surprises.
 *
 * Le test s'ignore proprement si le serveur est absent, même convention que les
 * tests d'intégration MongoDB : un dépôt cloné sans le backend ne doit pas
 * rougir pour autant.
 */
describe('taux de commission', () => {
  const configPath = path.resolve(__dirname, '../../backend/app/config.py');

  let source: string | null = null;
  try {
    source = readFileSync(configPath, 'utf8');
  } catch {
    source = null;
  }

  const test = source === null ? it.skip : it;

  test('correspond à celui du serveur', () => {
    const match = source?.match(/commission_rate:\s*float\s*=\s*([0-9.]+)/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(CONFIG.commissionRate);
  });
});
