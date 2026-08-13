export interface PlatformBridge {
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  config: {
    get(): Promise<string | null>;
    set(json: string): Promise<void>;
  };
}
