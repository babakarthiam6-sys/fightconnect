import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { VideoGallery } from '@/components/VideoGallery';
import { CONFIG } from '@/constants/config';
import { normalizeVideos } from '@/utils/normalize';
import type { ProfileVideo } from '@/types';

const YOUTUBE: ProfileVideo = {
  id: 'v1',
  url: 'https://youtu.be/dQw4w9WgXcQ',
  provider: 'youtube',
  kind: 'sparring',
  caption: 'Sparring boxe, mars',
  thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
};

const TIKTOK: ProfileVideo = {
  id: 'v2',
  url: 'https://www.tiktok.com/@x/video/7123456789012345678',
  provider: 'tiktok',
  kind: 'fight',
  caption: null,
  thumbnailUrl: null,
};

describe('normalizeVideos', () => {
  it('accepte la charge du serveur en snake_case', () => {
    const videos = normalizeVideos([
      {
        id: 'v1',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        provider: 'youtube',
        kind: 'fight',
        caption: null,
        thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      },
    ]);

    expect(videos).toEqual([
      {
        id: 'v1',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        provider: 'youtube',
        kind: 'fight',
        caption: null,
        thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      },
    ]);
  });

  it('écarte une entrée sans URL exploitable', () => {
    // Une tuile qui n'ouvre rien est pire qu'une case vide.
    expect(normalizeVideos([{ id: 'v1', provider: 'youtube' }])).toEqual([]);
  });

  it('retombe sur une valeur connue quand la nature est inattendue', () => {
    const videos = normalizeVideos([{ url: 'https://youtu.be/a', kind: 'karaoke' }]);

    expect(videos.map((video) => video.kind)).toEqual(['sparring']);
  });

  it('traite une galerie absente comme une galerie vide', () => {
    expect(normalizeVideos(undefined)).toEqual([]);
    expect(normalizeVideos(null)).toEqual([]);
  });
});

describe('VideoGallery', () => {
  it('affiche la nature et la légende de chaque vidéo', () => {
    render(<VideoGallery videos={[YOUTUBE, TIKTOK]} />);

    expect(screen.getByText('Sparring')).toBeTruthy();
    expect(screen.getByText('Combat')).toBeTruthy();
    expect(screen.getByText('Sparring boxe, mars')).toBeTruthy();
  });

  it('ouvre la vidéo sur sa plateforme plutôt que dans l’application', () => {
    // Intégrer TikTok ou Instagram dans une WebView casse sur Android : la
    // lecture reste chez l'hébergeur.
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<VideoGallery videos={[YOUTUBE]} />);

    fireEvent.press(screen.getByLabelText('Sparring boxe, mars'));

    expect(open).toHaveBeenCalledWith(YOUTUBE.url);
    open.mockRestore();
  });

  it('n’affiche ni ajout ni retrait sur le profil d’un autre', () => {
    render(<VideoGallery videos={[YOUTUBE]} />);

    expect(screen.queryByLabelText('Ajouter une vidéo')).toBeNull();
    expect(screen.queryByLabelText('Retirer cette vidéo')).toBeNull();
  });

  it('propose l’ajout et le retrait sur son propre profil', () => {
    const onAdd = jest.fn();
    const onRemove = jest.fn();
    render(<VideoGallery videos={[YOUTUBE]} onAdd={onAdd} onRemove={onRemove} />);

    fireEvent.press(screen.getByLabelText('Ajouter une vidéo'));
    fireEvent.press(screen.getByLabelText('Retirer cette vidéo'));

    expect(onAdd).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith(YOUTUBE);
  });

  it('retire la case d’ajout quand la galerie est pleine', () => {
    // Proposer un formulaire pour le voir refusé est une promesse non tenue.
    const pleine = Array.from({ length: CONFIG.maxVideos }, (_, index) => ({
      ...YOUTUBE,
      id: `v${index}`,
    }));
    render(<VideoGallery videos={pleine} onAdd={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.queryByLabelText('Ajouter une vidéo')).toBeNull();
    expect(screen.getByText(/Galerie pleine/)).toBeTruthy();
  });

  it('garde la case d’ajout tant qu’il reste de la place', () => {
    const presque = Array.from({ length: CONFIG.maxVideos - 1 }, (_, index) => ({
      ...YOUTUBE,
      id: `v${index}`,
    }));
    render(<VideoGallery videos={presque} onAdd={jest.fn()} />);

    expect(screen.getByLabelText('Ajouter une vidéo')).toBeTruthy();
  });

  it('reste silencieuse sur un profil sans vidéo', () => {
    const { toJSON } = render(<VideoGallery videos={[]} />);

    expect(toJSON()).toBeNull();
  });
});
