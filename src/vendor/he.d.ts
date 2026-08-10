declare module "he" {
  export type DecodeOptions = {
    isAttributeValue?: boolean;
    strict?: boolean;
  };

  export function decode(text: string, options?: DecodeOptions): string;
}

