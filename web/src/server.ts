const INTERNAL_API_URL = process.env.INTERNAL_API_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

if (!INTERNAL_API_URL) throw new Error("INTERNAL_API_URL environment variable is required");
if (!INTERNAL_SECRET) throw new Error("INTERNAL_SECRET environment variable is required");

async function callServer(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${INTERNAL_API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${INTERNAL_SECRET}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function serverPost(path: string, body: unknown): Promise<Response> {
  return callServer("POST", path, body);
}

export async function serverGet(path: string): Promise<Response> {
  return callServer("GET", path);
}
