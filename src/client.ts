import {
    WORLD_HEIGHT,
    WORLD_WIDTH,
    Hello,
    type MoveDirection,
    Player,
    PLAYER_SIZE,
    PlayerJoined,
    PlayerLeft,
    PlayerMoving,
    PlayerMoveRequest,
    sendMessage,
    updatePlayer,
    SERVER_PORT,
} from "./common";
import { assert, debug, Try } from "./utils";

const $ = document.querySelector.bind(document);

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

const gameCanvas = $("#game") as HTMLCanvasElement | null;
assert(gameCanvas !== null, "Game canvas not found");
gameCanvas.width = WORLD_WIDTH;
gameCanvas.height = WORLD_HEIGHT;

const ctx = gameCanvas.getContext("2d");
assert(ctx !== null, "Canvas 2D context not found");

const ws = new WebSocket(`ws://${window.location.hostname}:${SERVER_PORT}`);

let me: Player | undefined;
const players = new Map<number, Player>();
ws.addEventListener("open", () => {
    debug("Socket connection open");
});
ws.addEventListener("close", () => {
    debug("Socket connection closed");
});
ws.addEventListener("error", (event) => {
    //TODO: reconnect on errors
    console.log("Websocket error", event);
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
        me = new Player(
            message.id,
            { x: message.x, y: message.y },
            message.style,
        );
        players.set(me.id, me);
        debug(`Connected as player ${me.id}`);
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
    const deltaTime = (timestamp - prevTime) / 1000;
    prevTime = timestamp;
    ctx.fillStyle = "#202020";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    players.forEach((player) => {
        if (me !== undefined && me.id !== player.id) {
            updatePlayer(player, deltaTime);
            ctx.fillStyle = player.style;
            ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
        }
    });

    if (me !== undefined) {
        updatePlayer(me, deltaTime);
        ctx.fillStyle = me.style;
        ctx.fillRect(me.x, me.y, PLAYER_SIZE, PLAYER_SIZE);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.strokeRect(me.x, me.y, PLAYER_SIZE, PLAYER_SIZE);
        ctx.stroke();
    }
    window.requestAnimationFrame(frame);
};

window.requestAnimationFrame((timestamp) => {
    prevTime = timestamp;
    frame(timestamp);
});

window.addEventListener("keydown", (event) => {
    if (me === undefined) return;
    if (event.repeat) return;

    const direction = DIRECTION_KEYS[event.code];
    if (!direction) return;

    sendMessage<PlayerMoveRequest>(ws, {
        kind: "PlayerMoveRequest",
        start: true,
        direction,
    });
});

window.addEventListener("keyup", (event) => {
    if (me === undefined) return;
    if (event.repeat) return;

    const direction = DIRECTION_KEYS[event.code];
    if (!direction) return;

    sendMessage<PlayerMoveRequest>(ws, {
        kind: "PlayerMoveRequest",
        start: false,
        direction,
    });
});

//@ts-ignore
if (DEBUG) {
    const debugBtn = document.createElement("button");
    debugBtn.textContent = "Debug";
    debugBtn.className = "debug-btn";
    document.body.appendChild(debugBtn);

    debugBtn.addEventListener("click", () => {
        debug({ me, players });
    });
}
