/** Minimal push-based async iterable, so parallel turns can interleave their events. */
export class Channel<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = [];
  private readonly waiting: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiting.shift();
    if (waiter) waiter({ value, done: false });
    else this.buffer.push(value);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiting.splice(0)) waiter({ value: undefined, done: true });
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift()!;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<T>>((resolve) => this.waiting.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }
}
