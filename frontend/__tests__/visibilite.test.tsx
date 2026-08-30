import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import CarteVisibilite from '@/components/CarteVisibilite';
import { evaluerVisibilite } from '@/utils/visibilite';
import type { User } from '@/types';

const VIDE: User = {
  id: 'u1',
  email: 'ana@exemple.com',
  firstName: 'Ana',
  lastName: 'Martin',
  avatarUrl: null,
  dischargeAccepted: true,
  averageRating: null,
  ratingsCount: 0,
  createdAt: null,
  payoutsEnabled: false,
  expoPushToken: null,
  city: null,
  country: null,
  bio: null,
  style: null,
  level: null,
  weightClass: null,
  heightCm: null,
  fightsCount: 0,
  experienceYears: 0,
  pricePerRound: null,
  currency: 'EUR',
  available: false,
};

const COMPLET: User = {
  ...VIDE,
  city: 'Paris',
  country: 'FR',
  style: 'boxing',
  level: 'amateur',
  weightClass: 'welterweight',
  pricePerRound: 25,
};

describe('règle de visibilité', () => {
  it('un compte neuf n’est pas publiable', () => {
    const v = evaluerVisibilite(VIDE);

    expect(v.publiable).toBe(false);
    expect(v.visible).toBe(false);
    expect(v.obligatoiresManquants).toEqual(['sport', 'tarif']);
    expect(v.progression).toBe(0);
  });

  /**
   * C'est exactement la règle du serveur : discipline **et** tarif, rien de
   * plus. Exiger la ville ici afficherait un blocage que l'API n'applique pas.
   */
  it('discipline et tarif suffisent à rendre publiable', () => {
    const v = evaluerVisibilite({ ...VIDE, style: 'boxing', pricePerRound: 25 });

    expect(v.publiable).toBe(true);
    expect(v.obligatoiresManquants).toEqual([]);
    expect(v.recommandesManquants).toEqual(['ville', 'pays', 'niveau', 'poids']);
  });

  /** Un sparring gratuit est un choix, pas un champ oublié. */
  it('accepte un tarif à zéro', () => {
    expect(evaluerVisibilite({ ...VIDE, style: 'mma', pricePerRound: 0 }).publiable).toBe(true);
  });

  it('publiable ne veut pas dire visible tant que l’interrupteur est éteint', () => {
    const v = evaluerVisibilite(COMPLET);

    expect(v.publiable).toBe(true);
    expect(v.visible).toBe(false);
    expect(evaluerVisibilite({ ...COMPLET, available: true }).visible).toBe(true);
  });

  it('compte la progression sur les six champs', () => {
    expect(evaluerVisibilite(COMPLET).progression).toBe(1);
    expect(evaluerVisibilite({ ...VIDE, style: 'judo' }).progression).toBeCloseTo(1 / 6);
  });

  it('traite une ville vide comme absente', () => {
    expect(evaluerVisibilite({ ...COMPLET, city: '   ' }).recommandesManquants).toContain('ville');
  });

  it('supporte l’absence d’utilisateur', () => {
    expect(evaluerVisibilite(null).publiable).toBe(false);
  });
});

/**
 * La règle vit des deux côtés : le serveur refuse, le mobile prévient. Si l'un
 * change sans l'autre, l'application promet une mise en ligne que l'API
 * refusera — ou l'inverse, elle bloque quelqu'un que le serveur accepterait.
 */
describe('la règle correspond à celle du serveur', () => {
  it('le serveur n’exige que la discipline et le tarif', () => {
    const chemin = join(__dirname, '..', '..', 'backend', 'app', 'routers', 'auth.py');
    if (!existsSync(chemin)) return;

    const source = readFileSync(chemin, 'utf8');
    const garde = /merged\.get\("available"\)[^\n]*\n?[^\n]*/.exec(source)?.[0] ?? '';

    expect(garde).toContain('style');
    expect(garde).toContain('price_per_round');
    // Si le serveur se met à exiger la ville, ce test tombe et rappelle qu'il
    // faut la déplacer dans les champs obligatoires ici aussi.
    expect(garde).not.toContain('city');
  });
});

describe('carte de visibilité', () => {
  it('nomme les champs qui manquent', () => {
    render(<CarteVisibilite visibilite={evaluerVisibilite(VIDE)} />);

    expect(screen.getByText(/n’apparaissez pas encore/)).toBeTruthy();
    expect(screen.getByText('Sport')).toBeTruthy();
    expect(screen.getByText('Prix par round')).toBeTruthy();
  });

  it('invite à basculer l’interrupteur quand tout est rempli', () => {
    render(<CarteVisibilite visibilite={evaluerVisibilite(COMPLET)} />);

    expect(screen.getByText(/Il ne reste qu’à vous rendre visible/)).toBeTruthy();
  });

  it('confirme la visibilité sans rien réclamer', () => {
    render(<CarteVisibilite visibilite={evaluerVisibilite({ ...COMPLET, available: true })} />);

    expect(screen.getByText('Vous êtes visible')).toBeTruthy();
    expect(screen.queryByText('Sport')).toBeNull();
  });
});
