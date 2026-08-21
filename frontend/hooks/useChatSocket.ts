import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE_URL } from '@/constants/config';
import { ENDPOINTS } from '@/constants/api';
import { getAuthToken } from '@/services/api';
import { normalizeMessage } from '@/utils/normalize';
import type { Message } from '@/types';

/** Le serveur répond soit un message, soit un refus de la modération. */
type Incoming =
  | { type: 'message'; message: unknown }
  | { type: 'blocked'; reason: string | null; message: string }
  | { type: 'error'; reason: string };

interface Options {
  onMessage: (message: Message) => void;
  onBlocked: (text: string) => void;
}

/**
 * Transforme l'adresse de l'API en adresse WebSocket : http→ws, https→wss.
 *
 * Renvoie une chaîne vide quand l'adresse est relative et qu'aucune origine
 * n'est disponible — le cas d'un build natif configuré avec « /api/v1 », où
 * `window.location` n'existe pas. Le fil ne s'ouvre alors pas, au lieu de lever
 * sur une adresse malformée.
 */
export function socketUrl(base: string, token: string): string {
  let absolute = base;

  if (!base.startsWith('http')) {
    const origin = typeof window !== 'undefined' ? window.location?.origin : undefined;
    if (!origin) return '';
    absolute = `${origin}${base}`;
  }

  return `${absolute.replace(/^http/, 'ws')}${ENDPOINTS.chat.socket(token)}`;
}

/**
 * Fil temps réel.
 *
 * Une seule connexion pour la conversation ouverte. La reconnexion est espacée
 * progressivement : marteler le serveur pendant une coupure réseau n'accélère
 * rien et vide la batterie.
 */
export function useChatSocket({ onMessage, onBlocked }: Options) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef(false);

  // Les rappels changent à chaque rendu du parent ; les garder dans une ref
  // évite de rouvrir la connexion à chaque frappe.
  const handlersRef = useRef({ onMessage, onBlocked });
  handlersRef.current = { onMessage, onBlocked };

  const connect = useCallback(() => {
    const token = getAuthToken();
    if (!token) return;

    const url = socketUrl(API_BASE_URL, token);
    if (!url) return;

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      attemptRef.current = 0;
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      let payload: Incoming;
      try {
        payload = JSON.parse(String(event.data)) as Incoming;
      } catch {
        return;
      }

      if (payload.type === 'message') {
        handlersRef.current.onMessage(normalizeMessage(payload.message));
      } else if (payload.type === 'blocked') {
        handlersRef.current.onBlocked(payload.message);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      if (closedByUsRef.current) return;

      attemptRef.current += 1;
      const delay = Math.min(1000 * 2 ** (attemptRef.current - 1), 15000);
      timerRef.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    closedByUsRef.current = false;
    connect();

    return () => {
      closedByUsRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((recipientId: string, content: string): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ recipient_id: recipientId, content }));
    return true;
  }, []);

  return { isConnected, send };
}
