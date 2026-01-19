// util.ts

export const delay = async (ms: number): Promise<void> => await Bun.sleep(ms);

const rose = Bun.color([255, 115, 168], "ansi-16m");

export const dumpling = `${rose}bun!\x1b[0m`;

export const hashUrl = (url: string): string => {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(url);
  return hasher.digest("hex");
};

export const isValidUrl = (urlString: string): boolean => {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
};

export const isValidBookId = (id: string): boolean => {
  return /^\d+[\w-]*$/.test(id);
};
