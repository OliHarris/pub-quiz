"use client";

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { GameConnection, type GameSocket } from "./connection";

/**
 * Connects to the game server for as long as the component is on screen.
 * Returns the connection (for sending) plus its live status and room state.
 */
export function useGameConnection(
  onConnect: (socket: GameSocket, connection: GameConnection) => void | Promise<void>,
) {
  const [connection] = useState(() => new GameConnection());
  // Always calls the latest onConnect without reconnecting when it changes.
  const handleConnect = useEffectEvent((socket: GameSocket) => {
    void onConnect(socket, connection);
  });

  useEffect(() => {
    connection.start((socket) => handleConnect(socket));
    return () => connection.stop();
  }, [connection]);

  const snapshot = useSyncExternalStore(
    connection.subscribe,
    connection.getSnapshot,
    connection.getServerSnapshot,
  );
  return { connection, ...snapshot };
}
