import { getSapEnv } from "@/lib/env";

interface SapSessionState {
  cookieHeader: string;
  expiresAt: number;
}

let sessionState: SapSessionState | null = null;

async function fetchWithContext(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown network error";
    throw new Error(`SAP Service Layer request failed for ${url}: ${reason}`);
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function extractCookieHeader(setCookie: string[] | null): string {
  if (!setCookie || setCookie.length === 0) {
    throw new Error("SAP Service Layer login failed: no Set-Cookie header found.");
  }

  const cookieParts = setCookie.map((value) => value.split(";")[0]).filter(Boolean);
  return cookieParts.join("; ");
}

async function login(): Promise<SapSessionState> {
  const sapEnv = getSapEnv();
  const baseUrl = normalizeBaseUrl(sapEnv.sapServiceLayerBaseUrl);
  const response = await fetchWithContext(`${baseUrl}/Login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      CompanyDB: sapEnv.sapCompanyDb,
      UserName: sapEnv.sapUsername,
      Password: sapEnv.sapPassword,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SAP Service Layer login failed (${response.status}): ${body}`);
  }

  const setCookie = response.headers.getSetCookie?.() ?? null;
  const cookieHeader = extractCookieHeader(setCookie);

  // Service Layer session is usually valid for ~30 minutes unless configured differently.
  return {
    cookieHeader,
    expiresAt: Date.now() + 25 * 60 * 1000,
  };
}

async function getSessionCookie(): Promise<string> {
  if (!sessionState || Date.now() > sessionState.expiresAt) {
    sessionState = await login();
  }
  return sessionState.cookieHeader;
}

function buildUrl(path: string): string {
  const sapEnv = getSapEnv();
  const baseUrl = normalizeBaseUrl(sapEnv.sapServiceLayerBaseUrl);
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${baseUrl}${path}`;
  }
  return `${baseUrl}/${path}`;
}

export async function requestSapServiceLayer(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const cookie = await getSessionCookie();

  const headers = new Headers(init.headers);
  headers.set("Cookie", cookie);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetchWithContext(buildUrl(path), {
    ...init,
    headers,
  });

  // Re-login once if session expired.
  if (response.status === 401) {
    sessionState = await login();
    headers.set("Cookie", sessionState.cookieHeader);
    response = await fetchWithContext(buildUrl(path), {
      ...init,
      headers,
    });
  }

  return response;
}

export async function getSapList(path: string): Promise<unknown[]> {
  const response = await requestSapServiceLayer(path, { method: "GET" });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SAP Service Layer GET failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { value?: unknown[] } | unknown[];

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.value)) {
    return data.value;
  }

  return [];
}
