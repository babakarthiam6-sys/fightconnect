/**
 * Écran à ouvrir quand on touche une notification.
 *
 * Le serveur joint à chaque notification de quoi retrouver son sujet : le fil
 * d'une conversation (« idA-idB », les deux identifiants triés) ou l'annonce
 * qui a reçu une réponse. Une donnée inattendue n'ouvre rien plutôt qu'un
 * écran faux : l'application s'ouvre alors simplement là où elle en était.
 */
export function notificationRoute(data: unknown, myId: string | null | undefined): string | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;

  if (payload.type === 'announcement_reply' && typeof payload.announcement_id === 'string') {
    return payload.announcement_id ? `/announcement/${payload.announcement_id}` : null;
  }

  if (payload.type === 'message' && typeof payload.conversation_id === 'string' && myId) {
    const ids = payload.conversation_id.split('-');
    if (ids.length !== 2 || !ids.includes(myId)) return null;
    const other = ids.find((id) => id !== myId) ?? null;
    return other ? `/chat/${other}` : null;
  }

  return null;
}
