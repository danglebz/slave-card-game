import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types';

/**
 * typed Socket.IO client — emit/on match the contract in shared/types.ts
 * (client: listens to ServerToClient, sends ClientToServer)
 */
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: GameSocket = io();
