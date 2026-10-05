import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JulesClient, JulesAPIError } from "../api/jules-client.js";

describe("JulesClient Resiliency", () => {
  let client: JulesClient;

  beforeEach(() => {
    vi.stubEnv("JULES_API_KEY", "test-key");
    vi.stubEnv("JULES_API_TIMEOUT_MS", "500");
    vi.stubEnv("JULES_API_MAX_RETRIES", "2");
    client = new JulesClient();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("constructor throws if no API key", () => {
    vi.stubEnv("JULES_API_KEY", "");
    expect(() => new JulesClient()).toThrow(/JULES_API_KEY/);
  });

  it("should retry on transient 5xx errors and eventually succeed", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: vi.fn().mockResolvedValue("Server is busy"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ sources: [] }),
      });

    const response = await client.listSources();
    expect(response).toEqual({ sources: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should retry on AbortError (timeout) and eventually succeed", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortError).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ sources: [] }),
    });

    const response = await client.listSources();
    expect(response).toEqual({ sources: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should throw after max retries are exceeded", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: vi.fn().mockResolvedValue("Offline"),
    });

    await expect(client.listSources()).rejects.toThrow(JulesAPIError);
    // 1 initial attempt + 2 retries = 3 total
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("should not retry on 4xx errors", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vi.fn().mockResolvedValue("Invalid prompt"),
    });

    await expect(client.listSources()).rejects.toThrow(JulesAPIError);
    // Should fail immediately without retrying
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should truncate long error bodies", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    const longError = "A".repeat(1000);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: vi.fn().mockResolvedValue(longError),
    });

    try {
      await client.listSources();
    } catch (e) {
      expect(e).toBeInstanceOf(JulesAPIError);
      const apiError = e as JulesAPIError;
      expect(apiError.response as string).toContain("... [truncated]");
      expect((apiError.response as string).length).toBeLessThan(600); // 500 + length of '... [truncated]'
    }
  });

  it("should throw immediately if error is an instance of JulesAPIError and not retry", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    // Throwing JulesAPIError directly will trigger the early re-throw in catch block
    mockFetch.mockRejectedValueOnce(new JulesAPIError("Direct API Error", 400));

    await expect(client.listSources()).rejects.toThrow(JulesAPIError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should throw generic network error if unknown error is thrown and max retries exceeded", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("Unknown generic error"));

    await expect(client.listSources()).rejects.toThrow(
      "Network error: Unknown generic error",
    );
    // 1 initial + max retries
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe("JulesClient Methods", () => {
  let client: JulesClient;

  beforeEach(() => {
    vi.stubEnv("JULES_API_KEY", "test-key");
    client = new JulesClient();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const mockSuccess = (data: unknown = {}) => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(data),
      text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    });
  };

  it("getSource", async () => {
    mockSuccess({ name: "test" });
    await expect(client.getSource("sources/test")).resolves.toEqual({
      name: "test",
    });
  });

  it("createSession", async () => {
    mockSuccess({ id: "1" });
    await expect(client.createSession({ prompt: "test" })).resolves.toEqual({
      id: "1",
    });
  });

  it("listSessions", async () => {
    mockSuccess({ sessions: [] });
    await expect(client.listSessions(10, "token")).resolves.toEqual({
      sessions: [],
    });
  });

  it("getSession", async () => {
    mockSuccess({ id: "1" });
    await expect(client.getSession("1")).resolves.toEqual({ id: "1" });
  });

  it("approvePlan", async () => {
    mockSuccess({ id: "1", state: "IN_PROGRESS" });
    await expect(client.approvePlan("1")).resolves.toEqual({
      id: "1",
      state: "IN_PROGRESS",
    });
  });

  it("sendMessage", async () => {
    mockSuccess({ id: "1" });
    await expect(client.sendMessage("1", { prompt: "hello" })).resolves.toEqual(
      { id: "1" },
    );
  });

  it("listActivities", async () => {
    mockSuccess({ activities: [] });
    await expect(client.listActivities("1", 10, "token")).resolves.toEqual({
      activities: [],
    });
  });

  it("listActivitiesSince", async () => {
    mockSuccess({ activities: [] });
    await expect(
      client.listActivitiesSince("1", "2025-01-01", 10),
    ).resolves.toEqual({ activities: [] });
  });

  it("listActivitiesSince filters activities client-side and does not pass filter param", async () => {
    const mockActivities = [
      {
        name: "sessions/1/activities/act-old",
        createTime: "2026-08-11T12:00:00Z",
        originator: "agent",
      },
      {
        name: "sessions/1/activities/act-new",
        createTime: "2026-08-12T12:00:00Z",
        originator: "agent",
      },
      {
        name: "sessions/1/activities/act-ts",
        timestamp: "2026-08-13T12:00:00Z",
        originator: "agent",
      },
    ];
    mockSuccess({ activities: mockActivities });
    const result = await client.listActivitiesSince(
      "1",
      "2026-08-12T00:00:00Z",
      50,
    );
    expect(result.activities).toHaveLength(2);
    expect(result.activities![0].name).toBe("sessions/1/activities/act-new");
    expect(result.activities![1].name).toBe("sessions/1/activities/act-ts");

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("pageSize=50");
    expect(requestedUrl).not.toContain("filter=");
  });

  it("deleteSession", async () => {
    mockSuccess();
    await expect(client.deleteSession("1")).resolves.toEqual({});
  });

  it("rejectPlan", async () => {
    mockSuccess();
    await expect(client.rejectPlan("1")).resolves.toEqual({});
  });
});
