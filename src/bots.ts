import {
    Hello,
    Player,
    PLAYER_SPEED,
    PlayerJoined,
    PlayerLeft,
    PlayerMoveRequest,
    PlayerMoving,
    sendMessage,
    SERVER_PORT,
    updatePlayer,
    WORLD_HEIGHT,
    WORLD_WIDTH,
    type MoveDirection,
} from "./common";

const EPS = 10;
const BOT_TPS = 30;

class Bot {
    socket: WebSocket;
    me: Player | undefined;
    goalX: number;
    goalY: number;
    timeoutBeforeBurn: number | undefined;

    tick = () => {
        const deltaTime = 1 / BOT_TPS;
        if (this.timeoutBeforeBurn !== undefined) {
            this.timeoutBeforeBurn -= deltaTime;
            if (this.timeoutBeforeBurn <= 0) this.turn();
        }
        if (this.me !== undefined) {
            updatePlayer(this.me, deltaTime);
        }
        setTimeout(this.tick, 1000 / BOT_TPS);
    };

    constructor() {
        this.socket = new WebSocket(`ws://localhost:${SERVER_PORT}`);
        this.me = undefined;
        this.goalY = WORLD_HEIGHT * 0.5;
        this.goalX = WORLD_WIDTH * 0.5;
        this.timeoutBeforeBurn = undefined;

        this.socket.addEventListener("message", (event) => {
            const message = JSON.parse(event.data.toString());
            if (Hello.is(message)) {
                this.me = new Player(
                    message.id,
                    { x: message.x, y: message.y },
                    message.style,
                );
                this.turn();
                setTimeout(this.tick, 1000 / BOT_TPS);
                console.log(`Connected as player ${this.me.id}`);
            } else if (PlayerMoving.is(message)) {
                if (this.me !== undefined && message.id === this.me.id) {
                    this.me.x = message.x;
                    this.me.y = message.y;
                    this.me.moving[message.direction] = message.start;
                }
            } else if (PlayerJoined.is(message)) {
            } else if (PlayerLeft.is(message)) {
            } else {
                console.log("Received invalid message from server", message);
                this.socket.close();
            }
        });
    }

    turn() {
        if (this.me === undefined) return;
        let direction: MoveDirection;
        for (direction in this.me.moving) {
            if (this.me.moving[direction]) {
                this.me.moving[direction] = false;
                sendMessage<PlayerMoveRequest>(this.socket, {
                    kind: "PlayerMoveRequest",
                    start: false,
                    direction,
                });
            }
        }
        this.timeoutBeforeBurn = undefined;
        do {
            const dx = this.goalX - this.me.x;
            const dy = this.goalY - this.me.y;
            if (Math.abs(dx) > EPS) {
                if (dx > 0) {
                    sendMessage<PlayerMoveRequest>(this.socket, {
                        kind: "PlayerMoveRequest",
                        start: true,
                        direction: "east",
                    });
                } else {
                    sendMessage<PlayerMoveRequest>(this.socket, {
                        kind: "PlayerMoveRequest",
                        start: true,
                        direction: "west",
                    });
                }
                this.timeoutBeforeBurn = Math.abs(dx) / PLAYER_SPEED;
            } else if (Math.abs(dy) > EPS) {
                if (dy > 0) {
                    sendMessage<PlayerMoveRequest>(this.socket, {
                        kind: "PlayerMoveRequest",
                        start: true,
                        direction: "south",
                    });
                } else {
                    sendMessage<PlayerMoveRequest>(this.socket, {
                        kind: "PlayerMoveRequest",
                        start: true,
                        direction: "north",
                    });
                }
                this.timeoutBeforeBurn = Math.abs(dy) / PLAYER_SPEED;
            }
            if (this.timeoutBeforeBurn === undefined) {
                this.goalX = Math.random() * WORLD_WIDTH;
                this.goalY = Math.random() * WORLD_HEIGHT;
            }
        } while (this.timeoutBeforeBurn === undefined);
    }
}

const bots: Bot[] = [];
for (let i = 0; i < 10; i++) bots.push(new Bot());
