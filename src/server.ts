import typia from "typia";
import {
    type C2SEvent,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    Hello,
    type MoveDirection,
    Player,
    PLAYER_SIZE,
    PlayerJoined,
    PlayerLeft,
    PlayerMoving,
    PlayerMoveRequest,
    sendMessage,
    SERVER_PORT,
    updatePlayer,
    type Vector2,
    STATS_SERVER_PORT,
} from "./common";
import type { ServerWebSocket } from "bun";
import { debug, Try } from "./utils";

const SERVER_TPS = 30;
const PLAYER_LIMIT = 69;
const STATS_AVERAGE_CAPACITY = 30;
const STATS_INTERVAL = 5000;

interface IStats {
    startedAt: number;
    ticksCount: number;
    tickTimes: number[];
    messagesSent: number;
    messagesReceived: number;
    tickMessagesSent: number[];
    tickMessagesReceived: number[];
    bytesSent: number;
    bytesReceived: number;
    tickByteSent: number[];
    tickByteReceived: number[];
    playersJoined: number;
    playersLeft: number;
    invalidMessages: number;
}

class Stats implements IStats {
    startedAt: number;
    ticksCount: number;
    tickTimes: number[];
    messagesSent: number;
    messagesReceived: number;
    tickMessagesSent: number[];
    tickMessagesReceived: number[];
    bytesSent: number;
    bytesReceived: number;
    tickByteSent: number[];
    tickByteReceived: number[];
    playersJoined: number;
    playersLeft: number;
    invalidMessages: number;

    constructor(_stats: IStats) {
        Object.assign(this, _stats);
    }

    print(): string {
        return `Stats:
    Ticks: ${stats.ticksCount}
    Uptime (secs): ${performance.now() - stats.startedAt}
    Average tick time: ${average(stats.tickTimes)}
    Messages sent: ${stats.messagesSent}
    Messages received: ${stats.messagesReceived}
    Average messages sent per tick: ${average(stats.tickMessagesSent)}
    Average messages received per tick: ${average(stats.tickMessagesReceived)}
    Bytes sent: ${stats.bytesSent}
    Bytes received: ${stats.bytesReceived}
    Average bytes sent per tick: ${average(stats.tickByteSent)}
    Average bytes received per tick: ${average(stats.tickByteReceived)}
    Current players: ${players.size}
    Players joined: ${stats.playersJoined}
    Players left: ${stats.playersLeft}
    Invalid messages: ${stats.invalidMessages}
`;
    }
}

const stats = new Stats({
    startedAt: performance.now(),
    ticksCount: 0,
    tickTimes: [0],
    messagesSent: 0,
    messagesReceived: 0,
    tickMessagesSent: [0],
    tickMessagesReceived: [0],
    bytesSent: 0,
    bytesReceived: 0,
    tickByteSent: [0],
    tickByteReceived: [0],
    playersJoined: 0,
    playersLeft: 0,
    invalidMessages: 0,
});

function average(it: number[]): number {
    return it.reduce((a, b) => a + b, 0) / it.length;
}

function pushAverage(it: number[], x: number) {
    if (it.push(x) > STATS_AVERAGE_CAPACITY) {
        it.shift();
    }
}

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
let bytesReceivedWithinTick = 0;
const players = new Map<number, ServerPlayer>();
const eventQueue = new Set<C2SEvent>();
const joinedIds = new Set<number>();
const leftIds = new Set<number>();

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
            const x = Math.random() * (WORLD_WIDTH - PLAYER_SIZE);
            const y = Math.random() * (WORLD_HEIGHT - PLAYER_SIZE);
            const style = randomStyle();
            const player = new ServerPlayer(id, { x, y }, style, socket);
            players.set(id, player);
            debug(`Player ${id} connected`);
            //prettier-ignore
            eventQueue.add({
                kind: "PlayerJoined",
                id, x, y, style
            });
            stats.playersJoined++;
        },
        message(socket, rawMsg) {
            const msgLength = rawMsg.toString().length;
            stats.messagesReceived++;
            stats.bytesReceived += msgLength;
            bytesReceivedWithinTick += msgLength;

            const message = Try(() => JSON.parse(rawMsg.toString()));
            if (!message.ok) {
                stats.invalidMessages++;
                debug("Invalid message received", message.error);
                socket.close();
                return;
            }
            //@ts-ignore
            delete message.ok;

            const player = players.get(socket.data.id);
            if (!player) {
                stats.invalidMessages++;
                debug(
                    `The player ${socket.data.id} is not found and is being disconnected`,
                );
                socket.close();
                return;
            }

            if (PlayerMoveRequest.is(message)) {
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
                stats.invalidMessages++;
                debug(
                    `Received invalid message from player ${player.id}`,
                    message,
                );
                socket.close();
                return;
            }
        },
        close(socket) {
            stats.playersLeft++;
            debug(`Player ${socket.data.id} disconnected`);
            players.delete(socket.data.id);
            eventQueue.add({
                kind: "PlayerLeft",
                id: socket.data.id,
            });
        },
    },
});

console.log("WebSocketServer listening on: ws://localhost:" + wss.port);

