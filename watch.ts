// @ts-ignore
import index from "./index.html" with { type: "text" };
import { readdir } from "fs/promises";
import { watchFile } from "fs";
import UnpluginTypia from "@ryoppippi/unplugin-typia/bun";

const [out, src] = await Promise.all([
    readdir("out"),
    readdir("src").then((a) => a.map((v) => "src/" + v)),
]);

async function buildClient() {
    console.log("Building client...");
    await Bun.build({
        entrypoints: ["src/client.ts"],
        outdir: "out",
        target: "browser",
        sourcemap: "linked",
        plugins: [UnpluginTypia()],
        define: {
            DEBUG: String(true),
        },
    })
        .then(() => console.log("Client build success."))
        .catch(() => console.log("Client build failed."));
}
await buildClient();
watchFile("./src/client.ts", { interval: 50 }, buildClient);

const server = Bun.serve({
    port: 6969,
    fetch(request) {
        if (request.method !== "GET") {
            return new Response("Method Not Allowed", {
                status: 405,
                statusText: "Method Not Allowed",
                headers: { "Content-Type": "text/plain" },
            });
        }

        const url = new URL(request.url);

        if (url.pathname === "/") {
            return new Response(index, {
                headers: { "Content-Type": "text/html" },
            });
        } else {
            let path = url.pathname.slice(1);
            if (path.endsWith("/")) {
                path = path.slice(0, -1);
            }

            if (out.includes(path)) {
                const file = Bun.file(`./out/${path}`);

                // directory or binary file
                if (file.type === "application/octet-stream") {
                    return new Response("Not Found", {
                        status: 404,
                        headers: { "Content-Type": "text/plain" },
                    });
                }

                return new Response(file, {
                    headers: {
                        "Content-Type": file.type,
                    },
                });
            }
            // For when clicking in error stacktrace w/ the mapped source in the browser
            else if (src.includes(path)) {
                const file = Bun.file(path);

                // directory or binary file
                if (file.type === "application/octet-stream") {
                    return new Response("Not Found", {
                        status: 404,
                        headers: { "Content-Type": "text/plain" },
                    });
                }

                return new Response(file, {
                    headers: {
                        "Content-Type": file.type,
                    },
                });
            }
        }

        return new Response("Not Found", {
            status: 404,
            statusText: "Not Found",
            headers: { "Content-Type": "text/plain" },
        });
    },
});
console.log(`HTTP: Listening on ${server.hostname}:${server.port}`);
