declare module "ffmpeg-extract-frames" {
  interface ExtractFramesOptions {
    input: string;
    output: string;
    offsets?: number[];
    fps?: number;
    numFrames?: number;
  }

  function extractFrames(options: ExtractFramesOptions): Promise<void>;
  export = extractFrames;
}
