declare module "word-extractor" {
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<WordDocument>;
  }

  interface WordDocument {
    getBody(): string;
  }
}