function tick(): void {
    const beginTickTime = performance.now();
    let messageSentCount = 0;
    let bytesSentCount = 0;

    joinedIds.clear();
    leftIds.clear();

    // This makes sure that if someone joins and leves in the same tick, the player will not be removed
    for (const event of eventQueue) {
        switch (event.kind) {
            case "PlayerJoined": {
                joinedIds.add(event.id);
                break;
            }
            case "PlayerLeft": {
                if (!joinedIds.delete(event.id)) {
                    leftIds.add(event.id);
                }
                break;
            }
        }
    }

    // Greet all the joined players and notify them about other players.
    joinedIds.forEach((joinedId) => {
        const joinedPlayer = players.get(joinedId);
        if (joinedPlayer !== undefined) {
            // This should never happen, but we handling none existing ids for more robustness
            // The greetings
            bytesSentCount += sendMessage<Hello>(joinedPlayer.socket, {
                kind: "Hello",
                id: joinedPlayer.id,
                x: joinedPlayer.x,
                y: joinedPlayer.y,
                style: joinedPlayer.style,
            });
            messageSentCount++;
            // Reconstruct the state of the other players
            players.forEach((otherPlayer) => {
                if (joinedId !== otherPlayer.id) {
                    // Joined player should already know about themselves
                    bytesSentCount += sendMessage<PlayerJoined>(
                        joinedPlayer.socket,
                        {
                            kind: "PlayerJoined",
                            id: otherPlayer.id,
                            x: otherPlayer.x,
                            y: otherPlayer.y,
                            style: otherPlayer.style,
                        },
                    );
                    messageSentCount++;
                    let direction: MoveDirection;
                    for (direction in otherPlayer.moving) {
                        if (otherPlayer.moving[direction]) {
                            bytesSentCount += sendMessage<PlayerMoving>(
                                joinedPlayer.socket,
                                {
                                    kind: "PlayerMoving",
                                    id: otherPlayer.id,
                                    x: otherPlayer.x,
                                    y: otherPlayer.y,
                                    start: true,
                                    direction,
                                },
                            );
                            messageSentCount++;
                        }
                    }
                }
            });
        }
    });

    // Notifying about who joined
    joinedIds.forEach((joinedId) => {
        const joinedPlayer = players.get(joinedId);
        if (joinedPlayer !== undefined) {
            //This should never happen, but we handling none existing ids for more robustness
            players.forEach((otherPlayer) => {
                if (joinedId !== otherPlayer.id) {
                    bytesSentCount += sendMessage<PlayerJoined>(
                        otherPlayer.socket,
                        {
                            kind: "PlayerJoined",
                            id: joinedPlayer.id,
                            x: joinedPlayer.x,
                            y: joinedPlayer.y,
                            style: joinedPlayer.style,
                        },
                    );
                    messageSentCount++;
                }
            });
        }
    });

    // Notify about who left
    leftIds.forEach((leftId) => {
        players.forEach((otherPlayer) => {
            bytesSentCount += sendMessage<PlayerLeft>(otherPlayer.socket, {
                kind: "PlayerLeft",
                id: leftId,
            });
            messageSentCount++;
        });
    });

    // Notify about movement
    for (const event of eventQueue) {
        switch (event.kind) {
            case "PlayerMoving": {
                const player = players.get(event.id);
                if (player === undefined) {
                    // This May happen if somebody joined, moved and left within a single tick. Just skipping.
                    continue;
                }
                player.moving[event.direction] = event.start;
                const eventStr = typia.json.stringify(event);
                players.forEach((otherPlayer) => {
                    otherPlayer.socket.send(eventStr);
                    messageSentCount++;
                    bytesSentCount += eventStr.length;
                });
                break;
            }
        }
    }
    // Simulate the world for one server tick
    // TODO: simulate at actual deltaTime, so to not break the prediction of the players.
    players.forEach((player) => updatePlayer(player, 1 / SERVER_TPS));
    stats.ticksCount++;
    pushAverage(stats.tickTimes, (performance.now() - beginTickTime) / 1000);
    stats.messagesSent += messageSentCount;
    pushAverage(stats.tickMessagesSent, messageSentCount);
    pushAverage(stats.tickMessagesReceived, eventQueue.size);
    stats.bytesSent += bytesSentCount;
    pushAverage(stats.tickByteSent, bytesSentCount);
    pushAverage(stats.tickByteReceived, bytesReceivedWithinTick);

    eventQueue.clear();
    bytesReceivedWithinTick = 0;

    setTimeout(tick, 1000 / SERVER_TPS);
}

setTimeout(tick, 1000 / SERVER_TPS);

let statsInterval: Timer | undefined;
const statsWss = Bun.serve({
    port: STATS_SERVER_PORT,
    fetch(req, server) {
        const success = server.upgrade(req);
        if (success) {
            return;
        }

        return new Response();
    },
    websocket: {
        message() {},
        open(ws) {
            debug("New client connected for stats");
            statsInterval = setInterval(() => {
                if (ws.readyState === 1) {
                    ws.send(stats.print());
                } else {
                    clearInterval(statsInterval);
                }
            }, STATS_INTERVAL);
        },
        close() {
            debug("Client disconnected from stats");
            clearInterval(statsInterval);
        },
    },
});
console.log(
    `Stats WebSocketServer listening on: ws://localhost:${statsWss.port}`,
);
