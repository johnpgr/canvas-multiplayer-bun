import {
    GAME_HEIGHT,
    GAME_WIDTH,
    Hello,
    type MoveDirection,
    Player,
    PLAYER_SIZE,
    PlayerJoined,
    PlayerLeft,
    PlayerMoving,
    PlayerStartMoving,
    sendMessage,
    updatePlayer,
    SERVER_PORT,
} from "./common";
import { assert, debug, Try } from "./utils";

const DIRECTION_KEYS: { [key: string]: MoveDirection } = {
    ArrowLeft: "west",
    ArrowRight: "east",
    ArrowUp: "north",
    ArrowDown: "south",
    KeyA: "west",
    KeyD: "east",
    KeyW: "north",
    KeyS: "south",
};

const gameCanvas = document.getElementById("game") as HTMLCanvasElement | null;
assert(gameCanvas !== null, "Game canvas not found");
gameCanvas.width = GAME_WIDTH;
gameCanvas.height = GAME_HEIGHT;

const ctx = gameCanvas.getContext("2d");
assert(ctx !== null, "Canvas 2D context not found");

const ws = new WebSocket(`ws://${window.location.hostname}:${SERVER_PORT}`);

let ownId: number | undefined;
const players = new Map<number, Player>();
ws.addEventListener("open", () => {
    debug("Socket connection open");
});
ws.addEventListener("close", () => {
    debug("Socket connection closed");
});
ws.addEventListener("message", (event) => {
    const message = Try(() => JSON.parse(event.data));
    if (!message.ok) {
        debug("Failed to parse message (Invalid JSON)");
        ws.close();
        return;
    }
    // @ts-ignore
    delete message.ok;

    debug("Received message", message);

    if (Hello.is(message)) {
        ownId = message.id;
        debug(`Connected as player ${ownId}`);
    } else if (PlayerJoined.is(message)) {
        players.set(
            message.id,
            new Player(
                message.id,
                { x: message.x, y: message.y },
                message.style,
            ),
        );
    } else if (PlayerLeft.is(message)) {
        players.delete(message.id);
    } else if (PlayerMoving.is(message)) {
        const player = players.get(message.id);
        if (!player) {
            debug(`Received message for unknown player ${message.id}`);
            ws.close();
            return;
        }
        player.moving[message.direction] = message.start;
        player.x = message.x;
        player.y = message.y;
    } else {
        debug("Received invalid message", message);
        ws.close();
    }
});

let prevTime = 0;
const frame = (timestamp: number) => {
    const deltaTime = timestamp - prevTime;
    prevTime = timestamp;
    ctx.fillStyle = "#202020";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const player of players.values()) {
        updatePlayer(player, deltaTime);
        ctx.fillStyle = player.style;
        ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
        if (player.id === ownId) {
            ctx.strokeStyle = "white";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.strokeRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
            ctx.stroke();
        }
    }

    window.requestAnimationFrame(frame);
};

window.requestAnimationFrame((timestamp) => {
    prevTime = timestamp;
    frame(timestamp);
});

window.addEventListener("keydown", (event) => {
    if (ownId === undefined) return;
    if (event.repeat) return;

    const direction = DIRECTION_KEYS[event.code];
    if (!direction) return;

    sendMessage<PlayerStartMoving>(ws, {
        kind: "PlayerStartMoving",
        start: true,
        direction,
    });
});

window.addEventListener("keyup", (event) => {
    if (ownId === undefined) return;
    if (event.repeat) return;

    const direction = DIRECTION_KEYS[event.code];
    if (!direction) return;

    sendMessage<PlayerStartMoving>(ws, {
        kind: "PlayerStartMoving",
        start: false,
        direction,
    });
});
