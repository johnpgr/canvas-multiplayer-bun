import { STATS_SERVER_PORT } from "./src/common";

const ws = new WebSocket(`ws://localhost:${STATS_SERVER_PORT}`);
ws.addEventListener("open", () => {
    console.log("Connected to stats server");
});
ws.addEventListener("message", (e) => {
    console.log(e.data.toString());
});
ws.addEventListener("close", () => {
    console.log("Disconnected from the stats server");
});

ws.addEventListener("error", (error) => {
    console.error(error);
});
