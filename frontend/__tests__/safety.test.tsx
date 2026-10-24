import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SafetySheet from '@/components/SafetySheet';
import { safetyService, toReportPayload } from '@/services/safety';
import { confirm } from '@/utils/confirm';
import {
  normalizePartner,
  normalizeReport,
  normalizeUser,
  normalizeUserSummary,
} from '@/utils/normalize';
import type { ReportSubject } from '@/types';
import responses from './fixtures/api-responses.json';

jest.mock('@/services/safety', () => {
  const actual = jest.requireActual('@/services/safety');
  return {
    ...actual,
    safetyService: {
      block: jest.fn().mockResolvedValue(undefined),
      unblock: jest.fn().mockResolvedValue(undefined),
      report: jest.fn().mockResolvedValue(undefined),
    },
  };
});

jest.mock('@/utils/confirm', () => ({ confirm: jest.fn().mockResolvedValue(true) }));

const LUIS: ReportSubject = {
  user: { id: 'u-luis', firstName: 'Luis', lastName: 'Dupont' },
  targetType: 'user',
  targetId: null,
};

beforeEach(() => jest.clearAllMocks());

describe('contrat API — sécurité', () => {
  it('lit la liste des personnes bloquées', () => {
    const [bloquee] = responses.blocks_list.items.map(normalizeUserSummary);
    expect(bloquee?.firstName).toBe('Maria');
    expect(bloquee?.id).toHaveLength(24);
  });

  it('lit un signalement tel que l’administrateur le voit', () => {
    const report = normalizeReport(responses.moderation_reports.items[0]);
    expect(report.targetType).toBe('user');
    expect(report.reason).toBe('fake_profile');
    expect(report.details).toBe('Palmarès inventé.');
    expect(report.excerpt).toBe('Maria Dupont');
    expect(report.status).toBe('open');
    expect(report.resolution).toBeNull();
    expect(report.reporter?.firstName).toBe('Ana');
    expect(report.reported?.firstName).toBe('Maria');
    expect(report.reportedOpenReports).toBe(1);
    expect(report.reportedSuspended).toBe(false);
  });

  it('lit le drapeau administrateur et le blocage d’une fiche', () => {
    expect(normalizeUser(responses.auth_me).isAdmin).toBe(false);
    expect(normalizeUser({ ...responses.auth_me, is_admin: true }).isAdmin).toBe(true);
    expect(normalizePartner(responses.partner_detail).isBlocked).toBe(false);
    expect(normalizePartner({ ...responses.partner_detail, is_blocked: true }).isBlocked).toBe(
      true,
    );
  });
});

describe('envoi d’un signalement', () => {
  it('envoie du snake_case, sans précisions vides ni identifiant inutile', () => {
    expect(toReportPayload(LUIS, 'harassment', '   ')).toEqual({
      user_id: 'u-luis',
      target_type: 'user',
      target_id: undefined,
      reason: 'harassment',
      details: undefined,
    });
    expect(
      toReportPayload(
        { ...LUIS, targetType: 'message', targetId: 'm1' },
        'fraud',
        ' Paie en liquide ',
      ),
    ).toEqual({
      user_id: 'u-luis',
      target_type: 'message',
      target_id: 'm1',
      reason: 'fraud',
      details: 'Paie en liquide',
    });
  });
});

describe('SafetySheet', () => {
  it('propose de signaler et de bloquer, puis bloque après confirmation', async () => {
    const onClose = jest.fn();
    const onBlockChange = jest.fn();
    render(
      <SafetySheet
        visible
        subject={LUIS}
        isBlocked={false}
        onClose={onClose}
        onBlockChange={onBlockChange}
      />,
    );

    expect(screen.getByText('Signaler ce profil')).toBeTruthy();
    fireEvent.press(screen.getByText('Bloquer Luis'));

    await waitFor(() => expect(safetyService.block).toHaveBeenCalledWith('u-luis'));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bloquer Luis ?' }));
    expect(onClose).toHaveBeenCalled();
    expect(onBlockChange).toHaveBeenCalledWith(true);
  });

  it('ne bloque pas si l’on renonce', async () => {
    jest.mocked(confirm).mockResolvedValueOnce(false);
    render(<SafetySheet visible subject={LUIS} isBlocked={false} onClose={jest.fn()} />);

    fireEvent.press(screen.getByText('Bloquer Luis'));

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(safetyService.block).not.toHaveBeenCalled();
  });

  it('propose de débloquer une personne déjà bloquée', async () => {
    const onBlockChange = jest.fn();
    render(
      <SafetySheet
        visible
        subject={LUIS}
        isBlocked
        onClose={jest.fn()}
        onBlockChange={onBlockChange}
      />,
    );

    expect(screen.queryByText('Bloquer Luis')).toBeNull();
    fireEvent.press(screen.getByText('Débloquer Luis'));

    await waitFor(() => expect(safetyService.unblock).toHaveBeenCalledWith('u-luis'));
    expect(onBlockChange).toHaveBeenCalledWith(false);
  });

  it('exige un motif, puis signale et bloque si la case est cochée', async () => {
    const onClose = jest.fn();
    const onBlockChange = jest.fn();
    const message: ReportSubject = { ...LUIS, targetType: 'message', targetId: 'm1' };
    render(
      <SafetySheet
        visible
        subject={message}
        isBlocked={false}
        initialStep="report"
        onClose={onClose}
        onBlockChange={onBlockChange}
      />,
    );

    expect(screen.getByText('Signaler ce message')).toBeTruthy();
    fireEvent.press(screen.getByText('Envoyer le signalement'));
    expect(screen.getByText('Choisissez un motif.')).toBeTruthy();
    expect(safetyService.report).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Arnaque, paiement hors appli'));
    fireEvent.changeText(screen.getByTestId('safety-details'), 'Il demande du liquide');
    fireEvent.press(screen.getByText('Bloquer aussi Luis'));
    fireEvent.press(screen.getByText('Envoyer le signalement'));

    await waitFor(() =>
      expect(safetyService.report).toHaveBeenCalledWith(message, 'fraud', 'Il demande du liquide'),
    );
    expect(safetyService.block).toHaveBeenCalledWith('u-luis');
    expect(onBlockChange).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('signale sans bloquer par défaut', async () => {
    render(
      <SafetySheet
        visible
        subject={LUIS}
        isBlocked={false}
        initialStep="report"
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText('Faux profil'));
    fireEvent.press(screen.getByText('Envoyer le signalement'));

    await waitFor(() =>
      expect(safetyService.report).toHaveBeenCalledWith(LUIS, 'fake_profile', ''),
    );
    expect(safetyService.block).not.toHaveBeenCalled();
  });
});
