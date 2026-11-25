// Docker multiplexes stdout/stderr on one stream: each frame is an 8-byte header
// [streamType, 0, 0, 0, size (uint32 big-endian)] followed by `size` bytes.
export class FrameParser {
  constructor(onFrame) {
    this.onFrame = onFrame; // (streamType: 1|2, payload: Buffer)
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.buffer.length >= 8) {
      const size = this.buffer.readUInt32BE(4);
      if (this.buffer.length < 8 + size) break;
      this.onFrame(this.buffer[0], this.buffer.subarray(8, 8 + size));
      this.buffer = this.buffer.subarray(8 + size);
    }
  }
}
