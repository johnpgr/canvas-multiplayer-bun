import type { ServerWebSocket } from "bun";
import typia from "typia";
import { debug, mod } from "./utils";

export const SERVER_PORT = 6970;
export const STATS_SERVER_PORT = 6971;
export const WORLD_FACTOR = 200;
export const WORLD_WIDTH = 4 * WORLD_FACTOR;
export const WORLD_HEIGHT = 3 * WORLD_FACTOR;
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 500;
export const STATS_AVERAGE_CAPACITY = 30;

export type Vector2 = { x: number; y: number };
export type MoveDirection = "north" | "south" | "west" | "east";
export const DIRECTION_VECTORS: {
    [x in MoveDirection]: Vector2;
} = {
    north: { x: 0, y: -1 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 },
    east: { x: 1, y: 0 },
};

export class Player {
    id: number;
    x: number;
    y: number;
    style: string;
    moving: {
        [x in MoveDirection]: boolean;
    };

    constructor(id: number, pos: Vector2, style: string) {
        this.id = id;
        this.x = pos.x;
        this.y = pos.y;
        this.style = style;
        this.moving = {
            north: false,
            south: false,
            west: false,
            east: false,
        };
    }
}

export function updatePlayer(player: Player, deltaTime: number): void {
    let dir: MoveDirection;
    let dx = 0;
    let dy = 0;
    for (dir in DIRECTION_VECTORS) {
        if (player.moving[dir]) {
            dx += DIRECTION_VECTORS[dir].x;
            dy += DIRECTION_VECTORS[dir].y;
        }
    }
    const l = dx * dx + dy * dy;
    if (l !== 0) {
        dx /= l;
        dy /= l;
    }
    player.x = mod(player.x + dx * PLAYER_SPEED * deltaTime, WORLD_WIDTH);
    player.y = mod(player.y + dy * PLAYER_SPEED * deltaTime, WORLD_HEIGHT);
}

export interface Message {
    kind: string;
}

export function sendMessage<T extends Message>(
    ws: ServerWebSocket<{ id: number }> | WebSocket,
    message: T,
    _debug?: boolean,
): number {
    const str = JSON.stringify(message);
    if (_debug) debug("Sending message:", message);
    ws.send(str);
    return str.length;
}

export interface Hello extends Message {
    kind: "Hello";
    id: number;
    x: number;
    y: number;
    style: string;
}

export namespace Hello {
    export const fromJson = typia.json.createAssertParse<Hello>();
    export const is = typia.createIs<Hello>();
}

export interface PlayerJoined extends Message {
    kind: "PlayerJoined";
    id: number;
    x: number;
    y: number;
    style: string;
}

export namespace PlayerJoined {
    export const fromJson = typia.json.createAssertParse<PlayerJoined>();
    export const is = typia.createIs<PlayerJoined>();
}

export interface PlayerLeft extends Message {
    kind: "PlayerLeft";
    id: number;
}

export namespace PlayerLeft {
    export const fromJson = typia.json.createAssertParse<PlayerLeft>();
    export const is = typia.createIs<PlayerLeft>();
}

export interface PlayerMoving extends Message {
    kind: "PlayerMoving";
    id: number;
    x: number;
    y: number;
    start: boolean;
    direction: MoveDirection;
}

export namespace PlayerMoving {
    export const fromJson = typia.json.createAssertParse<PlayerMoving>();
    export const is = typia.createIs<PlayerMoving>();
}

export interface PlayerMoveRequest extends Message {
    kind: "PlayerMoveRequest";
    start: boolean;
    direction: MoveDirection;
}

export namespace PlayerMoveRequest {
    export const fromJson = typia.json.createAssertParse<PlayerMoveRequest>();
    export const is = typia.createIs<PlayerMoveRequest>();
}

export type C2SEvent = PlayerJoined | PlayerLeft | PlayerMoving;
