import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AnnouncementCard from '@/components/AnnouncementCard';
import { buildAnnouncementParams, toAnnouncementPayload } from '@/services/announcement';
import { normalizeAnnouncement } from '@/utils/normalize';
import { notificationRoute } from '@/utils/notifications';
import { announcementSchema, validate } from '@/utils/validation';
import type { Announcement, AnnouncementDraft } from '@/types';
import responses from './fixtures/api-responses.json';

describe('contrat API — annonces', () => {
  it('lit l’annonce renvoyée à sa création, infos du combattant comprises', () => {
    const annonce = normalizeAnnouncement(responses.announcement_create);

    expect(annonce.id).toHaveLength(24);
    expect(annonce.kind).toBe('fight');
    expect(annonce.style).toBe('muay_thai');
    expect(annonce.level).toBe('amateur');
    expect(annonce.weightClass).toBe('lightweight');
    expect(annonce.city).toBe('Valence');
    expect(annonce.fighterName).toBe('Yanis K.');
    expect(annonce.fighterRecord).toBe('8-2-0');
    expect(annonce.weightKg).toBe(63.5);
    expect(annonce.videoProvider).toBe('youtube');
    expect(annonce.scheduledFor).toBe(responses.announcement_create.scheduled_for);
    expect(annonce.isMine).toBe(true);
    expect(annonce.author?.firstName).toBe('Luis');
    // L'auteur reçoit la liste de ses réponses, vide à la création.
    expect(annonce.replies).toEqual([]);
  });

  it('montre à celui qui répond qu’il a répondu, sans lui montrer les réponses', () => {
    const annonce = normalizeAnnouncement(responses.announcement_reply);

    expect(annonce.hasReplied).toBe(true);
    expect(annonce.isMine).toBe(false);
    expect(annonce.repliesCount).toBe(1);
    // `null` et non `[]` : le lecteur ne sait rien des autres réponses.
    expect(annonce.replies).toBeNull();
  });

  it('lit la liste et le détail vu par l’auteur', () => {
    const liste = responses.announcements_list.items.map(normalizeAnnouncement);
    expect(responses.announcements_list.total).toBe(1);
    expect(liste[0]?.id).toBe(responses.announcement_create.id);
    expect(liste[0]?.hasReplied).toBe(true);

    const detail = normalizeAnnouncement(responses.announcement_detail_owner);
    expect(detail.replies).toHaveLength(1);
    expect(detail.replies?.[0]?.message).toBe(
      'Mon élève fait 63 kg, 6 combats, dispo à cette date.',
    );
    expect(detail.replies?.[0]?.author?.firstName).toBe('Ana');
    expect(detail.replies?.[0]?.createdAt).not.toBeNull();
  });
});

describe('envoi d’une annonce', () => {
  const brouillon: AnnouncementDraft = {
    kind: 'sparring',
    style: 'boxing',
    city: '  Valence ',
    level: null,
    weightClass: 'middleweight',
    scheduledFor: null,
    message: ' Quatre rounds techniques le jeudi. ',
    fighterName: 'Yanis',
    fighterRecord: '8-2-0',
    weightKg: 70,
    videoUrl: '   ',
  };

  it('envoie du snake_case et omet ce qui est vide', () => {
    expect(toAnnouncementPayload(brouillon)).toEqual({
      kind: 'sparring',
      style: 'boxing',
      city: 'Valence',
      level: undefined,
      weight_class: 'middleweight',
      scheduled_for: undefined,
      message: 'Quatre rounds techniques le jeudi.',
      video_url: undefined,
      // Ces champs n'ont de sens que pour un combat.
      fighter_name: undefined,
      fighter_record: undefined,
      weight_kg: undefined,
    });
  });

  it('garde les infos du combattant pour un combat', () => {
    const payload = toAnnouncementPayload({ ...brouillon, kind: 'fight' });
    expect(payload).toMatchObject({
      kind: 'fight',
      fighter_name: 'Yanis',
      fighter_record: '8-2-0',
      weight_kg: 70,
    });
  });

  it('filtre la liste par type, sport et ville', () => {
    expect(
      buildAnnouncementParams({
        filters: { kind: 'fight', style: 'mma', city: ' Mad ' },
        limit: 10,
      }),
    ).toEqual({ page: 1, limit: 10, kind: 'fight', style: 'mma', city: 'Mad' });
    expect(buildAnnouncementParams({ filters: { kind: null, city: '  ' }, limit: 10 })).toEqual({
      page: 1,
      limit: 10,
    });
  });

  it('valide le formulaire avant l’envoi', () => {
    const ok = validate(announcementSchema, {
      city: 'Valence',
      message: 'Quatre rounds techniques.',
      scheduledFor: null,
      fighterName: null,
      fighterRecord: null,
      weightKg: null,
    });
    expect(ok.success).toBe(true);

    const ko = validate(announcementSchema, {
      city: 'V',
      message: 'Court',
      scheduledFor: '2020-01-01T10:00:00Z',
      fighterName: null,
      fighterRecord: null,
      weightKg: 300,
    });
    expect(ko.success).toBe(false);
    expect(Object.keys(ko.errors).sort()).toEqual(['city', 'message', 'scheduledFor', 'weightKg']);
  });
});

