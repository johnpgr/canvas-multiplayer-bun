import typia from "typia";
import {
    type C2SEvent,
    GAME_HEIGHT,
    GAME_WIDTH,
    Hello,
    Player,
    PLAYER_SIZE,
    PlayerJoined,
    PlayerStartMoving,
    sendMessage,
    SERVER_PORT,
    updatePlayer,
    type Vector2,
} from "./common";
import type { ServerWebSocket } from "bun";
import { debug, Try } from "./utils";

const SERVER_TPS = 30;
const PLAYER_LIMIT = 69;

class ServerPlayer extends Player {
    socket: ServerWebSocket<{ id: number }>;
    constructor(
        id: number,
        pos: Vector2,
        color: string,
        socket: ServerWebSocket<{ id: number }>,
    ) {
        super(id, pos, color);
        this.socket = socket;
    }
}

let idCount = 0;
const players = new Map<number, ServerPlayer>();
const eventQueue = new Set<C2SEvent>();

function randomStyle(): string {
    return `hsl(${Math.floor(Math.random() * 360)} 805 50%)`;
}

const wss = Bun.serve<{ id: number }>({
    port: SERVER_PORT,
    fetch(req, server) {
        const data = {};
        const success = server.upgrade(req, { data });
        if (success) {
            return;
        }

        return new Response();
    },
    websocket: {
        open(socket) {
            if (players.size >= PLAYER_LIMIT) {
                socket.close();
                return;
            }
            const id = idCount++;
            socket.data.id = id;
            const x = Math.random() * (GAME_WIDTH - PLAYER_SIZE);
            const y = Math.random() * (GAME_HEIGHT - PLAYER_SIZE);
            const style = randomStyle();
            const player = new ServerPlayer(id, { x, y }, style, socket);
            players.set(id, player);
            debug(`Player ${id} connected`);
            eventQueue.add({
                kind: "PlayerJoined",
                id: player.id,
                x: player.x,
                y: player.y,
                style: player.style,
            });
        },
        message(socket, rawMsg) {
            const message = Try(() => JSON.parse(rawMsg.toString()));
            if (!message.ok) {
                debug("Invalid message received", message.error);
                socket.close();
                return;
            }
            //@ts-ignore
            delete message.ok;

            const player = players.get(socket.data.id);
            if (!player) {
                debug(
                    `The player ${socket.data.id} is not found and is being disconnected`,
                );
                socket.close();
                return;
            }
            if (PlayerStartMoving.is(message)) {
                debug(`Received message from player ${player.id}`, message);
                eventQueue.add({
                    kind: "PlayerMoving",
                    id: player.id,
                    x: player.x,
                    y: player.y,
                    start: message.start,
                    direction: message.direction,
                });
            } else {
                debug(
                    `Received invalid message from player ${player.id}`,
                    message,
                );
                socket.close();
                return;
            }
        },
        close(socket) {
            debug(`Player ${socket.data.id} disconnected`);
            players.delete(socket.data.id);
            eventQueue.add({
                kind: "PlayerLeft",
                id: socket.data.id,
            });
        },
    },
});

debug("WebSocketServer listening on: ws://localhost:" + wss.port);

function tick(): void {
    for (let event of eventQueue) {
        switch (event.kind) {
            case "PlayerJoined": {
                const joinedPlayer = players.get(event.id);
                if (!joinedPlayer) continue;
                console.log("joinedPlayer:", joinedPlayer.id);
                sendMessage<Hello>(joinedPlayer.socket, {
                    kind: "Hello",
                    id: joinedPlayer.id,
                });
                const eventStr = typia.json.stringify(event);
                for (const otherPlayer of players.values()) {
                    sendMessage<PlayerJoined>(joinedPlayer.socket, {
                        kind: "PlayerJoined",
                        id: otherPlayer.id,
                        x: otherPlayer.x,
                        y: otherPlayer.y,
                        style: otherPlayer.style,
                    });
                    if (otherPlayer.id !== joinedPlayer.id) {
                        otherPlayer.socket.send(eventStr);
                    }
                }
                break;
            }
            case "PlayerLeft": {
                const eventStr = typia.json.stringify(event);
                for (const player of players.values()) {
                    player.socket.send(eventStr);
                }
                break;
            }
            case "PlayerMoving": {
                const player = players.get(event.id);
                if (!player) continue;
                player.moving[event.direction] = event.start;
                const eventStr = typia.json.stringify(event);
                for (const player of players.values()) {
                    player.socket.send(eventStr);
                }
                break;
            }
        }
    }
    eventQueue.clear();
    for (const player of players.values()) {
        updatePlayer(player, 1 / SERVER_TPS);
    }
    setTimeout(tick, 1000 / SERVER_TPS);
}

setTimeout(tick, 1000 / SERVER_TPS);
