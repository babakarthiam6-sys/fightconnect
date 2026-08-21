import { ENDPOINTS } from '@/constants/api';
import { http } from '@/services/api';
import { extractList, normalizeBooking, normalizeReview } from '@/utils/normalize';
import type { Booking, Review } from '@/types';

export type Direction = 'received' | 'sent';

export interface BookingInput {
  partnerId: string;
  /** ISO 8601. */
  scheduledAt: string;
  rounds: number;
}

export const bookingService = {
  async list(direction: Direction): Promise<Booking[]> {
    const payload = await http.get<unknown>(ENDPOINTS.bookings.list, {
      params: { direction },
    });
    return extractList(payload).map(normalizeBooking);
  },

  async create(input: BookingInput): Promise<Booking> {
    const payload = await http.post<unknown>(ENDPOINTS.bookings.create, {
      partner_id: input.partnerId,
      scheduled_at: input.scheduledAt,
      rounds: input.rounds,
    });
    return normalizeBooking(payload);
  },

  async accept(id: string): Promise<Booking> {
    return normalizeBooking(await http.post<unknown>(ENDPOINTS.bookings.accept(id)));
  },

  async decline(id: string): Promise<Booking> {
    return normalizeBooking(await http.post<unknown>(ENDPOINTS.bookings.decline(id)));
  },

  async cancel(id: string): Promise<Booking> {
    return normalizeBooking(await http.post<unknown>(ENDPOINTS.bookings.cancel(id)));
  },

  async complete(id: string): Promise<Booking> {
    return normalizeBooking(await http.post<unknown>(ENDPOINTS.bookings.complete(id)));
  },

  async reviews(id: string): Promise<Review[]> {
    const payload = await http.get<unknown>(ENDPOINTS.bookings.reviews(id));
    return extractList(payload).map(normalizeReview);
  },
};
