import { createExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { isAiReferrer, redirectKey, type WorkerEnv } from "../index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const source = "https://example.com/old?campaign=ai";
const rule = JSON.stringify({ active: true, destination: "https://example.com/new" });

function setup(status: number, value: string | null = rule) {
	const get = vi.fn(async () => value);
	const env = { REDIRECTS: { get } } as unknown as WorkerEnv;
	const origin = vi.fn(async () => new Response("origin response", { status }));
	vi.stubGlobal("fetch", origin);
	return { env, get, origin };
}

afterEach(() => vi.unstubAllGlobals());

describe("edge redirect interceptor", () => {
	it("redirects a 404 when an active same-host rule exists", async () => {
		const { env, get, origin } = setup(404);
		const response = await worker.fetch(new IncomingRequest(source), env, createExecutionContext());
		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe("https://example.com/new");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(get).toHaveBeenCalledWith("redirect:v1:example.com:/old");
		expect(origin).toHaveBeenCalledTimes(1);
	});

	it("checks active rules for an AI referral even when the origin returns 200", async () => {
		const { env } = setup(200);
		const request = new IncomingRequest(source, { headers: { Referer: "https://chatgpt.com/c/123" } });
		expect((await worker.fetch(request, env, createExecutionContext())).status).toBe(301);
	});

	it("passes ordinary healthy responses through without consulting KV", async () => {
		const { env, get } = setup(200);
		const response = await worker.fetch(new IncomingRequest(source), env, createExecutionContext());
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("origin response");
		expect(get).not.toHaveBeenCalled();
	});

	it("passes through 404s without an active rule", async () => {
		const { env } = setup(404, null);
		const response = await worker.fetch(new IncomingRequest(source), env, createExecutionContext());
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("origin response");
	});

	it.each([
		JSON.stringify({ active: false, destination: "https://example.com/new" }),
		JSON.stringify({ active: true, destination: "https://evil.example/new" }),
		JSON.stringify({ active: true, destination: "http://example.com/new" }),
		JSON.stringify({ active: true, destination: "https://example.com/old?loop=1" }),
		"not-json",
	])("rejects disabled, unsafe, looping, or malformed rules", async (value) => {
		const { env } = setup(404, value);
		expect((await worker.fetch(new IncomingRequest(source), env, createExecutionContext())).status).toBe(404);
	});

	it("does not redirect non-read requests", async () => {
		const { env, get } = setup(404);
		const request = new IncomingRequest(source, { method: "POST", body: "payload" });
		expect((await worker.fetch(request, env, createExecutionContext())).status).toBe(404);
		expect(get).not.toHaveBeenCalled();
	});

	it("fails open when KV is unavailable", async () => {
		const { env } = setup(404);
		vi.spyOn(env.REDIRECTS, "get").mockRejectedValue(new Error("KV unavailable"));
		expect((await worker.fetch(new IncomingRequest(source), env, createExecutionContext())).status).toBe(404);
	});

	it("matches only the named AI referrer hosts", () => {
		for (const host of ["chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com", "www.chatgpt.com"]) {
			expect(isAiReferrer(`https://${host}/answer`)).toBe(true);
		}
		for (const host of ["evilchatgpt.com", "chatgpt.com.evil.test", "example.com"]) {
			expect(isAiReferrer(`https://${host}/answer`)).toBe(false);
		}
		expect(isAiReferrer("not-a-url")).toBe(false);
		expect(redirectKey(new URL(source))).toBe("redirect:v1:example.com:/old");
	});
});
