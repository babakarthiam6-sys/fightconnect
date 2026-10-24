import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import { extractList, normalizeReport, normalizeUserSummary } from '@/utils/normalize';
import type { Report, ReportAction, ReportReason, ReportSubject, UserSummary } from '@/types';

/** Corps d'un signalement, en snake_case ; les précisions vides ne partent pas. */
export function toReportPayload(
  subject: ReportSubject,
  reason: ReportReason,
  details: string,
): Record<string, unknown> {
  return {
    user_id: subject.user.id,
    target_type: subject.targetType,
    target_id: subject.targetId ?? undefined,
    reason,
    details: details.trim() || undefined,
  };
}

/** Bloquer, signaler et, pour les administrateurs, trancher les signalements. */
export const safetyService = {
  async blocked(): Promise<UserSummary[]> {
    const payload = await http.get<unknown>(ENDPOINTS.safety.blocks);
    return extractList(payload)
      .map(normalizeUserSummary)
      .filter((person): person is UserSummary => person !== null);
  },

  async block(userId: string): Promise<void> {
    await http.post<unknown>(ENDPOINTS.safety.blocks, { user_id: userId });
  },

  async unblock(userId: string): Promise<void> {
    await http.delete<unknown>(ENDPOINTS.safety.unblock(userId));
  },

  async report(subject: ReportSubject, reason: ReportReason, details: string): Promise<void> {
    await http.post<unknown>(ENDPOINTS.safety.reports, toReportPayload(subject, reason, details));
  },

  async reports(status: 'open' | 'resolved' = 'open'): Promise<Report[]> {
    const payload = await http.get<unknown>(ENDPOINTS.safety.adminReports, { params: { status } });
    return extractList(payload).map(normalizeReport);
  },

  async resolve(reportId: string, action: ReportAction): Promise<Report> {
    return normalizeReport(
      await http.post<unknown>(ENDPOINTS.safety.resolve(reportId), { action }),
    );
  },

  async unsuspend(userId: string): Promise<void> {
    await http.post<unknown>(ENDPOINTS.safety.unsuspend(userId));
  },
};
