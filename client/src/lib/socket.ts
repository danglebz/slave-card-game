import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types';

/**
 * Socket.IO client แบบ typed — emit/on ตรงตาม contract ใน shared/types.ts
 * (client: ฟัง ServerToClient, ส่ง ClientToServer)
 */
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: GameSocket = io();
