export class QueueFullError extends Error {}

// Limits how many sandboxes run at once; extra jobs wait, up to maxQueue.
export class Semaphore {
  constructor(max, maxQueue) {
    this.max = max;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.waiting = [];
  }

  async acquire() {
    if (this.active < this.max) {
      this.active += 1;
      return () => this.#release();
    }
    if (this.waiting.length >= this.maxQueue) throw new QueueFullError('Too many runs in progress');
    await new Promise((resolve) => this.waiting.push(resolve));
    return () => this.#release();
  }

  #release() {
    const next = this.waiting.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else this.active -= 1;
  }
}
