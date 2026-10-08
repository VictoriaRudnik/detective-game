import type { PublicRoomView } from "@game/shared";
import type { RoomActions } from "../net/useRoom";

export interface ScreenProps {
  view: PublicRoomView;
  playerId: string;
  actions: RoomActions;
}