describe('notification touchée', () => {
  const moi = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const lui = 'bbbbbbbbbbbbbbbbbbbbbbbb';

  it('ouvre l’annonce qui a reçu une réponse', () => {
    expect(notificationRoute({ type: 'announcement_reply', announcement_id: 'x1' }, moi)).toBe(
      '/announcement/x1',
    );
  });

  it('ouvre la conversation avec l’autre personne, quel que soit l’ordre du fil', () => {
    expect(notificationRoute({ type: 'message', conversation_id: `${moi}-${lui}` }, moi)).toBe(
      `/chat/${lui}`,
    );
    expect(notificationRoute({ type: 'message', conversation_id: `${lui}-${moi}` }, moi)).toBe(
      `/chat/${lui}`,
    );
  });

  it('n’ouvre rien pour une donnée inattendue', () => {
    expect(notificationRoute(null, moi)).toBeNull();
    expect(notificationRoute({ type: 'inconnu' }, moi)).toBeNull();
    expect(notificationRoute({ type: 'message', conversation_id: 'c-d' }, moi)).toBeNull();
    expect(
      notificationRoute({ type: 'message', conversation_id: `${moi}-${lui}` }, null),
    ).toBeNull();
  });
});

describe('AnnouncementCard', () => {
  const base: Announcement = normalizeAnnouncement({
    id: 'a1',
    kind: 'fight',
    style: 'muay_thai',
    city: 'Valence',
    level: 'amateur',
    weight_kg: 63.5,
    message: 'Adversaire cherché pour un gala amateur.',
    fighter_name: 'Yanis K.',
    status: 'open',
    author: { id: 'u1', first_name: 'Samir', last_name: 'Benali' },
    replies_count: 3,
    is_mine: false,
    has_replied: false,
  });

  it('résume l’annonce : type, sport, poids, date, auteur et réponses', () => {
    const onPress = jest.fn();
    render(<AnnouncementCard announcement={base} onPress={onPress} />);

    expect(screen.getByText('Combat')).toBeTruthy();
    expect(screen.getByText('Muay-thaï')).toBeTruthy();
    expect(screen.getByText('63,5 kg')).toBeTruthy();
    expect(screen.getByText('Date à convenir')).toBeTruthy();
    expect(screen.getByText('Samir B. pour Yanis K.')).toBeTruthy();
    expect(screen.getByText('3 réponses')).toBeTruthy();

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledWith(base);
  });

  it('signale qu’on a déjà répondu, ou que l’annonce est la sienne', () => {
    const { rerender } = render(
      <AnnouncementCard announcement={{ ...base, hasReplied: true }} onPress={jest.fn()} />,
    );
    expect(screen.getByText('Vous avez répondu')).toBeTruthy();

    rerender(
      <AnnouncementCard
        announcement={{ ...base, isMine: true, repliesCount: 1, status: 'closed' }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Votre annonce')).toBeTruthy();
    expect(screen.getByText('1 réponse')).toBeTruthy();
    expect(screen.getByText('Pourvue')).toBeTruthy();
  });
});
