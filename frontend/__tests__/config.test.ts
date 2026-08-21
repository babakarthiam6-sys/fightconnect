import { resolveApiBaseUrl } from '@/constants/config';

/**
 * Ces cas décrivent le bug qui a rendu l'application inutilisable en ligne :
 * le bundle web visait un domaine écrit en dur qui n'existait pas. La page
 * s'affichait, aucune requête n'aboutissait, et rien ne le signalait.
 */
describe('resolveApiBaseUrl', () => {
  it("vise l'origine qui sert la page sur le web", () => {
    expect(
      resolveApiBaseUrl({
        platformOS: 'web',
        origin: 'https://fightconnect-production.up.railway.app',
      }),
    ).toBe('https://fightconnect-production.up.railway.app/api/v1');
  });

  it("ignore le domaine d'app.json sur le web, même s'il est renseigné", () => {
    expect(
      resolveApiBaseUrl({
        platformOS: 'web',
        origin: 'https://autre-domaine.example',
        extraValue: 'https://domaine-obsolete.example/api/v1',
      }),
    ).toBe('https://autre-domaine.example/api/v1');
  });

  it('laisse la variable d\'environnement primer sur tout le reste', () => {
    expect(
      resolveApiBaseUrl({
        envValue: 'https://preprod.example/api/v1',
        platformOS: 'web',
        origin: 'https://production.example',
        extraValue: 'https://encore-autre.example/api/v1',
      }),
    ).toBe('https://preprod.example/api/v1');
  });

  it("retombe sur app.json en natif, où il n'y a pas d'origine", () => {
    expect(
      resolveApiBaseUrl({
        platformOS: 'ios',
        extraValue: 'https://fightconnect-production.up.railway.app/api/v1',
      }),
    ).toBe('https://fightconnect-production.up.railway.app/api/v1');
  });

  it('supprime le slash final, qui produirait des URL à double slash', () => {
    expect(
      resolveApiBaseUrl({ envValue: 'https://exemple.test/api/v1///', platformOS: 'ios' }),
    ).toBe('https://exemple.test/api/v1');
  });
});
