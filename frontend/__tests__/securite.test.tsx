import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SecuriteSheet from '@/components/SecuriteSheet';
import SupprimerLeCompteScreen from '@/app/compte/supprimer';
import { securiteService } from '@/services/securite';
import { useAuth } from '@/context/AuthContext';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/services/securite', () => ({
  MOTIFS: ['harcelement', 'contenu_haineux', 'arnaque', 'hors_plateforme', 'autre'],
  securiteService: { signaler: jest.fn(), bloquer: jest.fn(), debloquer: jest.fn() },
}));

jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const deleteAccount = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  deleteAccount.mockResolvedValue(undefined);
  mockedUseAuth.mockReturnValue({ deleteAccount } as unknown as ReturnType<typeof useAuth>);
});

/**
 * Ces trois gestes sont ce que les magasins vérifient dans une application où
 * les gens s'écrivent. Ils sont testés comme des exigences, pas comme des
 * options : leur absence fait rejeter l'application.
 */
describe('feuille de signalement et de blocage', () => {
  function poser(onBlocked = jest.fn()) {
    render(
      <SecuriteSheet
        visible
        onClose={jest.fn()}
        userId="p1"
        nom="Luis B."
        onBlocked={onBlocked}
      />,
    );
    return onBlocked;
  }

  it('refuse de signaler tant qu’aucun motif n’est choisi', () => {
    poser();

    fireEvent.press(screen.getByTestId('securite-signaler'));

    expect(securiteService.signaler).not.toHaveBeenCalled();
  });

  it('envoie le signalement avec le motif choisi', async () => {
    poser();

    fireEvent.press(screen.getByText('Arnaque ou fraude'));
    fireEvent.press(screen.getByTestId('securite-signaler'));

    await waitFor(() =>
      expect(securiteService.signaler).toHaveBeenCalledWith('user', 'p1', 'arnaque'),
    );
  });

  /** Bloquer n'est pas un signalement plus fort : c'est immédiat et sans motif. */
  it('bloque sans exiger de motif', async () => {
    const onBlocked = poser();

    fireEvent.press(screen.getByTestId('securite-bloquer'));

    await waitFor(() => expect(securiteService.bloquer).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(onBlocked).toHaveBeenCalled());
  });
});

describe('suppression du compte', () => {
  it('n’efface rien tant que le mot de passe est vide', () => {
    render(<SupprimerLeCompteScreen />);

    fireEvent.press(screen.getByTestId('delete-confirm'));

    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('supprime après confirmation par mot de passe', async () => {
    render(<SupprimerLeCompteScreen />);

    fireEvent.changeText(screen.getByTestId('delete-password'), 'MonMotDePasse1');
    fireEvent.press(screen.getByTestId('delete-confirm'));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('MonMotDePasse1'));
  });

  /**
   * L'écran doit dire ce qui reste, pas seulement ce qui part. Une suppression
   * qui laisse des traces sans le dire est un mensonge ; c'est aussi ce que la
   * fiche de confidentialité du magasin promet, et les deux doivent coïncider.
   */
  it('annonce ce qui disparaît et ce qui subsiste', () => {
    render(<SupprimerLeCompteScreen />);

    // « définitive » apparaît deux fois : dans l'avertissement et sur le
    // bouton. C'est voulu — on vérifie donc la phrase entière.
    expect(screen.getByText(/Cette action est définitive/)).toBeTruthy();
    expect(screen.getByText(/sans votre nom/)).toBeTruthy();
  });
});
