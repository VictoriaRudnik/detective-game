export function roomIdFromPath(pathname: string): string | undefined {
  return /^\/room\/([a-z0-9]{6})\/?$/i.exec(pathname)?.[1]?.toUpperCase();
}

export function roomPath(roomId: string): string {
  return `/room/${roomId}`;
}

export function roomUrl(roomId: string, origin: string = window.location.origin): string {
  return `${origin}${roomPath(roomId)}`;
}
