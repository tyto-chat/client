import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { permalinkOrigins } from "@/utils/permalinkOrigins";
import type { RemoteContentLevel } from "@/api/userPreferences";

export const REMOTE_CONTENT_LEVELS: readonly RemoteContentLevel[] = ["custom", "all"];

const HOST_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const LOCAL_SCHEMES = new Set(["data:", "blob:"]);
const sessionHosts = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface RemoteContentPolicy {
  readonly version: number;
  canAutoLoad(url: string): boolean;
}

let snapshot: RemoteContentPolicy = { version, canAutoLoad };

function currentPolicy(): RemoteContentPolicy {
  if (snapshot.version !== version) snapshot = { version, canAutoLoad };
  return snapshot;
}

export function useRemoteContentPolicy(): RemoteContentPolicy {
  return useSyncExternalStore(subscribe, currentPolicy, currentPolicy);
}

export function isRemoteContentLevel(value: unknown): value is RemoteContentLevel {
  return (REMOTE_CONTENT_LEVELS as readonly unknown[]).includes(value);
}

export function getRemoteContentLevel(): RemoteContentLevel {
  const stored = localStorage.getItem(STORAGE_KEYS.REMOTE_CONTENT);
  return isRemoteContentLevel(stored) ? stored : "custom";
}

export function setRemoteContentLevel(level: RemoteContentLevel): void {
  localStorage.setItem(STORAGE_KEYS.REMOTE_CONTENT, level);
  notify();
}

export function getRemoteContentHosts(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.REMOTE_CONTENT_HOSTS) ?? "[]",
    );
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string") : [];
  } catch {
    return [];
  }
}

export function setRemoteContentHosts(hosts: string[]): void {
  localStorage.setItem(STORAGE_KEYS.REMOTE_CONTENT_HOSTS, JSON.stringify(hosts));
  notify();
}

export function normalizeHost(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "").replace(/\/.*$/, "");
  return HOST_RE.test(host) ? host : null;
}

const SECOND_LEVEL_SUFFIXES = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);

export function topDomain(host: string): string {
  const labels = host.split(".");
  const tld = labels.at(-1) ?? "";
  const second = labels.at(-2) ?? "";
  const keep = tld.length === 2 && SECOND_LEVEL_SUFFIXES.has(second) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

export function addRemoteContentHost(domain: string): string[] {
  const hosts = getRemoteContentHosts();
  const next = hosts.includes(domain) ? hosts : [...hosts, domain];
  setRemoteContentHosts(next);
  return next;
}

export function hostMatches(host: string, entry: string): boolean {
  return host === entry || host.endsWith(`.${entry}`);
}

export function remoteHost(url: string): string | null {
  try {
    return new URL(url, window.location.origin).hostname || null;
  } catch {
    return null;
  }
}

export function _resetSessionHostsForTests(): void {
  sessionHosts.clear();
}

export function allowHostForSession(host: string): void {
  sessionHosts.add(host);
  notify();
}

export function canAutoLoad(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    return false;
  }
  if (LOCAL_SCHEMES.has(parsed.protocol)) return true;
  if (permalinkOrigins().includes(parsed.origin)) return true;
  const host = parsed.hostname;
  if (sessionHosts.has(host)) return true;
  if (getRemoteContentLevel() === "all") return true;
  return getRemoteContentHosts().some((entry) => hostMatches(host, entry));
}

export interface RemoteImageLabels {
  load(host: string): string;
  always(domain: string): string;
}

export function gateRemoteImages(
  html: string,
  labels: RemoteImageLabels,
  policy: RemoteContentPolicy = currentPolicy(),
): string {
  if (!html.includes("<img")) return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  for (const img of Array.from(div.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (policy.canAutoLoad(src)) continue;
    const host = remoteHost(src) ?? "?";
    const gate = document.createElement("span");
    gate.className = "remote-image-gate";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "remote-image-placeholder";
    load.dataset.remoteSrc = src;
    load.textContent = labels.load(host);
    const always = document.createElement("button");
    always.type = "button";
    always.className = "remote-image-placeholder remote-image-always";
    always.dataset.remoteHost = topDomain(host);
    always.textContent = labels.always(topDomain(host));
    gate.append(load, always);
    img.replaceWith(gate);
  }
  return div.innerHTML;
}

export function revealRemoteImage(button: HTMLButtonElement): void {
  const host = remoteHost(button.dataset.remoteSrc ?? "");
  if (host) allowHostForSession(host);
}
